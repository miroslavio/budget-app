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
import { isPensionAccountType, savingsAccountTypeLabel } from '../services/savingsAccountService.js';
import { savingsGoalMetrics, plannedSavingsBudgetItems } from '../services/savingsService.js';
import { buildFlexibleSpendingByMonth, plannedSpendingCategorySeries } from '../services/spendingBudgetService.js';
import { taxYearForDate, taxYearRange } from '../services/taxYearService.js';
import { addMonths, currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { escapeHtml, formatCurrency, movementStat, page, stat, ownerLabel, varianceLabel } from '../views/html.js';
import {
  dashboardSavingsAllocationChart,
  dashboardSpendingPressureChart,
  incomeAllocationSankeyChart
} from '../views/charts.js';
import { renderSetupChecklist } from '../views/setupChecklist.js';
import { html } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerDashboardRoutes(router, db) {
  router.get('/dashboard', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const selectedMonth = ctx.query.get('month') || currentMonth();
    const selectedPeriod = ctx.query.get('period') || 'this_month';
    const selectedFlowOwner = ctx.query.get('flow_owner') || 'household';
    const household = findHouseholdById(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, ctx.user.household_id);
    const requestedFlowOwners = dashboardFlowOwners(members, selectedFlowOwner);
    const activeFlowOwner = requestedFlowOwners.some((owner) => owner.active) ? selectedFlowOwner : 'household';
    const flowOwners = dashboardFlowOwners(members, activeFlowOwner);
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
      months: report.months,
      owner: activeFlowOwner
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
      plannedFlexibleSpendingPence: report.plannedFlexibleSpendingPence,
      plannedExpenseSeries,
      forecastData: buildDashboardForecastData({
        planningItems,
        household,
        savingsAccounts,
        period,
        expenseItems: items,
        categoryBudgetDefaults,
        categoryBudgetOverrides
      }),
      period,
      periodMonths: report.months,
      selectedMonth,
      selectedFlowOwner: activeFlowOwner
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
              ${periodPill('/dashboard', 'this_month', 'This month', period.key, selectedMonth, activeFlowOwner)}
              ${periodPill('/dashboard', 'next_month', 'Next month', period.key, selectedMonth, activeFlowOwner)}
              ${periodPill('/dashboard', 'next_3_months', 'Next 3 months', period.key, selectedMonth, activeFlowOwner)}
              ${periodPill('/dashboard', 'last_3_months', 'Last 3 months', period.key, selectedMonth, activeFlowOwner)}
              ${periodPill('/dashboard', 'tax_year', 'Tax year', period.key, selectedMonth, activeFlowOwner)}
              ${periodPill('/dashboard', 'specific_month', 'Pick month', period.key, selectedMonth, activeFlowOwner)}
            </nav>
            ${period.key === 'specific_month' ? dashboardSpecificMonthControls(selectedMonth, activeFlowOwner) : ''}
            <div class="dashboard-owner-scope">
              <span>View</span>
              ${dashboardFlowOwnerPills(flowOwners, period, selectedMonth)}
            </div>
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
  plannedFlexibleSpendingPence,
  plannedExpenseSeries,
  forecastData,
  period,
  periodMonths,
  selectedMonth,
  selectedFlowOwner
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
      ${planningDashboardContent({
        planned,
        members,
        goals,
        savingsAccounts,
        items,
        plannedFlexibleSpendingPence,
        plannedExpenseSeries,
        forecastData,
        hasActualData: false,
        selectedFlowOwner,
        period,
        periodMonths,
        selectedMonth
      })}
      ${optionalActualsPrompt()}
    </div>`;
  }

  return `<div class="dashboard-state active-state">
    ${planningDashboardContent({
      planned,
      members,
      goals,
      savingsAccounts,
      items,
      plannedFlexibleSpendingPence,
      plannedExpenseSeries,
      forecastData,
      hasActualData: true,
      selectedFlowOwner,
      period,
      periodMonths,
      selectedMonth
    })}
    <section class="card">
      <h2>Plan vs actual</h2>
      ${actualSummaryCards(actual)}
      <div class="dashboard-actuals-grid">
        ${varianceSummaryCard(variance)}
      </div>
    </section>
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

function planningDashboardContent({
  planned,
  members,
  goals,
  savingsAccounts,
  items,
  plannedFlexibleSpendingPence,
  plannedExpenseSeries,
  forecastData,
  hasActualData,
  selectedFlowOwner,
  period,
  periodMonths = [],
  selectedMonth
}) {
  const yearlyCostItems = yearlyItems(items);
  const requestedOwners = dashboardFlowOwners(members, selectedFlowOwner);
  const activeFlowOwner = requestedOwners.some((owner) => owner.active) ? selectedFlowOwner : 'household';
  const flowPlanned = plannedForFlowOwner(planned, activeFlowOwner, members);
  const ownerFlexibleSpendingPence = plannedSpendingForOwner(plannedFlexibleSpendingPence, activeFlowOwner, members);
  const spendingPressure = spendingPressureRows(plannedExpenseSeries, flowPlanned.plannedExpensePence);
  const savingsAllocation = savingsAllocationRows(savingsAccounts, flowPlanned, activeFlowOwner, members, periodMonths.length || 1);
  const retirementAllocationPence = retirementAllocationForOwner(savingsAccounts, activeFlowOwner, members, periodMonths.length || 1);
  const moneyFlow = moneyFlowSegments(flowPlanned, retirementAllocationPence);

  return `${plannedSummaryCards(flowPlanned, ownerFlexibleSpendingPence)}
    ${householdMoneyFlowCard(flowPlanned, moneyFlow)}
    <section class="grid two dashboard-analysis-grid">
      ${spendingPressureCard(spendingPressure)}
      ${savingsAllocationCard(savingsAllocation)}
    </section>
    <section class="grid two dashboard-analysis-grid">
      ${insightsCard({
        planned: flowPlanned,
        spendingPressure,
        yearlyCostItems,
        forecastData,
        hasActualData
      })}
      ${goals.length ? `<section class="card">
        <h2>Savings goal progress</h2>
        <div class="goal-list">${goals.map((goal) => goalProgress(goal)).join('')}</div>
      </section>` : ''}
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

function moneyFlowSegments(planned, retirementAllocationPence = 0) {
  const income = Math.max(0, Number(planned.plannedIncomePence || 0));
  const spending = Math.max(0, Number(planned.plannedExpensePence || 0));
  const totalSavings = Math.max(0, Number(planned.plannedSavingsPence || 0));
  const retirement = Math.max(0, Math.min(totalSavings, Number(retirementAllocationPence || 0)));
  const savings = Math.max(0, totalSavings - retirement);
  const available = Math.max(0, Number(planned.plannedSurplusPence || 0));
  const shortfall = Math.max(0, 0 - Number(planned.plannedSurplusPence || 0));
  const safeIncome = income || 1;
  return [
    { key: 'spending', label: 'Planned spending', amountPence: spending, share: spending / safeIncome, tone: 'spending', icon: '↗', note: 'Regular costs and variable estimates' },
    { key: 'savings', label: 'Savings', amountPence: savings, share: savings / safeIncome, tone: 'saving', icon: '◎', note: 'Non-retirement planned savings' },
    { key: 'retirement', label: 'Retirement', amountPence: retirement, share: retirement / safeIncome, tone: 'retirement', icon: '◌', note: 'Pension and long-term saving' },
    shortfall > 0
      ? { key: 'shortfall', label: 'Shortfall after plan', amountPence: shortfall, share: shortfall / safeIncome, tone: 'bad', icon: '!', note: 'Plan exceeds income' }
      : { key: 'available', label: 'Available after plan', amountPence: available, share: available / safeIncome, tone: 'good', icon: '✓', note: 'Unallocated cash remaining' }
  ];
}

function householdMoneyFlowCard(planned, segments) {
  const spending = Number(segments.find((segment) => segment.key === 'spending')?.amountPence || 0);
  const savings = Number(segments.find((segment) => segment.key === 'savings')?.amountPence || 0);
  const retirement = Number(segments.find((segment) => segment.key === 'retirement')?.amountPence || 0);
  const available = Number(segments.find((segment) => segment.key === 'available')?.amountPence || 0);
  const shortfall = Number(segments.find((segment) => segment.key === 'shortfall')?.amountPence || 0);
  return `<section class="card chart-card">
    <div class="card-heading compact">
      <div>
        <h2>Household money flow</h2>
      </div>
    </div>
    ${incomeAllocationSankeyChart({
      plannedIncomePence: planned.plannedIncomePence,
      spendingPence: spending,
      savingsPence: savings,
      retirementPence: retirement,
      availablePence: available,
      shortfallPence: shortfall
    })}
  </section>`;
}

function spendingPressureRows(series = [], totalPlannedSpendingPence = 0) {
  const total = Math.max(
    Number(totalPlannedSpendingPence || 0),
    series.reduce((sum, row) => sum + Number(row.value || 0), 0),
    1
  );
  return [...series]
    .filter((row) => Number(row.value || 0) > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 6)
    .map((row) => ({
      label: row.label,
      valuePence: Number(row.value || 0),
      percentage: Math.round((Number(row.value || 0) / total) * 100)
    }));
}

function spendingPressureCard(rows) {
  if (!rows.length) return '';
  return `<section class="card">
    <h2>Spending pressure</h2>
    ${dashboardSpendingPressureChart(rows)}
  </section>`;
}

function savingsAllocationRows(accounts, planned, owner = 'household', members = [], periodMonthCount = 1) {
  const periodMultiplier = Math.max(1, Number(periodMonthCount || 1));
  const rows = accounts
    .filter((account) => Number(account.is_active) === 1)
    .map((account) => {
      const valuePence = accountContributionForOwner(Number(account.monthly_contribution_pence || 0), account, owner, members) * periodMultiplier;
      const topUpPence = accountContributionForOwner(
        Number(isPensionAccountType(account.account_type) && account.account_type !== 'defined_benefit_pension' ? account.employer_monthly_contribution_pence || 0 : 0),
        account,
        owner,
        members
      ) * periodMultiplier;
      return {
        label: account.name,
        valuePence,
        topUpPence,
        typeLabel: savingsAccountTypeLabel(account.account_type)
      };
    })
    .filter((row) => row.valuePence > 0 || row.topUpPence > 0)
    .sort((a, b) => (b.valuePence + b.topUpPence) - (a.valuePence + a.topUpPence));

  if (rows.length) return rows;
  if (Number(planned.plannedSavingsPence || 0) > 0) {
    return [{ label: 'Planned savings', valuePence: Number(planned.plannedSavingsPence || 0), topUpPence: 0, typeLabel: 'Savings' }];
  }
  return [];
}

function savingsAllocationCard(rows) {
  if (!rows.length) return '';
  return `<section class="card">
    <h2>Savings allocation</h2>
    ${dashboardSavingsAllocationChart(rows)}
  </section>`;
}

function insightsCard({ planned, spendingPressure, yearlyCostItems, forecastData, hasActualData }) {
  const insights = [];
  const surplus = Number(planned.plannedSurplusPence || 0);
  if (surplus < 0) {
    insights.push(`You are over-allocated by ${formatCurrency(Math.abs(surplus))}.`);
  } else {
    insights.push(`You have ${formatCurrency(surplus)} available after the current plan.`);
  }
  if (Number(planned.plannedIncomePence || 0) > 0) {
    insights.push(`Planned savings are ${Math.round((Number(planned.plannedSavingsPence || 0) / Number(planned.plannedIncomePence || 1)) * 100)}% of income.`);
  }
  if (spendingPressure[0]) {
    insights.push(`${spendingPressure[0].label} is your largest planned cost at ${formatCurrency(spendingPressure[0].valuePence)}.`);
  }
  const yearlyMonthly = yearlyItemsLabel(yearlyMonthlyEquivalentPence(yearlyCostItems));
  if (yearlyCostItems.length) {
    insights.push(`Yearly costs add ${yearlyMonthly.replace('/month from annual items', '/month')} to the plan.`);
  }
  if (forecastData?.forecast?.length) {
    insights.push(
      forecastData.negativeMonthsCount
        ? `The cashflow forecast drops below zero in ${forecastData.negativeMonthsCount} month${forecastData.negativeMonthsCount === 1 ? '' : 's'}.`
        : 'The cashflow forecast remains positive across the selected period.'
    );
  }
  if (!hasActualData) {
    insights.push('No actuals recorded: showing a plan-only dashboard.');
  }
  return `<section class="card dashboard-insights-card">
    <h2>Insights</h2>
    <ul class="bullet-list">
      ${insights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
    </ul>
  </section>`;
}

function optionalActualsPrompt() {
  return `<section class="card plan-empty-state">
    <h2>Want to compare your plan with reality?</h2>
    <p>Record or import actuals to unlock planned versus actual reporting.</p>
    <div class="button-list">
      <a class="button" href="/transactions">Start tracking actuals</a>
      <a class="button secondary" href="/csv">Import bank statement</a>
    </div>
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

function buildDashboardForecastData({
  planningItems,
  household,
  savingsAccounts,
  period,
  expenseItems = [],
  categoryBudgetDefaults = [],
  categoryBudgetOverrides = []
}) {
  const forecastWindow = forecastWindowForDashboard(period);
  const forecastMonths = Array.from({ length: forecastWindow.months }, (_, index) =>
    addMonths(forecastWindow.startMonth, index)
  );
  const flexibleSpendingByMonth = buildFlexibleSpendingByMonth(
    forecastMonths,
    categoryBudgetDefaults,
    categoryBudgetOverrides,
    expenseItems
  );
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
  const hasForecastData = forecast.some(
    (row) =>
      row.expectedIncomePence > 0 ||
      row.expectedExpensesPence > 0 ||
      row.expectedSavingsPence > 0 ||
      row.openingBalancePence !== 0
  );
  if (!hasForecastData) return null;

  const finalRow = forecast.at(-1);
  const lowestRow = forecast.reduce(
    (lowest, row) => (row.closingBalancePence < lowest.closingBalancePence ? row : lowest),
    forecast[0]
  );

  return {
    spendableStartingBalancePence,
    forecastAdjustmentPence,
    forecast,
    finalRow,
    lowestRow,
    negativeMonthsCount: forecast.filter((row) => row.closingBalancePence < 0).length
  };
}

function forecastWindowForDashboard(period) {
  const dashboardStartMonth = currentMonth();
  switch (period.key) {
    case 'next_month':
      return { startMonth: addMonths(dashboardStartMonth, 1), months: 1 };
    case 'next_3_months':
      return { startMonth: dashboardStartMonth, months: 3 };
    case 'tax_year': {
      const endMonth = period.range.end.slice(0, 7);
      return {
        startMonth: dashboardStartMonth,
        months: inclusiveMonthDistance(dashboardStartMonth, endMonth)
      };
    }
    case 'specific_month':
      return { startMonth: period.range.label, months: 1 };
    case 'last_3_months':
      return { startMonth: dashboardStartMonth, months: 3 };
    case 'this_month':
    default:
      return { startMonth: dashboardStartMonth, months: 1 };
  }
}

function inclusiveMonthDistance(startMonth, endMonth) {
  const [startYear, startValue] = String(startMonth).split('-').map(Number);
  const [endYear, endValue] = String(endMonth).split('-').map(Number);
  const startIndex = startYear * 12 + startValue;
  const endIndex = endYear * 12 + endValue;
  return Math.max(1, endIndex - startIndex + 1);
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
      description: 'Add actual income, spending, and savings movements so the Dashboard can compare plan with reality.',
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
    case 'next_3_months': {
      const startMonth = thisMonth;
      const endMonth = addMonths(thisMonth, 2);
      return {
        key: periodKey,
        startMonth,
        range: {
          start: monthRange(startMonth).start,
          end: monthRange(endMonth).end,
          label: `${startMonth} to ${endMonth}`,
          periodType: 'custom'
        },
        summaryLabel: `Next 3 months · ${monthLabel(startMonth)} to ${monthLabel(endMonth)}`
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

function periodPill(basePath, periodKey, label, selectedPeriod, selectedMonth, selectedFlowOwner = 'household') {
  const params = new URLSearchParams({
    period: periodKey,
    month: selectedMonth,
    flow_owner: selectedFlowOwner
  });
  const active = selectedPeriod === periodKey;
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${basePath}?${params.toString()}">${escapeHtml(label)}</a>`;
}

function dashboardSpecificMonthControls(month, selectedFlowOwner = 'household') {
  const inputId = 'dashboard-month-input';
  return `<form method="get" action="/dashboard" class="budget-plan-month-form" data-submit-on-change>
    <input type="hidden" name="period" value="specific_month">
    <input type="hidden" name="flow_owner" value="${escapeHtml(selectedFlowOwner)}">
    <input id="${inputId}" class="budget-plan-month-input" type="month" name="month" value="${escapeHtml(month)}" aria-label="Pick month">
  </form>
  <div class="budget-plan-month-controls" role="group" aria-label="Dashboard month">
    <a class="period-pill budget-plan-month-step" href="/dashboard?period=specific_month&month=${encodeURIComponent(previousMonth(month))}&flow_owner=${encodeURIComponent(selectedFlowOwner)}" aria-label="Previous month">
      <span aria-hidden="true">&lsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-current-month-button" data-open-month-picker="${inputId}" aria-label="Pick month" title="Pick month">
      ${escapeHtml(monthLabel(month))}
    </button>
    <a class="period-pill budget-plan-month-step" href="/dashboard?period=specific_month&month=${encodeURIComponent(nextMonth(month))}&flow_owner=${encodeURIComponent(selectedFlowOwner)}" aria-label="Next month">
      <span aria-hidden="true">&rsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-month-step" data-open-month-picker="${inputId}" aria-label="Open month picker" title="Open month picker">
      ${calendarIcon()}
    </button>
  </div>`;
}

function dashboardFlowOwners(members, selectedOwner = 'household') {
  const owners = [{ value: 'household', label: 'Shared household', active: selectedOwner === 'household' }];
  const firstMember = members.find((member) => member.person_key === 'person_a');
  const secondMember = members.find((member) => member.person_key === 'person_b');
  if (firstMember) {
    owners.push({
      value: 'person_a',
      label: firstMember.display_name || ownerLabel('person_a', members),
      active: selectedOwner === 'person_a'
    });
  }
  if (secondMember) {
    owners.push({
      value: 'person_b',
      label: secondMember.display_name || ownerLabel('person_b', members),
      active: selectedOwner === 'person_b'
    });
  }
  return owners;
}

function dashboardFlowOwnerPills(owners, period, selectedMonth) {
  return `<div class="period-pills view-toggle-pills">
    ${owners
      .map((owner) => {
        const params = new URLSearchParams({
          period: period.key,
          month: selectedMonth,
          flow_owner: owner.value
        });
        return `<a class="period-pill${owner.active ? ' active' : ''}" ${owner.active ? 'aria-current="page"' : ''} href="/dashboard?${params.toString()}">${escapeHtml(owner.label)}</a>`;
      })
      .join('')}
  </div>`;
}

function plannedForFlowOwner(planned, owner, members = []) {
  if (owner === 'household') return planned;

  const direct = planned.byOwner?.[owner] || { income: 0, expense: 0, savings: 0 };
  const shared = planned.byOwner?.shared || { income: 0, expense: 0, savings: 0 };
  const plannedIncomePence = Number(direct.income || 0) + sharedOwnerShare(Number(shared.income || 0), owner, members);
  const plannedExpensePence = Number(direct.expense || 0) + sharedOwnerShare(Number(shared.expense || 0), owner, members);
  const plannedSavingsPence = Number(direct.savings || 0) + sharedOwnerShare(Number(shared.savings || 0), owner, members);
  return {
    ...planned,
    plannedIncomePence,
    plannedExpensePence,
    plannedSavingsPence,
    plannedSurplusPence: plannedIncomePence - plannedExpensePence - plannedSavingsPence
  };
}

function plannedSpendingForOwner(amountPence, owner, members = []) {
  if (owner === 'household') return Number(amountPence || 0);
  return sharedOwnerShare(Number(amountPence || 0), owner, members);
}

function retirementAllocationForOwner(accounts, owner, members = [], periodMonthCount = 1) {
  const periodMultiplier = Math.max(1, Number(periodMonthCount || 1));
  const activePensions = accounts.filter(
    (account) => Number(account.is_active) === 1 && isPensionAccountType(account.account_type) && account.account_type !== 'defined_benefit_pension'
  );
  if (owner === 'household') {
    return activePensions.reduce((sum, account) => sum + Number(account.monthly_contribution_pence || 0), 0) * periodMultiplier;
  }
  return activePensions.reduce((sum, account) => {
    const contribution = Number(account.monthly_contribution_pence || 0);
    if (account.owner_type === owner) return sum + contribution;
    if (account.owner_type === 'shared') return sum + sharedOwnerShare(contribution, owner, members);
    return sum;
  }, 0) * periodMultiplier;
}

function accountContributionForOwner(amountPence, account, owner, members = []) {
  const amount = Number(amountPence || 0);
  if (owner === 'household') return amount;
  if (account.owner_type === owner) return amount;
  if (account.owner_type === 'shared') return sharedOwnerShare(amount, owner, members);
  return 0;
}

function sharedOwnerShare(amountPence, owner, members = []) {
  if (owner !== 'person_a' && owner !== 'person_b') return 0;
  const hasSecondMember = members.some((member) => member.person_key === 'person_b');
  if (!hasSecondMember) return owner === 'person_a' ? amountPence : 0;
  const personAShare = Math.round(amountPence / 2);
  return owner === 'person_a' ? personAShare : amountPence - personAShare;
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

function yearlyMonthlyEquivalentPence(items) {
  return items.reduce((sum, item) => sum + Number(item.monthly_equivalent_pence || 0), 0);
}

function yearlyItemsLabel(monthlyEquivalentPence) {
  return monthlyEquivalentPence > 0 ? `${formatCurrency(monthlyEquivalentPence)}/month from annual items` : 'None';
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
