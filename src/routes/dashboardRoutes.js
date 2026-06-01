import { findHouseholdById, updateHouseholdSettings } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listSavingsGoalAccountLinks } from '../repositories/savingsGoalAccountRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { listCategoryBudgets, listCategoryBudgetDefaults } from '../repositories/categoryBudgetRepository.js';
import { yearlyItems } from '../services/budgetService.js';
import { buildMonthlyForecast, deriveForecastStartingBalance, spendableHouseholdBalancePence } from '../services/forecastService.js';
import { buildPeriodReport } from '../services/reportService.js';
import { savingsGoalMetrics, plannedSavingsBudgetItems } from '../services/savingsService.js';
import { buildFlexibleSpendingByMonth, plannedSpendingCategorySeries } from '../services/spendingBudgetService.js';
import { taxYearForDate, taxYearRange } from '../services/taxYearService.js';
import { addMonths, currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { escapeHtml, formatCurrency, movementStat, page, stat, ownerLabel, varianceLabel } from '../views/html.js';
import { pieChart } from '../views/charts.js';
import { renderSetupChecklist } from '../views/setupChecklist.js';
import { html } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerDashboardRoutes(router, db) {
  router.get('/dashboard', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const selectedMonth = ctx.query.get('month') || currentMonth();
    const selectedPeriod = ctx.query.get('period') || 'this_month';
    const household = findHouseholdById(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, ctx.user.household_id);
    const items = listActiveBudgetItems(db, household.id);
    const savingsAccounts = listSavingsAccounts(db, household.id, { activeOnly: true });
    const goalLinks = listSavingsGoalAccountLinks(db, household.id);
    const goals = decorateGoalsWithLinkedAccounts(
      listSavingsGoals(db, household.id),
      goalLinks,
      savingsAccounts
    );
    const categoryBudgetDefaults = listCategoryBudgetDefaults(db, household.id);
    const categoryBudgetOverrides = listCategoryBudgets(db, household.id);
    const planningItems = [...items, ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const period = resolveDashboardPeriod(selectedPeriod, selectedMonth);
    const transactions = listTransactions(db, household.id, { startDate: period.range.start, endDate: period.range.end });
    const allTransactions = listTransactions(db, household.id);
    const report = applyFlexibleSpendingToReport(
      buildPeriodReport({ items: planningItems, transactions, range: period.range }),
      categoryBudgetDefaults,
      categoryBudgetOverrides,
      items
    );
    const { planned, actual, variance } = report;
    const plannedExpenseSeries = plannedSpendingCategorySeries({
      expenseItems: items,
      defaultBudgets: categoryBudgetDefaults,
      monthBudgets: categoryBudgetOverrides,
      months: report.months
    });
    const hasPlannedData =
      planned.plannedIncomePence > 0 ||
      planned.plannedExpensePence > 0 ||
      planned.plannedSavingsPence > 0 ||
      report.plannedFlexibleSpendingPence > 0;
    const hasActualData = actual.actualIncomePence > 0 || actual.actualExpensePence > 0 || actual.actualSavingsPence > 0;
    const checklistItems = setupChecklistItems({
      ctx,
      household,
      members,
      items,
      goals,
      savingsAccounts,
      categoryBudgetDefaults,
      categoryBudgetOverrides,
      transactions: allTransactions
    });
    const setupChecklist = renderSetupChecklist(checklistItems);
    const budgetPlanReady = checklistItems.filter((item) => !item.optional).every((item) => item.complete);
    const dashboardContent = dashboardStateContent({
      setupChecklist,
      budgetPlanReady,
      hasPlannedData,
      hasActualData,
      planned,
      actual,
      variance,
      items,
      goals,
      members,
      planningItems,
      household,
      savingsAccounts,
      flexibleSpendingByMonth: report.flexibleSpendingByMonth,
      plannedFlexibleSpendingPence: report.plannedFlexibleSpendingPence,
      plannedExpenseSeries,
      period,
      selectedMonth
    });

    html(
      ctx.res,
      page(ctx, {
        title: 'Dashboard',
        wide: true,
        body: `<div class="dashboard-layout">
        <section class="page-title dashboard-toolbar">
          <div>
            <h1>Dashboard</h1>
            <p class="dashboard-period-label">${escapeHtml(period.summaryLabel)}</p>
          </div>
          <div class="dashboard-toolbar-controls">
            <nav class="period-pills" aria-label="Dashboard period">
              ${periodPill('/dashboard', 'this_month', 'This month', period.key, selectedMonth)}
              ${periodPill('/dashboard', 'next_month', 'Next month', period.key, selectedMonth)}
              ${periodPill('/dashboard', 'last_3_months', 'Last 3 months', period.key, selectedMonth)}
              ${periodPill('/dashboard', 'tax_year', 'Tax year', period.key, selectedMonth)}
              ${periodPill('/dashboard', 'specific_month', 'Pick month', period.key, selectedMonth)}
            </nav>
            ${period.key === 'specific_month' ? dashboardSpecificMonthControls(selectedMonth) : ''}
          </div>
        </section>

        ${dashboardContent}
        </div>`
      })
    );
  });

  router.post('/dashboard/planned-savings-skip', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: household.name,
        openingBalancePence: household.opening_balance_pence,
        forecastAdjustmentPence: household.forecast_adjustment_pence,
        skipPlannedSavings: 1
      });
      redirectWithSuccess(ctx.res, '/dashboard', 'Planned savings skipped for now. You can add them later.');
    } catch (error) {
      redirectWithError(ctx.res, '/dashboard', error);
    }
  });
}

function dashboardStateContent({
  setupChecklist,
  budgetPlanReady,
  hasPlannedData,
  hasActualData,
  planned,
  actual,
  variance,
  items,
  goals,
  members,
  planningItems,
  household,
  savingsAccounts,
  flexibleSpendingByMonth,
  plannedFlexibleSpendingPence,
  plannedExpenseSeries,
  period,
  selectedMonth
}) {
  if (!budgetPlanReady) {
    return `<div class="dashboard-state setup-state">
      ${setupChecklist}
    </div>`;
  }

  if (!hasPlannedData) {
    return dashboardEmptyState();
  }

  if (!hasActualData) {
    const yearlyCostItems = yearlyItems(items);
    return `<div class="dashboard-state plan-ready-state">
      ${plannedSummaryCards(planned, plannedFlexibleSpendingPence)}
      ${forecastSnapshot(planningItems, household, savingsAccounts, flexibleSpendingByMonth, period)}
      <section class="grid two">
        ${yearlyCostItems.length ? `<div class="card">
          <h2>Yearly costs smoothed monthly</h2>
          ${yearlyTable(yearlyCostItems)}
        </div>` : ''}
        ${ownershipSnapshotCard(planned, members, { fullWidth: !yearlyCostItems.length })}
      </section>
      ${goals.length ? `<section class="card">
        <h2>Savings goal progress</h2>
        <div class="goal-list">${goals.map((goal) => goalProgress(goal)).join('')}</div>
      </section>` : ''}
      <section class="card plan-empty-state">
        <h2>Want to compare your plan with reality?</h2>
        <p>Record or import actuals to unlock planned versus actual reporting.</p>
        <div class="button-list">
          <a class="button" href="/transactions">Start tracking actuals</a>
          <a class="button secondary" href="/csv">Import bank statement</a>
        </div>
      </section>
    </div>`;
  }

  return `<div class="dashboard-state active-state">
    ${plannedSummaryCards(planned, plannedFlexibleSpendingPence)}
    ${actualSummaryCards(actual)}
    ${forecastSnapshot(planningItems, household, savingsAccounts, flexibleSpendingByMonth, period)}
    ${categoryBreakdownCard(plannedExpenseSeries)}
    <section class="grid two">
      ${varianceSummaryCard(variance)}
      ${yearlyItems(items).length ? `<div class="card">
        <h2>Yearly costs in your plan</h2>
        ${yearlyTable(yearlyItems(items))}
      </div>` : ''}
    </section>
    ${goals.length ? `<section class="card">
      <h2>Savings goal progress</h2>
      <div class="goal-list">${goals.map((goal) => goalProgress(goal)).join('')}</div>
    </section>` : ''}
    ${ownershipSnapshotCard(planned, members)}
  </div>`;
}

function plannedSummaryCards(planned, plannedFlexibleSpendingPence = 0) {
  const committedPlannedSpendingPence = Math.max(0, Number(planned.plannedExpensePence || 0) - Number(plannedFlexibleSpendingPence || 0));
  return `<section class="grid four">
    ${stat('Planned income', planned.plannedIncomePence, 'good')}
    ${stat('Planned spending', planned.plannedExpensePence, '', `Regular ${formatCurrency(committedPlannedSpendingPence)} · Variable estimate ${formatCurrency(plannedFlexibleSpendingPence)}`)}
    ${stat('Planned savings', planned.plannedSavingsPence, 'good')}
    ${movementStat('Available after plan', planned.plannedSurplusPence)}
  </section>`;
}

function actualSummaryCards(actual) {
  return `<section class="grid four">
    ${stat('Actual income', actual.actualIncomePence, 'good')}
    ${stat('Actual spending', actual.actualExpensePence)}
    ${stat('Actual savings', actual.actualSavingsPence)}
    ${movementStat('Actual monthly movement', actual.actualSurplusPence, 'Actual income minus actual spending and actual savings movements for the selected period.')}
  </section>`;
}

function varianceSummaryCard(variance) {
  return `<div class="card">
    <h2>Variance summary</h2>
    <table>
      <tbody>
        <tr><th>Income variance</th><td>${varianceLabel(variance.incomeVariancePence, 'income')}</td></tr>
        <tr><th>Spending variance</th><td>${varianceLabel(variance.expenseVariancePence, 'expense')}</td></tr>
        <tr><th>Savings variance</th><td>${varianceLabel(variance.savingsVariancePence, 'savings')}</td></tr>
        <tr><th>Available amount variance</th><td>${varianceLabel(variance.surplusVariancePence, 'surplus')}</td></tr>
      </tbody>
    </table>
  </div>`;
}

function categoryBreakdownCard(plannedExpenseSeries) {
  if (!plannedExpenseSeries.length) return '';
  return `<section class="card chart-card" id="planned-expenses-chart">
    <div class="card-heading">
      <div>
        <h2>Planned spending by category</h2>
      </div>
    </div>
        ${pieChart(plannedExpenseSeries, { title: 'Planned spending by category', emptyMessage: 'Add planned spending to build this chart.' })}
  </section>`;
}

function forecastSnapshot(planningItems, household, savingsAccounts, flexibleSpendingByMonth, period) {
  const forecastWindow = forecastWindowForPeriod(period);
  const spendableStartingBalancePence = spendableHouseholdBalancePence(savingsAccounts);
  const forecastAdjustmentPence = Number(household.forecast_adjustment_pence || 0);
  const forecast = applyFlexibleSpendingToForecast(
    buildMonthlyForecast({
      items: planningItems,
      startMonth: forecastWindow.startMonth,
      months: forecastWindow.months,
      openingBalancePence: deriveForecastStartingBalance({
        accounts: savingsAccounts,
        adjustmentPence: forecastAdjustmentPence
      })
    }),
    flexibleSpendingByMonth
  );
  const hasForecastData = forecast.some((row) => row.expectedIncomePence > 0 || row.expectedExpensesPence > 0 || row.expectedSavingsPence > 0);
  if (!hasForecastData) return '';

  const finalRow = forecast.at(-1);
  const lowestRow = forecast.reduce((lowest, row) => (row.closingBalancePence < lowest.closingBalancePence ? row : lowest), forecast[0]);
  return `<section class="grid three">
    <div class="stat">
      <span>Spendable starting balance</span>
      <strong>${formatCurrency(forecast[0].openingBalancePence)}</strong>
      <small class="plan-stat-note">Accounts ${formatCurrency(spendableStartingBalancePence)}${forecastAdjustmentPence ? ` · Adjustment ${formatCurrency(forecastAdjustmentPence)}` : ''}</small>
    </div>
    <div class="stat ${finalRow.closingBalancePence < 0 ? 'bad' : finalRow.closingBalancePence > 0 ? 'good' : ''}">
      <span>Projected balance at end of forecast</span>
      <strong>${formatCurrency(finalRow.closingBalancePence)}</strong>
      <small class="plan-stat-note">After ${escapeHtml(monthLabel(finalRow.month))}</small>
    </div>
    <div class="stat ${lowestRow.closingBalancePence < 0 ? 'bad' : ''}">
      <span>Lowest projected balance</span>
      <strong>${formatCurrency(lowestRow.closingBalancePence)}</strong>
      <small class="plan-stat-note">${escapeHtml(monthLabel(lowestRow.month))}</small>
    </div>
  </section>`;
}

function forecastWindowForPeriod(period) {
  switch (period.key) {
    case 'next_month':
      return { startMonth: period.range.label, months: 1 };
    case 'last_3_months':
      return { startMonth: period.startMonth, months: 3 };
    case 'tax_year':
      return { startMonth: period.startMonth, months: 12 };
    case 'specific_month':
      return { startMonth: period.range.label, months: 1 };
    case 'this_month':
    default:
      return { startMonth: period.range.label, months: 1 };
  }
}

function applyFlexibleSpendingToReport(report, categoryBudgetDefaults, categoryBudgetOverrides, items) {
  const flexibleSpendingByMonth = buildFlexibleSpendingByMonth(report.months, categoryBudgetDefaults, categoryBudgetOverrides, items);
  const plannedFlexibleSpendingPence = [...flexibleSpendingByMonth.values()].reduce((sum, value) => sum + value, 0);
  const planned = {
    ...report.planned,
    plannedExpensePence: report.planned.plannedExpensePence + plannedFlexibleSpendingPence,
    plannedSurplusPence:
      report.planned.plannedIncomePence -
      (report.planned.plannedExpensePence + plannedFlexibleSpendingPence) -
      report.planned.plannedSavingsPence,
    byOwner: {
      ...report.planned.byOwner,
      shared: {
        ...report.planned.byOwner.shared,
        expense: report.planned.byOwner.shared.expense + plannedFlexibleSpendingPence
      }
    }
  };

  return {
    ...report,
    planned,
    variance: {
      ...report.variance,
      expenseVariancePence: report.actual.actualExpensePence - planned.plannedExpensePence,
      surplusVariancePence: report.actual.actualSurplusPence - planned.plannedSurplusPence
    },
    plannedFlexibleSpendingPence,
    flexibleSpendingByMonth
  };
}

function applyFlexibleSpendingToForecast(forecast, flexibleSpendingByMonth = new Map()) {
  if (!forecast.length) return forecast;

  let openingBalancePence = Number(forecast[0].openingBalancePence || 0);
  return forecast.map((row) => {
    const flexibleSpendingPence = Number(flexibleSpendingByMonth.get(row.month) || 0);
    const expectedExpensesPence = Number(row.expectedExpensesPence || 0) + flexibleSpendingPence;
    const netMovementPence = Number(row.expectedIncomePence || 0) - expectedExpensesPence - Number(row.expectedSavingsPence || 0);
    const closingBalancePence = openingBalancePence + netMovementPence;
    const adjustedRow = {
      ...row,
      openingBalancePence,
      expectedExpensesPence,
      netMovementPence,
      closingBalancePence
    };
    openingBalancePence = closingBalancePence;
    return adjustedRow;
  });
}

function ownershipSnapshotCard(planned, members, options = {}) {
  const rows = Object.entries(planned.byOwner).filter(([owner, totals]) => {
    if (owner === 'person_b' && !members.some((member) => member.person_key === 'person_b')) {
      return totals.income || totals.expense || totals.savings;
    }
    return true;
  });
  if (!rows.length) return '';

  return `<section class="card ${options.fullWidth ? 'grid-span-two' : ''}">
    <h2>Ownership snapshot</h2>
    <table class="data-table financial-table ownership-table">
      <thead><tr><th>Owner</th><th>Planned income</th><th>Planned spending</th><th>Planned savings</th></tr></thead>
      <tbody>
        ${rows
          .map(
            ([owner, totals]) =>
              `<tr><td>${escapeHtml(ownerLabel(owner, members))}</td><td>${formatCurrency(totals.income)}</td><td>${formatCurrency(totals.expense)}</td><td>${formatCurrency(totals.savings)}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>
  </section>`;
}

function setupChecklistItems({
  ctx,
  household,
  members,
  items,
  goals,
  savingsAccounts,
  categoryBudgetDefaults,
  categoryBudgetOverrides,
  transactions
}) {
  const hasIncome = items.some((item) => item.item_type === 'income');
  const hasBills = items.some((item) => item.item_type === 'expense');
  const hasFlexibleTargets = categoryBudgetDefaults.length > 0 || categoryBudgetOverrides.length > 0;
  const hasSpendingBudgets = hasBills || hasFlexibleTargets;
  const hasSavingsContributions =
    goals.some((goal) => Number(goal.monthly_contribution_pence || 0) > 0) ||
    savingsAccounts.some((account) => Number(account.monthly_contribution_pence || 0) > 0);
  const hasSkippedPlannedSavings = Number(household.skip_planned_savings || 0) === 1;

  return [
    {
      title: 'Add household members',
      description: 'Add the second member if this is a two-person household budget.',
      href: '/settings',
      action: 'Open settings',
      optional: true,
      complete: members.length >= 2
    },
    {
      title: 'Add planned income',
      description: 'Add expected salary, regular income, or estimated take-home pay.',
      href: '/budget-plan/income',
      action: 'Add income',
      complete: hasIncome
    },
    {
      title: 'Add planned spending',
      description: 'Add the planned spending you expect, such as rent, council tax, utilities, groceries, transport, and subscriptions.',
      href: '/budget-plan/spending',
      action: 'Add planned spending',
      complete: hasSpendingBudgets
    },
    {
      title: 'Add planned savings contributions',
      description: 'Include personal savings contributions from household income if they should reduce available cash, or skip this for now.',
      href: '/budget-plan/planned-savings',
      complete: hasSavingsContributions || hasSkippedPlannedSavings,
      actionHtml: savingsChecklistActions(ctx)
    },
    {
      title: 'Review forecast adjustment',
      description: 'Forecast starts from balances in accounts marked for household cashflow. Add an adjustment if those balances need a small correction.',
      href: '/forecast',
      action: 'Open forecast',
      optional: true,
      complete:
        savingsAccounts.some((account) => Number(account.is_active ?? 1) && Number(account.available_for_household_cashflow || 0)) ||
        Number(household.forecast_adjustment_pence || 0) !== 0
    },
    {
      title: 'Start tracking actuals',
      description: 'Add actual income, spending, and savings movements so reports can compare plan with reality.',
      href: '/transactions',
      action: 'Open actuals',
      optional: true,
      complete: transactions.length > 0
    }
  ];

  function savingsChecklistActions(currentCtx) {
    if (hasSavingsContributions || hasSkippedPlannedSavings) return '';
    return `<a class="button secondary" href="/budget-plan/planned-savings">Add planned savings</a>
      <form method="post" action="/dashboard/planned-savings-skip">
        ${currentCtx ? `<input type="hidden" name="_csrf" value="${escapeHtml(currentCtx.csrfToken || '')}">` : ''}
        <button type="submit" class="button secondary">Skip for now</button>
      </form>`;
  }
}

function dashboardEmptyState() {
  return `<section class="card plan-empty-state">
    <h2>No budget plan yet</h2>
    <p>Your budget is not fully set up yet. Add planned income, planned spending, and savings to see a useful monthly position and forecast.</p>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/spending">Add planned spending</a>
      <a class="button" href="/budget-plan/planned-savings">Add planned savings</a>
    </div>
  </section>`;
}

function resolveDashboardPeriod(periodKey, selectedMonth) {
  const thisMonth = currentMonth();
  const currentTaxYear = taxYearForDate(todayIso());

  switch (periodKey) {
    case 'next_month': {
      const month = addMonths(thisMonth, 1);
      return {
        key: periodKey,
        range: { ...monthRange(month), label: month, periodType: 'month' },
        summaryLabel: `Next month · ${monthLabel(month)}`
      };
    }
    case 'last_3_months': {
      const startMonth = addMonths(thisMonth, -2);
      const endMonth = thisMonth;
      return {
        key: periodKey,
        startMonth,
        range: {
          start: monthRange(startMonth).start,
          end: monthRange(endMonth).end,
          label: `${startMonth} to ${endMonth}`,
          periodType: 'custom'
        },
        summaryLabel: `Last 3 months · ${monthLabel(startMonth)} to ${monthLabel(endMonth)}`
      };
    }
    case 'tax_year': {
      const taxYearStartMonth = currentTaxYear.split('-')[0] + '-04';
      return {
        key: periodKey,
        startMonth: taxYearStartMonth,
        range: {
          ...taxYearRange(currentTaxYear),
          label: currentTaxYear,
          periodType: 'tax_year'
        },
        summaryLabel: `Tax year · ${currentTaxYear.replace('-', ' to ')}`
      };
    }
    case 'specific_month': {
      return {
        key: periodKey,
        startMonth: selectedMonth,
        range: { ...monthRange(selectedMonth), label: selectedMonth, periodType: 'month' },
        summaryLabel: `${monthLabel(selectedMonth)}`
      };
    }
    case 'this_month':
    default:
      return {
        key: 'this_month',
        startMonth: thisMonth,
        range: { ...monthRange(thisMonth), label: thisMonth, periodType: 'month' },
        summaryLabel: `This month · ${monthLabel(thisMonth)}`
      };
  }
}

function periodPill(basePath, periodKey, label, selectedPeriod, selectedMonth) {
  const params = new URLSearchParams({
    period: periodKey,
    month: selectedMonth
  });
  const active = selectedPeriod === periodKey;
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${basePath}?${params.toString()}">${escapeHtml(label)}</a>`;
}

function dashboardSpecificMonthControls(month) {
  const inputId = 'dashboard-month-input';
  return `<form method="get" action="/dashboard" class="budget-plan-month-form" data-submit-on-change>
    <input type="hidden" name="period" value="specific_month">
    <input id="${inputId}" class="budget-plan-month-input" type="month" name="month" value="${escapeHtml(month)}" aria-label="Pick month">
  </form>
  <div class="budget-plan-month-controls" role="group" aria-label="Dashboard month">
    <a class="period-pill budget-plan-month-step" href="/dashboard?period=specific_month&month=${encodeURIComponent(previousMonth(month))}" aria-label="Previous month">
      <span aria-hidden="true">&lsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-current-month-button" data-open-month-picker="${inputId}" aria-label="Pick month" title="Pick month">
      ${escapeHtml(monthLabel(month))}
    </button>
    <a class="period-pill budget-plan-month-step" href="/dashboard?period=specific_month&month=${encodeURIComponent(nextMonth(month))}" aria-label="Next month">
      <span aria-hidden="true">&rsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-month-step" data-open-month-picker="${inputId}" aria-label="Open month picker" title="Open month picker">
      ${calendarIcon()}
    </button>
  </div>`;
}

function previousMonth(month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, (monthNumber || 1) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber || 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function calendarIcon() {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
    <rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 3.8v3.4M16 3.8v3.4M4 9.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8.2 13h2.6M13.2 13h2.6M8.2 16.5h2.6M13.2 16.5h2.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function yearlyTable(items) {
  if (!items.length) return '<p class="empty">No yearly active items.</p>';
  return `<table class="data-table">
    <thead><tr><th>Name</th><th>Yearly amount</th><th>Monthly equivalent</th></tr></thead>
    <tbody>${items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.name)}</td><td>${formatCurrency(item.amount_pence)}</td><td>${formatCurrency(item.monthly_equivalent_pence)}</td></tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function decorateGoalsWithLinkedAccounts(goals, linkedAccountRows, accounts = []) {
  const accountsById = new Map(accounts.map((account) => [String(account.id), account]));
  const linkedAccountsByGoalId = new Map();

  for (const row of linkedAccountRows) {
    const key = String(row.goal_id);
    const current = linkedAccountsByGoalId.get(key) || [];
    const account = accountsById.get(String(row.savings_account_id));

    if (account) {
      current.push(account);
    }

    linkedAccountsByGoalId.set(key, current);
  }

  return goals.map((goal) => {
    const linkedAccounts = linkedAccountsByGoalId.get(String(goal.id)) || [];

    return {
      ...goal,
      linkedAccounts,
      metrics: savingsGoalMetrics(goal, {
        linkedAccounts,
        startMonth: currentMonth()
      })
    };
  });
}

function goalProgress(goal) {
  const progress = goal.metrics || savingsGoalMetrics(goal, {
    linkedAccounts: goal.linkedAccounts || [],
    startMonth: currentMonth()
  });

  return `<article class="goal">
    <div class="goal-head">
      <strong>${escapeHtml(goal.name)}</strong>
      <span>${formatCurrency(progress.currentSavedPence)} of ${formatCurrency(goal.target_amount_pence)}</span>
    </div>
    <progress value="${progress.progressPercentage}" max="100"></progress>
    <small class="goal-meta">${progress.progressPercentage}% · ${escapeHtml(progress.statusLabel)}</small>
  </article>`;
}
