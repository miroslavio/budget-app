import { findHouseholdById, updateHouseholdSettings } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { listCategoryBudgets, listCategoryBudgetDefaults } from '../repositories/categoryBudgetRepository.js';
import { yearlyItems } from '../services/budgetService.js';
import { effectiveCategoryBudgets } from '../services/categoryBudgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { buildMonthlyForecast } from '../services/forecastService.js';
import { buildPeriodReport } from '../services/reportService.js';
import { savingsGoalProgress, plannedSavingsBudgetItems } from '../services/savingsService.js';
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
    const goals = listSavingsGoals(db, household.id);
    const savingsAccounts = listSavingsAccounts(db, household.id, { activeOnly: true });
    const categoryBudgetDefaults = listCategoryBudgetDefaults(db, household.id);
    const categoryBudgetOverrides = listCategoryBudgets(db, household.id);
    const planningItems = [...items, ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const period = resolveDashboardPeriod(selectedPeriod, selectedMonth);
    const transactions = listTransactions(db, household.id, { startDate: period.range.start, endDate: period.range.end });
    const allTransactions = listTransactions(db, household.id);
    const report = applyFlexibleSpendingToReport(
      buildPeriodReport({ items: planningItems, transactions, range: period.range }),
      categoryBudgetDefaults,
      categoryBudgetOverrides
    );
    const { planned, actual, variance } = report;
    const chartOwner = ctx.query.get('chart_owner') || 'household';
    const plannedExpenseSeries = plannedExpenseCategorySeries(items, { owner: chartOwner, months: report.months });
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
      flexibleSpendingByMonth: report.flexibleSpendingByMonth,
      plannedExpenseSeries,
      chartOwner,
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
              ${periodPill('/dashboard', 'this_month', 'This month', period.key, selectedMonth, chartOwner)}
              ${periodPill('/dashboard', 'next_month', 'Next month', period.key, selectedMonth, chartOwner)}
              ${periodPill('/dashboard', 'last_3_months', 'Last 3 months', period.key, selectedMonth, chartOwner)}
              ${periodPill('/dashboard', 'tax_year', 'Tax year', period.key, selectedMonth, chartOwner)}
              ${periodPill('/dashboard', 'specific_month', 'Pick month', period.key, selectedMonth, chartOwner)}
            </nav>
            ${period.key === 'specific_month' ? `<form method="get" action="/dashboard" class="inline-form dashboard-month-form" data-submit-on-change>
              <input type="hidden" name="period" value="specific_month">
              <input type="hidden" name="chart_owner" value="${escapeHtml(chartOwner)}">
              <label>Month <input type="month" name="month" value="${escapeHtml(selectedMonth)}"></label>
            </form>` : ''}
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
  flexibleSpendingByMonth,
  plannedExpenseSeries,
  chartOwner,
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
    return `<div class="dashboard-state plan-ready-state">
      ${plannedSummaryCards(planned)}
      ${forecastSnapshot(planningItems, household, flexibleSpendingByMonth)}
      <section class="grid two">
        ${yearlyItems(items).length ? `<div class="card">
          <h2>Yearly costs smoothed monthly</h2>
          ${yearlyTable(yearlyItems(items))}
        </div>` : ''}
        ${ownershipSnapshotCard(planned, members)}
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
    ${plannedSummaryCards(planned)}
    ${actualSummaryCards(actual)}
    ${forecastSnapshot(planningItems, household, flexibleSpendingByMonth)}
    ${categoryBreakdownCard(plannedExpenseSeries, chartOwner, period, selectedMonth, members)}
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

function plannedSummaryCards(planned) {
  return `<section class="grid four">
    ${stat('Planned income', planned.plannedIncomePence, 'good')}
    ${stat('Planned bills and spending', planned.plannedExpensePence)}
    ${stat('Planned savings', planned.plannedSavingsPence)}
    ${movementStat('Available after planned commitments', planned.plannedSurplusPence, 'Planned income minus planned bills, flexible spending targets, and planned savings.')}
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

function categoryBreakdownCard(plannedExpenseSeries, chartOwner, period, selectedMonth, members) {
  if (!plannedExpenseSeries.length) return '';
  return `<section class="card chart-card" id="planned-expenses-chart">
    <div class="card-heading">
      <div>
        <h2>Planned regular costs by category</h2>
      </div>
      <nav class="period-pills chart-owner-pills" aria-label="Spending chart view">
        ${chartOwnerPill('/dashboard', 'household', 'Household', chartOwner, period.key, selectedMonth)}
        ${chartOwnerPill('/dashboard', 'person_a', ownerLabel('person_a', members), chartOwner, period.key, selectedMonth)}
        ${members.some((member) => member.person_key === 'person_b') ? chartOwnerPill('/dashboard', 'person_b', ownerLabel('person_b', members), chartOwner, period.key, selectedMonth) : ''}
      </nav>
    </div>
    ${pieChart(plannedExpenseSeries, { title: 'Planned regular costs by category', emptyMessage: 'Add planned regular costs to build this chart.' })}
  </section>`;
}

function forecastSnapshot(planningItems, household, flexibleSpendingByMonth) {
  const forecast = applyFlexibleSpendingToForecast(
    buildMonthlyForecast({
      items: planningItems,
      startMonth: currentMonth(),
      months: 3,
      openingBalancePence: household.opening_balance_pence
    }),
    flexibleSpendingByMonth
  );
  const hasForecastData = forecast.some((row) => row.expectedIncomePence > 0 || row.expectedExpensesPence > 0 || row.expectedSavingsPence > 0);
  if (!hasForecastData) return '';

  const finalRow = forecast.at(-1);
  const lowestRow = forecast.reduce((lowest, row) => (row.closingBalancePence < lowest.closingBalancePence ? row : lowest), forecast[0]);
  return `<section class="grid three">
    ${stat('Forecast opening balance', forecast[0].openingBalancePence)}
    <div class="stat ${finalRow.closingBalancePence < 0 ? 'bad' : finalRow.closingBalancePence > 0 ? 'good' : ''}">
      <span>Forecast closing balance</span>
      <strong>${formatCurrency(finalRow.closingBalancePence)}</strong>
      <small class="plan-stat-note">After ${escapeHtml(monthLabel(finalRow.month))}</small>
    </div>
    <div class="stat ${lowestRow.closingBalancePence < 0 ? 'bad' : ''}">
      <span>Lowest forecast balance</span>
      <strong>${formatCurrency(lowestRow.closingBalancePence)}</strong>
      <small class="plan-stat-note">${escapeHtml(monthLabel(lowestRow.month))}</small>
    </div>
  </section>`;
}

function applyFlexibleSpendingToReport(report, categoryBudgetDefaults, categoryBudgetOverrides) {
  const flexibleSpendingByMonth = buildFlexibleSpendingByMonth(report.months, categoryBudgetDefaults, categoryBudgetOverrides);
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

function buildFlexibleSpendingByMonth(months, categoryBudgetDefaults, categoryBudgetOverrides) {
  return new Map(
    months.map((month) => [
      month,
      effectiveCategoryBudgets(
        categoryBudgetDefaults,
        categoryBudgetOverrides.filter((budget) => budget.budget_month === month),
        month
      ).reduce(
        (sum, budget) => sum + Number(budget.amount_pence || 0),
        0
      )
    ])
  );
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

function ownershipSnapshotCard(planned, members) {
  const rows = Object.entries(planned.byOwner).filter(([owner, totals]) => {
    if (owner === 'person_b' && !members.some((member) => member.person_key === 'person_b')) {
      return totals.income || totals.expense || totals.savings;
    }
    return true;
  });
  if (!rows.length) return '';

  return `<section class="card">
    <h2>Ownership snapshot</h2>
    <table class="data-table financial-table ownership-table">
      <thead><tr><th>Owner</th><th>Planned income</th><th>Planned bills and spending</th><th>Planned savings</th></tr></thead>
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
      title: 'Add bills and regular costs',
      description: 'Add committed costs such as rent, mortgage, council tax, utilities, subscriptions, and insurance.',
      href: '/budget-plan/bills',
      action: 'Add planned cost',
      complete: hasBills
    },
    {
      title: 'Set flexible spending targets',
      description: 'Set monthly targets for variable spending such as groceries, transport, eating out, and personal spending.',
      href: '/budget-plan/flexible-spending',
      action: 'Set targets',
      complete: hasFlexibleTargets
    },
    {
      title: 'Add planned savings contributions',
      description: 'Include personal savings contributions from household income if they should reduce available cash, or skip this for now.',
      href: '/budget-plan/planned-savings',
      complete: hasSavingsContributions || hasSkippedPlannedSavings,
      actionHtml: savingsChecklistActions(ctx)
    },
    {
      title: 'Add forecast opening balance',
      description: 'Set the cash balance available at the start of your forecast period.',
      href: '/forecast',
      action: 'Open forecast',
      optional: true,
      complete: Number(household.opening_balance_pence || 0) !== 0
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
    <p>Your budget is not fully set up yet. Add planned income, bills, flexible spending, and savings to see a useful monthly position and forecast.</p>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/bills">Add bill or regular cost</a>
      <a class="button" href="/budget-plan/flexible-spending">Add flexible spending target</a>
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
      return {
        key: periodKey,
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
        range: { ...monthRange(selectedMonth), label: selectedMonth, periodType: 'month' },
        summaryLabel: `${monthLabel(selectedMonth)}`
      };
    }
    case 'this_month':
    default:
      return {
        key: 'this_month',
        range: { ...monthRange(thisMonth), label: thisMonth, periodType: 'month' },
        summaryLabel: `This month · ${monthLabel(thisMonth)}`
      };
  }
}

function periodPill(basePath, periodKey, label, selectedPeriod, selectedMonth, chartOwner) {
  const params = new URLSearchParams({
    period: periodKey,
    month: selectedMonth,
    chart_owner: chartOwner
  });
  const active = selectedPeriod === periodKey;
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${basePath}?${params.toString()}">${escapeHtml(label)}</a>`;
}

function chartOwnerPill(basePath, ownerKey, label, selectedOwner, periodKey, selectedMonth) {
  const params = new URLSearchParams({
    period: periodKey,
    month: selectedMonth,
    chart_owner: ownerKey
  });
  const active = selectedOwner === ownerKey;
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${basePath}?${params.toString()}#planned-expenses-chart">${escapeHtml(label)}</a>`;
}

function yearlyTable(items) {
  if (!items.length) return '<p class="empty">No yearly active items.</p>';
  return `<table class="data-table">
    <thead><tr><th>Name</th><th>Type</th><th>Yearly amount</th><th>Monthly equivalent</th></tr></thead>
    <tbody>${items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.name)}</td><td>${item.item_type}</td><td>${formatCurrency(item.amount_pence)}</td><td>${formatCurrency(item.monthly_equivalent_pence)}</td></tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function goalProgress(goal) {
  const progress = savingsGoalProgress(goal);
  const status =
    progress.onTrack === null ? 'No target date' : progress.onTrack ? 'On track' : 'Behind target';
  return `<article class="goal">
    <div class="goal-head"><strong>${escapeHtml(goal.name)}</strong><span>${formatCurrency(goal.current_saved_amount_pence)} of ${formatCurrency(goal.target_amount_pence)}</span></div>
    <progress value="${progress.progressPercentage}" max="100"></progress>
    <small class="goal-meta">${progress.progressPercentage}% · ${status}</small>
  </article>`;
}
