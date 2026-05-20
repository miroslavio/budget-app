import { findHouseholdById } from '../repositories/householdRepository.js';
import { listActiveBudgetItems } from '../repositories/budgetItemRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { actualMonthlySummary, plannedMonthlySummary, varianceSummary, yearlyItems } from '../services/budgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { savingsGoalProgress, savingsGoalsAsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthLabel, monthRange } from '../utils/dates.js';
import { escapeHtml, formatCurrency, formatSignedCurrency, page, signedStat, stat, ownerLabel } from '../views/html.js';
import { pieChart } from '../views/charts.js';
import { html } from '../http/response.js';
import { ensureAuthenticated } from './helpers.js';

export function registerDashboardRoutes(router, db) {
  router.get('/dashboard', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const month = ctx.query.get('month') || currentMonth();
    const household = findHouseholdById(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, ctx.user.household_id);
    const items = listActiveBudgetItems(db, household.id);
    const goals = listSavingsGoals(db, household.id);
    const planningItems = [...items, ...savingsGoalsAsBudgetItems(goals)];
    const range = monthRange(month);
    const transactions = listTransactions(db, household.id, { startDate: range.start, endDate: range.end });
    const planned = plannedMonthlySummary(planningItems, month);
    const actual = actualMonthlySummary(transactions);
    const variance = varianceSummary(planned, actual);
    const chartOwner = ctx.query.get('chart_owner') || 'household';
    const plannedExpenseSeries = plannedExpenseCategorySeries(planningItems, { owner: chartOwner });

    html(
      ctx.res,
      page(ctx, {
        title: 'Dashboard',
        wide: true,
        body: `<section class="page-title dashboard-title">
          <div>
            <h1>${monthLabel(month)}</h1>
          </div>
          <form method="get" action="/dashboard" class="inline-form" data-submit-on-change>
            <label>Month <input type="month" name="month" value="${month}"></label>
          </form>
        </section>

        <section class="grid four">
          ${stat('Planned income', planned.plannedIncomePence, 'good')}
          ${stat('Planned expenses', planned.plannedExpensePence)}
          ${stat('Planned savings', planned.plannedSavingsPence)}
          ${signedStat('Planned surplus / deficit', planned.plannedSurplusPence)}
        </section>

        <section class="grid four">
          ${stat('Actual income', actual.actualIncomePence, 'good')}
          ${stat('Actual expenses', actual.actualExpensePence)}
          ${stat('Actual savings', actual.actualSavingsPence)}
          ${signedStat('Actual surplus / deficit', actual.actualSurplusPence)}
        </section>

        <section class="card chart-card">
          <div class="card-heading">
            <div>
              <h2>Planned monthly expenses by category</h2>
              <p class="hint">Switch between household and person views. Shared costs use their configured split.</p>
            </div>
            <form method="get" action="/dashboard" class="inline-form">
              <input type="hidden" name="month" value="${month}">
              <label>View
                <select name="chart_owner">
                  <option value="household" ${chartOwner === 'household' ? 'selected' : ''}>Household</option>
                  <option value="person_a" ${chartOwner === 'person_a' ? 'selected' : ''}>${escapeHtml(members.find((member) => member.person_key === 'person_a')?.display_name || 'Person A')}</option>
                  <option value="person_b" ${chartOwner === 'person_b' ? 'selected' : ''}>${escapeHtml(members.find((member) => member.person_key === 'person_b')?.display_name || 'Person B')}</option>
                </select>
              </label>
              <button>Update chart</button>
            </form>
          </div>
          ${pieChart(plannedExpenseSeries, { title: 'Planned monthly expenses by category', emptyMessage: 'Add planned expenses to build this chart.' })}
        </section>

        <section class="grid two">
          <div class="card">
            <h2>Variance summary</h2>
            <table>
              <tbody>
                <tr><th>Income variance</th><td>${formatSignedCurrency(variance.incomeVariancePence)}</td></tr>
                <tr><th>Expense variance</th><td>${formatSignedCurrency(variance.expenseVariancePence)}</td></tr>
                <tr><th>Savings variance</th><td>${formatSignedCurrency(variance.savingsVariancePence)}</td></tr>
                <tr><th>Surplus variance</th><td>${formatSignedCurrency(variance.surplusVariancePence)}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="card">
            <h2>Upcoming yearly costs as monthly equivalents</h2>
            ${yearlyTable(yearlyItems(items))}
          </div>
        </section>

        <section class="card">
          <h2>Savings goal progress</h2>
          ${goals.length ? `<div class="goal-list">${goals.map((goal) => goalProgress(goal)).join('')}</div>` : '<p class="empty">No savings goals yet.</p>'}
        </section>

        <section class="card">
          <h2>Ownership snapshot</h2>
          <table class="financial-table ownership-table">
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
        </section>`
      })
    );
  });
}

function yearlyTable(items) {
  if (!items.length) return '<p class="empty">No yearly active items.</p>';
  return `<table>
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
    <div><strong>${escapeHtml(goal.name)}</strong><span>${formatCurrency(goal.current_saved_amount_pence)} of ${formatCurrency(goal.target_amount_pence)}</span></div>
    <progress value="${progress.progressPercentage}" max="100"></progress>
    <small>${progress.progressPercentage}% · ${status}</small>
  </article>`;
}
