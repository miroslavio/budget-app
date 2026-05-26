import { findHouseholdById } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { yearlyItems } from '../services/budgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { buildPeriodReport } from '../services/reportService.js';
import { savingsGoalProgress, plannedSavingsBudgetItems } from '../services/savingsService.js';
import { taxYearForDate, taxYearRange } from '../services/taxYearService.js';
import { addMonths, currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { escapeHtml, formatCurrency, movementStat, page, stat, ownerLabel, varianceLabel } from '../views/html.js';
import { pieChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { ensureAuthenticated } from './helpers.js';

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
    const planningItems = [...items, ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
    const period = resolveDashboardPeriod(selectedPeriod, selectedMonth);
    const transactions = listTransactions(db, household.id, { startDate: period.range.start, endDate: period.range.end });
    const report = buildPeriodReport({ items: planningItems, transactions, range: period.range });
    const { planned, actual, variance } = report;
    const chartOwner = ctx.query.get('chart_owner') || 'household';
    const plannedExpenseSeries = plannedExpenseCategorySeries(items, { owner: chartOwner, months: report.months });
    const hasPlannedData = planned.plannedIncomePence > 0 || planned.plannedExpensePence > 0 || planned.plannedSavingsPence > 0;
    const hasActualData = actual.actualIncomePence > 0 || actual.actualExpensePence > 0 || actual.actualSavingsPence > 0;
    const hasUsefulDashboardData = hasPlannedData || hasActualData || goals.length > 0;

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

        ${hasUsefulDashboardData ? '' : dashboardEmptyState()}

        <section class="grid four">
          ${stat('Planned income', planned.plannedIncomePence, 'good')}
          ${stat('Planned expenses', planned.plannedExpensePence)}
          ${stat('Planned savings', planned.plannedSavingsPence)}
          ${movementStat('Planned surplus / deficit', planned.plannedSurplusPence, 'Planned income minus planned bills, flexible spending targets, and planned savings contributions.')}
        </section>

        <section class="grid four">
          ${stat('Actual income', actual.actualIncomePence, 'good')}
          ${stat('Actual expenses', actual.actualExpensePence)}
          ${stat('Actual savings', actual.actualSavingsPence)}
          ${movementStat('Actual monthly movement', actual.actualSurplusPence, 'Actual income minus actual spending and actual savings movements for the selected period.')}
        </section>

        <section class="card chart-card" id="planned-expenses-chart">
          <div class="card-heading">
            <div>
              <h2>Planned expenses by category</h2>
            </div>
            <nav class="period-pills chart-owner-pills" aria-label="Expense chart view">
              ${chartOwnerPill('/dashboard', 'household', 'Household', chartOwner, period.key, selectedMonth)}
              ${chartOwnerPill('/dashboard', 'person_a', ownerLabel('person_a', members), chartOwner, period.key, selectedMonth)}
              ${chartOwnerPill('/dashboard', 'person_b', ownerLabel('person_b', members), chartOwner, period.key, selectedMonth)}
            </nav>
          </div>
          ${pieChart(plannedExpenseSeries, { title: 'Planned expenses by category', emptyMessage: 'Add planned expenses to build this chart.' })}
        </section>

        <section class="grid two">
          <div class="card">
            <h2>Variance summary</h2>
            <table>
              <tbody>
                <tr><th>Income variance</th><td>${varianceLabel(variance.incomeVariancePence, 'income')}</td></tr>
                <tr><th>Expense variance</th><td>${varianceLabel(variance.expenseVariancePence, 'expense')}</td></tr>
                <tr><th>Savings variance</th><td>${varianceLabel(variance.savingsVariancePence, 'savings')}</td></tr>
                <tr><th>Surplus variance</th><td>${varianceLabel(variance.surplusVariancePence, 'surplus')}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <h2>Yearly costs in your plan</h2>
            ${yearlyTable(yearlyItems(items))}
          </div>
        </section>

        <section class="card">
          <h2>Savings goal progress</h2>
          ${goals.length ? `<div class="goal-list">${goals.map((goal) => goalProgress(goal)).join('')}</div>` : '<p class="empty">No savings goals yet.</p>'}
        </section>

        <section class="card">
          <h2>Ownership snapshot</h2>
          <table class="data-table financial-table ownership-table">
            <thead><tr><th>Owner</th><th>Planned income</th><th>Planned expenses</th><th>Planned savings</th></tr></thead>
            <tbody>
              ${Object.entries(planned.byOwner)
                  .map(
                    ([owner, totals]) =>
                    `<tr><td>${escapeHtml(ownerLabel(owner, members))}</td><td>${formatCurrency(totals.income)}</td><td>${formatCurrency(totals.expense)}</td><td>${formatCurrency(totals.savings)}</td></tr>`
                  )
                .join('')}
            </tbody>
          </table>
        </section>
        </div>`
      })
    );
  });
}

function dashboardEmptyState() {
  return `<section class="card plan-empty-state">
    <h2>No budget plan yet</h2>
    <p>Your budget is not fully set up yet. Add planned income, bills, flexible spending, and savings to see a useful monthly position and forecast.</p>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/bills">Add bill or regular cost</a>
      <a class="button" href="/budget-plan/flexible-spending">Add flexible spending target</a>
      <a class="button" href="/forecast">Set opening balance</a>
      <a class="button secondary" href="/transactions">Record or import actuals</a>
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
