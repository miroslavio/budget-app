import { createBudgetItem, deleteBudgetItem, findBudgetItemById, listActiveBudgetItems, listBudgetItems, setBudgetItemActive, updateBudgetItem, updateBudgetItemIncomeEstimate } from '../repositories/budgetItemRepository.js';
import {
  deleteCategoryBudget,
  deleteCategoryBudgetDefault,
  listCategoryBudgetDefaults,
  listCategoryBudgets,
  saveCategoryBudget,
  saveCategoryBudgetDefault
} from '../repositories/categoryBudgetRepository.js';
import { createIncomeEstimate, attachEstimateToBudgetItem, deleteIncomeEstimate, updateIncomeEstimate } from '../repositories/incomeEstimateRepository.js';
import { listCategories } from '../repositories/categoryRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { calculateMonthlyEquivalent, plannedMonthlySummary } from '../services/budgetService.js';
import { categoryBudgetComparison, categoryBudgetSummary, effectiveCategoryBudgets } from '../services/categoryBudgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { savingsAccountTypeLabel } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { estimateTakeHomePay } from '../services/takeHomePayService.js';
import { listTaxYears, latestTaxYear } from '../services/taxRulesService.js';
import { currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { optionalMoney, optionalString, parsePercentage, requireChoice, requireDecimal, requireMoney, requireString } from '../utils/validation.js';
import { actionIconButton, csrfField, escapeHtml, formatCurrency, moneyInputValue, ownerLabel, page } from '../views/html.js';
import { categoryOptions, decimalInputAttrs, frequencyOptions, moneyInputAttrs, ownerOptions, taxYearOptions } from '../views/forms.js';
import { pieChart } from '../views/charts.js';
import { html, redirect } from '../http/response.js';
import { checkboxValue, ensureAuthenticated, formDate, parseStudentLoanPlans, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerBudgetRoutes(router, db) {
  router.get('/budget-plan', (ctx) => renderBudgetPlanOverview(ctx, db));
  router.get('/budget-plan/income', (ctx) => renderIncomePlanPage(ctx, db));
  router.get('/budget-plan/bills', (ctx) => renderBillsPlanPage(ctx, db));
  router.get('/budget-plan/flexible-spending', (ctx) => renderFlexibleSpendingPlanPage(ctx, db));
  router.get('/budget-plan/planned-savings', (ctx) => renderPlannedSavingsPage(ctx, db));
  router.get('/income', (ctx) => redirect(ctx.res, `/budget-plan/income${ctx.url?.search || ''}`));
  router.get('/expenses', (ctx) => redirect(ctx.res, `/budget-plan/bills${ctx.url?.search || ''}`));
  router.post('/income', (ctx) => createIncome(ctx, db));
  router.post('/expenses', (ctx) => createExpense(ctx, db));
  router.post('/budget-item/delete', (ctx) => deleteBudgetItemAction(ctx, db));
  router.post('/expenses/category-budgets', (ctx) => createOrUpdateCategoryBudgetAction(ctx, db));
  router.post('/expenses/category-budgets/delete', (ctx) => deleteCategoryBudgetAction(ctx, db));
  router.post('/budget-item/toggle', (ctx) => toggleBudgetItem(ctx, db));
}

function renderBudgetPlanOverview(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = currentMonth();
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const activeItems = listActiveBudgetItems(db, ctx.user.household_id);
  const goals = listSavingsGoals(db, ctx.user.household_id);
  const savingsAccounts = listSavingsAccounts(db, ctx.user.household_id, { activeOnly: true });
  const planningItems = [...activeItems, ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
  const plan = plannedMonthlySummary(planningItems, month);
  const defaultBudgets = listCategoryBudgetDefaults(db, ctx.user.household_id);
  const monthBudgets = listCategoryBudgets(db, ctx.user.household_id, { startMonth: month, endMonth: month });
  const effectiveBudgets = effectiveCategoryBudgets(defaultBudgets, monthBudgets, month);
  const flexibleSpendingTargetPence = effectiveBudgets.reduce((total, budget) => total + Number(budget.amount_pence || 0), 0);
  const billsAndRegularCostsPence = plan.plannedExpensePence;
  const plannedSavingsContributionsPence = plan.plannedSavingsPence;
  const plannedSurplusPence = plan.plannedIncomePence - billsAndRegularCostsPence - flexibleSpendingTargetPence - plannedSavingsContributionsPence;

  const incomeItems = plan.activeItems.filter((item) => item.item_type === 'income');
  const expenseItems = plan.activeItems.filter((item) => item.item_type === 'expense');
  const savingsItems = plan.activeItems.filter((item) => item.item_type === 'savings');
  const hasPlanData =
    plan.plannedIncomePence > 0 ||
    billsAndRegularCostsPence > 0 ||
    flexibleSpendingTargetPence > 0 ||
    plannedSavingsContributionsPence > 0;

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan',
      wide: true,
      body: `${budgetPlanPageIntro('overview', 'Plan expected income, bills, flexible spending, and savings contributions before recording actual money movements.', `Current month · ${monthLabel(month)}`)}
      ${hasPlanData ? `${budgetPlanSummaryCards({
        plannedIncomePence: plan.plannedIncomePence,
        billsAndRegularCostsPence,
        flexibleSpendingTargetPence,
        plannedSavingsContributionsPence,
        plannedSurplusPence,
        yearlyCostsPence: yearlyMonthlyEquivalentPence(expenseItems)
      })}
      ${budgetPlanTable([
        {
          section: 'Income',
          monthlyPlannedPence: plan.plannedIncomePence,
          yearlyItemsIncluded: yearlyItemsLabel(yearlyMonthlyEquivalentPence(incomeItems)),
          ownerSummary: ownerSummary(incomeItems, members),
          actionHref: '/budget-plan/income',
          actionLabel: 'View income'
        },
        {
          section: 'Bills & Regular Costs',
          monthlyPlannedPence: billsAndRegularCostsPence,
          yearlyItemsIncluded: yearlyItemsLabel(yearlyMonthlyEquivalentPence(expenseItems)),
          ownerSummary: ownerSummary(expenseItems, members),
          actionHref: '/budget-plan/bills',
          actionLabel: 'View planned costs'
        },
        {
          section: 'Flexible spending',
          monthlyPlannedPence: flexibleSpendingTargetPence,
          yearlyItemsIncluded: '—',
          ownerSummary: effectiveBudgets.length ? 'Shared household' : '—',
          actionHref: '/budget-plan/flexible-spending',
          actionLabel: 'View spending targets'
        },
        {
          section: 'Savings contributions',
          monthlyPlannedPence: plannedSavingsContributionsPence,
          yearlyItemsIncluded: yearlyItemsLabel(yearlyMonthlyEquivalentPence(savingsItems)),
          ownerSummary: ownerSummary(savingsItems, members),
          actionHref: '/budget-plan/planned-savings',
          actionLabel: 'View planned savings'
        }
      ])}
      ${budgetPlanQuickActions()}` : budgetPlanEmptyState()}`
    })
  );
}

function renderIncomePlanPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const items = listBudgetItems(db, ctx.user.household_id, 'income');
  const returnTo = '/budget-plan/income';

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Income',
      wide: true,
      body: `${budgetPlanPageIntro('income', 'What money do we expect to receive into the household budget?')}
      <section class="action-row">
        ${formDisclosure('income', ctx, [], members, returnTo)}
      </section>
      <section class="grid one">
        <div class="card">
          <h2>Planned income</h2>
          ${itemsTable(ctx, items, members, 'income', 'No planned income yet.', returnTo)}
        </div>
      </section>`
    })
  );
}

function renderBillsPlanPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = ctx.query.get('month') || currentMonth();
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const items = listBudgetItems(db, ctx.user.household_id, 'expense');
  const activeSummary = plannedMonthlySummary(items.filter((item) => Number(item.is_active) === 1), month);
  const activeExpenseItems = activeSummary.activeItems.filter((item) => item.item_type === 'expense');
  const chartOwner = ctx.query.get('chart_owner') || 'household';
  const expenseSeries = plannedExpenseCategorySeries(items, { owner: chartOwner, months: [month] });
  const returnTo = `/budget-plan/bills?month=${encodeURIComponent(month)}&chart_owner=${encodeURIComponent(chartOwner)}`;

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Bills & Regular Costs',
      wide: true,
      body: `${budgetPlanPageIntro('bills', 'What committed household costs do we expect each month?', `Current plan · ${monthLabel(month)}`)}
      <section class="action-row">
        ${formDisclosure('expense', ctx, listCategories(db, ctx.user.household_id), members, returnTo)}
      </section>
      <section class="grid three budget-plan-bills-summary">
        <div class="stat">
          <span>Total monthly bills</span>
          <strong>${formatCurrency(activeSummary.plannedExpensePence)}</strong>
        </div>
        <div class="stat">
          <span>Yearly costs included</span>
          <strong>${formatCurrency(yearlyMonthlyEquivalentPence(activeExpenseItems))}</strong>
          <small class="plan-stat-note">Shown as monthly equivalents in the plan.</small>
        </div>
        ${planTextStat('Owner / split summary', ownerSummary(activeExpenseItems, members))}
      </section>
      <section class="card">
        <h2>Planned bills and regular costs</h2>
        ${itemsTable(ctx, items, members, 'expense', 'No planned costs yet.', returnTo)}
      </section>
      <section class="card chart-card" id="planned-spending-chart">
        <div class="card-heading">
          <div>
            <h2>Planned spending by category</h2>
            <p class="hint">A secondary view of where regular household costs sit across categories.</p>
          </div>
          <nav class="period-pills chart-owner-pills" aria-label="Bills chart view">
            ${expenseChartOwnerPill('household', 'Household', chartOwner, month, '/budget-plan/bills')}
            ${expenseChartOwnerPill('person_a', ownerLabel('person_a', members), chartOwner, month, '/budget-plan/bills')}
            ${expenseChartOwnerPill('person_b', ownerLabel('person_b', members), chartOwner, month, '/budget-plan/bills')}
          </nav>
        </div>
        ${pieChart(expenseSeries, { title: 'Planned spending by category', emptyMessage: 'Add planned costs to build this chart.' })}
      </section>`
    })
  );
}

function renderFlexibleSpendingPlanPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = ctx.query.get('month') || currentMonth();
  const categories = listCategories(db, ctx.user.household_id);
  const defaultBudgets = listCategoryBudgetDefaults(db, ctx.user.household_id);
  const monthBudgets = listCategoryBudgets(db, ctx.user.household_id, { startMonth: month, endMonth: month });
  const rows = categoryBudgetComparison(
    effectiveCategoryBudgets(defaultBudgets, monthBudgets, month),
    listTransactions(db, ctx.user.household_id, { startDate: monthRange(month).start, endDate: monthRange(month).end, type: 'expense' })
  );
  const summary = categoryBudgetSummary(rows);
  const returnTo = flexibleSpendingReturnTo(month);

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Flexible Spending',
      wide: true,
      body: `${budgetPlanPageIntro('flexible-spending', 'What variable spending targets are we setting for this month?', `Selected month · ${monthLabel(month)}`)}
      <section class="action-row">
        <form method="get" action="/budget-plan/flexible-spending" class="inline-form" data-submit-on-change>
          <label>Month <input type="month" name="month" value="${escapeHtml(month)}"></label>
        </form>
        <button type="button" data-open-modal="category-budget-modal" data-reset-modal="true">Set spending target</button>
      </section>
      <section class="grid three budget-plan-flex-summary">
        <div class="stat">
          <span>Flexible spending target</span>
          <strong>${formatCurrency(summary.totalBudgetPence)}</strong>
        </div>
        <div class="stat">
          <span>Actual spending</span>
          <strong>${formatCurrency(summary.totalActualExpensePence)}</strong>
        </div>
        ${planTextStat('Status', overallTargetStatus(summary.totalBudgetPence, summary.totalActualExpensePence))}
      </section>
      <section class="card">
        <h2>Flexible spending targets</h2>
        ${flexibleSpendingTable(ctx, rows, month, returnTo)}
      </section>
      <dialog id="category-budget-modal" class="modal" data-modal>
        <div class="modal-panel">
          <div class="modal-heading">
            <div>
              <h2>Set spending target</h2>
            </div>
            <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
          </div>
          ${categoryBudgetForm(ctx, categories.filter((category) => ['expense', 'debt'].includes(category.kind)), month, returnTo)}
        </div>
      </dialog>`
    })
  );
}

function renderPlannedSavingsPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = currentMonth();
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const goals = listSavingsGoals(db, ctx.user.household_id);
  const savingsAccounts = listSavingsAccounts(db, ctx.user.household_id, { activeOnly: true });
  const plannedSavingsItems = plannedMonthlySummary(plannedSavingsBudgetItems({ goals, accounts: savingsAccounts }), month).activeItems;
  const totalPlannedSavingsPence = plannedSavingsItems.reduce((total, item) => total + Number(item.monthly_equivalent_pence || 0), 0);

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Planned Savings',
      wide: true,
      body: `${budgetPlanPageIntro('planned-savings', 'What savings contributions are included in the monthly budget?', `Current month · ${monthLabel(month)}`)}
      <section class="action-row">
        <a class="button" href="/savings/accounts">Add savings contribution</a>
        <a class="button" href="/savings/goals">View full Savings Goals</a>
      </section>
      <section class="card">
        <h2>How planned savings works</h2>
        <p>Your own monthly savings contributions are treated as money set aside from planned income, so they reduce what is left after bills and flexible spending.</p>
        <p class="hint">Employer pension contributions and Lifetime ISA bonuses do not reduce the household budget. They are shown only in savings projections.</p>
      </section>
      <section class="grid two">
        <div class="stat">
          <span>Planned savings contributions</span>
          <strong>${formatCurrency(totalPlannedSavingsPence)}</strong>
        </div>
        <div class="stat">
          <span>Active contributions in plan</span>
          <strong>${plannedSavingsItems.length}</strong>
          <small class="plan-stat-note">${savingsAccounts.length ? 'Monthly contributions from active accounts and pots are included in the plan.' : 'Monthly contributions from active savings goals are included in the plan until you start tracking accounts and pots.'}</small>
        </div>
      </section>
      <section class="card">
        <h2>Planned savings contributions</h2>
        ${plannedSavingsTable(goals, plannedSavingsItems, members, savingsAccounts)}
      </section>`
    })
  );
}

function budgetPlanPageIntro(activeKey, context, secondaryLabel = '') {
  return `<section class="page-title">
    <div>
      <h1>Budget Plan</h1>
      <p class="page-context">${escapeHtml(context)}</p>
      ${secondaryLabel ? `<p class="dashboard-period-label">${escapeHtml(secondaryLabel)}</p>` : ''}
    </div>
  </section>
  <nav class="period-pills section-nav" aria-label="Budget plan sections">
    ${budgetPlanSectionLink('/budget-plan', 'Overview', activeKey === 'overview')}
    ${budgetPlanSectionLink('/budget-plan/income', 'Income', activeKey === 'income')}
    ${budgetPlanSectionLink('/budget-plan/bills', 'Bills & Regular Costs', activeKey === 'bills')}
    ${budgetPlanSectionLink('/budget-plan/flexible-spending', 'Flexible spending', activeKey === 'flexible-spending')}
    ${budgetPlanSectionLink('/budget-plan/planned-savings', 'Planned Savings', activeKey === 'planned-savings')}
  </nav>`;
}

function budgetPlanSectionLink(href, label, active = false) {
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${href}">${escapeHtml(label)}</a>`;
}

function budgetPlanSummaryCards({
  plannedIncomePence,
  billsAndRegularCostsPence,
  flexibleSpendingTargetPence,
  plannedSavingsContributionsPence,
  plannedSurplusPence,
  yearlyCostsPence
}) {
  const balanceLabel = plannedSurplusPence >= 0 ? 'Planned surplus' : 'Planned deficit';
  const balanceTone = plannedSurplusPence >= 0 ? 'good' : 'bad';
  return `<section class="grid four">
    ${planSummaryStat('Planned income', plannedIncomePence)}
    ${planSummaryStat('Bills & regular costs', billsAndRegularCostsPence, yearlyCostsPence > 0 ? `Yearly costs included: ${formatCurrency(yearlyCostsPence)}/month equivalent` : '')}
    ${planSummaryStat('Flexible spending target', flexibleSpendingTargetPence)}
    ${planSummaryStat('Planned savings contributions', plannedSavingsContributionsPence)}
  </section>
  <section class="card plan-balance-card ${balanceTone}">
    <span class="plan-balance-label">${balanceLabel}</span>
    <strong>${formatCurrency(Math.abs(plannedSurplusPence))}</strong>
    <p class="hint">Planned income minus planned bills, flexible spending targets, and planned savings contributions.</p>
  </section>`;
}

function planSummaryStat(label, valuePence, note = '') {
  return `<div class="stat">
    <span>${escapeHtml(label)}</span>
    <strong>${formatCurrency(valuePence)}</strong>
    ${note ? `<small class="plan-stat-note">${escapeHtml(note)}</small>` : ''}
  </div>`;
}

function planTextStat(label, text, note = '') {
  return `<div class="stat text-stat">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(text)}</strong>
    ${note ? `<small class="plan-stat-note">${escapeHtml(note)}</small>` : ''}
  </div>`;
}

function budgetPlanTable(rows) {
  return `<section class="card">
    <h2>Monthly plan</h2>
    <table class="data-table">
      <thead><tr><th>Section</th><th>Monthly planned</th><th>Yearly items included</th><th>Owner or split summary</th><th class="actions-col">Action</th></tr></thead>
      <tbody>${rows
        .map((row) => `<tr>
          <td>${escapeHtml(row.section)}</td>
          <td>${formatCurrency(row.monthlyPlannedPence)}</td>
          <td>${escapeHtml(row.yearlyItemsIncluded)}</td>
          <td>${escapeHtml(row.ownerSummary)}</td>
          <td class="actions-col"><a class="button" href="${row.actionHref}">${escapeHtml(row.actionLabel)}</a></td>
        </tr>`)
        .join('')}</tbody>
    </table>
  </section>`;
}

function budgetPlanQuickActions() {
  return `<section class="card">
    <h2>Quick actions</h2>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/bills">Add bill or regular cost</a>
      <a class="button" href="/budget-plan/flexible-spending">Add flexible spending target</a>
      <a class="button" href="/savings/accounts">Add savings contribution</a>
    </div>
  </section>`;
}

function budgetPlanEmptyState() {
  return `<section class="card plan-empty-state">
    <h2>Start your budget plan</h2>
    <p>Start by adding income, then add bills and regular costs. We&rsquo;ll calculate your planned monthly position automatically.</p>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/bills">Add bill or regular cost</a>
      <a class="button" href="/budget-plan/flexible-spending">Add flexible spending target</a>
      <a class="button" href="/savings/accounts">Add savings contribution</a>
    </div>
  </section>`;
}

function yearlyMonthlyEquivalentPence(items) {
  return items
    .filter((item) => item.frequency === 'yearly')
    .reduce((total, item) => total + Number(item.monthly_equivalent_pence || 0), 0);
}

function yearlyItemsLabel(monthlyEquivalentPence) {
  return monthlyEquivalentPence > 0 ? `${formatCurrency(monthlyEquivalentPence)}/month` : '—';
}

function ownerSummary(items, members) {
  const labels = [...new Set(items.map((item) => ownerLabel(item.owner_type, members)).filter(Boolean))];
  return labels.length ? labels.join(' + ') : '—';
}

function overallTargetStatus(targetPence, actualPence) {
  if (targetPence <= 0 && actualPence <= 0) return 'No target set';
  if (actualPence > targetPence) return `${formatCurrency(actualPence - targetPence)} over target`;
  if (actualPence < targetPence) return `${formatCurrency(targetPence - actualPence)} remaining`;
  return 'On track';
}

function plannedSavingsTable(goals, plannedSavingsItems, members, savingsAccounts = []) {
  if (savingsAccounts.length) {
    const rows = savingsAccounts.filter((account) => Number(account.is_active) === 1 && Number(account.monthly_contribution_pence || 0) > 0);
    if (!rows.length) {
      return '<p class="empty">No active savings-account contributions are currently included in the budget.</p>';
    }

    return `<table class="data-table">
      <thead><tr><th>Account or pot</th><th>Owner</th><th>Monthly contribution</th><th>Type</th><th>Projected annual rate</th></tr></thead>
      <tbody>${rows
        .map((account) => `<tr>
          <td>${escapeHtml(account.name)}</td>
          <td>${escapeHtml(ownerLabel(account.owner_type, members))}</td>
          <td>${plannedSavingsContributionCell(account)}</td>
          <td>${escapeHtml(savingsAccountTypeLabel(account.account_type))}</td>
          <td>${escapeHtml(Number(account.projected_annual_rate || 0).toFixed(2).replace(/\.00$/, ''))}%</td>
        </tr>`)
        .join('')}</tbody>
    </table>`;
  }

  const rows = goals.filter((goal) => goal.status === 'active' && Number(goal.monthly_contribution_pence || 0) > 0);
  if (!rows.length) {
    return `<p class="empty">No planned savings contributions are currently included in the budget. Add a monthly contribution to an active savings goal or start tracking savings accounts and pots.</p>`;
  }

  return `<table class="data-table">
    <thead><tr><th>Goal</th><th>Owner</th><th>Monthly contribution</th><th>Status</th><th>Target date</th></tr></thead>
    <tbody>${rows
      .map((goal) => `<tr>
        <td>${escapeHtml(goal.name)}</td>
        <td>${escapeHtml(ownerLabel(goal.owner_type, members))}</td>
        <td>${formatCurrency(Number(goal.monthly_contribution_pence || 0))}</td>
        <td>${escapeHtml(goal.status)}</td>
        <td>${escapeHtml(goal.target_date || 'No target date')}</td>
      </tr>`)
      .join('')}</tbody>
  </table>`;
}

function plannedSavingsContributionCell(account) {
  const notes = [];
  if (account.account_type === 'pension' && Number(account.employer_monthly_contribution_pence || 0) > 0) {
    notes.push(`Employer ${formatCurrency(Number(account.employer_monthly_contribution_pence || 0))}/month`);
  }
  if (account.account_type === 'lifetime_isa' && Number(account.include_lisa_bonus) === 1) {
    notes.push('25% LISA bonus in projections');
  }
  return `<div class="cell-stack">
    <strong>${formatCurrency(Number(account.monthly_contribution_pence || 0))}</strong>
    ${notes.map((note) => `<small class="hint">${escapeHtml(note)}</small>`).join('')}
  </div>`;
}

function flexibleSpendingTable(ctx, rows, month, returnTo) {
  if (!rows.length) return '<p class="empty">No flexible spending targets for this month yet.</p>';

  return `<table class="data-table category-budget-table">
    <thead><tr><th>Category</th><th>Target</th><th>Actual spending</th><th>Status</th><th>Source</th><th class="actions-col"></th></tr></thead>
    <tbody>${rows
      .map((row) => {
        const actions = row.budgetId
          ? `<div class="category-actions">
              ${actionIconButton({
                label: 'Edit spending target',
                icon: 'edit',
                variant: 'edit',
                attributes: `data-open-modal="category-budget-modal"
                data-fill-id="${escapeHtml(row.budgetId)}"
                data-fill-scope="${escapeHtml(row.budgetScope || 'default_monthly')}"
                data-fill-month="${escapeHtml(month)}"
                data-fill-category-id="${escapeHtml(row.categoryId || '')}"
                data-fill-amount="${escapeHtml((row.budgetPence / 100).toFixed(2))}"
                data-fill-notes="${escapeHtml(row.notes || '')}"`
              })}
              <form method="post" action="/expenses/category-budgets/delete" data-confirm="Delete this spending target?">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${escapeHtml(row.budgetId)}">
                <input type="hidden" name="budget_scope" value="${escapeHtml(row.budgetScope || 'default_monthly')}">
                <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
                ${actionIconButton({ label: 'Delete spending target', icon: 'delete', variant: 'delete', type: 'submit' })}
              </form>
            </div>`
          : row.categoryId
            ? actionIconButton({
              label: 'Set spending target',
              icon: 'plus',
              variant: 'add',
              attributes: `data-open-modal="category-budget-modal"
                data-reset-modal="true"
                data-fill-scope="default_monthly"
                data-fill-month="${escapeHtml(month)}"
                data-fill-category-id="${escapeHtml(row.categoryId)}"`
            })
            : '';

        return `<tr>
          <td>${escapeHtml(row.category)}</td>
          <td>${row.budgetPence ? formatCurrency(row.budgetPence) : '—'}</td>
          <td>${formatCurrency(row.actualExpensePence)}</td>
          <td>${escapeHtml(overallTargetStatus(row.budgetPence, row.actualExpensePence))}</td>
          <td>${escapeHtml(targetSourceLabel(row))}</td>
          <td class="actions-col">${actions}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
}

function flexibleSpendingReturnTo(month) {
  return `/budget-plan/flexible-spending?month=${encodeURIComponent(month)}`;
}

function targetSourceLabel(row) {
  if (!row.budgetId) return 'No target';
  if (row.budgetScope === 'month_override') return `Override for ${monthLabel(row.budgetMonth)}`;
  return 'Default target';
}

function formDisclosure(itemType, ctx, categories, members, returnTo) {
  const label = itemType === 'income' ? 'Add planned income' : 'Add planned cost';
  const modalId = `${itemType}-modal`;
  return `<button type="button" data-open-modal="${modalId}" data-reset-modal="true">${label}</button>
    <dialog id="${modalId}" class="modal" data-modal>
      <div class="modal-panel">
        <div class="modal-heading">
          <div>
            <h2>${itemType === 'income' ? 'Planned income details' : 'Planned cost details'}</h2>
          </div>
          <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
        </div>
      ${itemType === 'income' ? incomeForm(ctx, members, returnTo) : expenseForm(ctx, categories, members, returnTo)}
      </div>
    </dialog>`;
}

function categoryBudgetForm(ctx, categories, budgetMonth, returnTo) {
  return `<form method="post" action="/expenses/category-budgets" class="stack budget-form">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <section class="form-section">
      <h3>Budget details</h3>
      <label>Target type
        <select name="budget_scope" data-controls data-modal-field="scope">
          <option value="default_monthly">Default monthly target</option>
          <option value="month_override">Month-specific override</option>
        </select>
      </label>
      <div data-controlled-by="budget_scope" data-show-when="month_override" hidden>
        <label>Month <input name="budget_month" type="month" value="${escapeHtml(budgetMonth)}" data-required-when-visible="true" data-modal-field="month"></label>
      </div>
      <label>Category <select name="category_id" required data-modal-field="categoryId">${categoryOptions(categories)}</select></label>
      <label>Target amount <input name="amount" ${moneyInputAttrs({ required: true, min: '0.01' })} data-modal-field="amount"></label>
      <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <button>Save spending target</button>
  </form>`;
}
function expenseChartOwnerPill(ownerKey, label, selectedOwner, budgetMonth, basePath = '/budget-plan/bills') {
  const active = selectedOwner === ownerKey;
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${basePath}?month=${encodeURIComponent(budgetMonth)}&chart_owner=${encodeURIComponent(ownerKey)}#planned-spending-chart">${escapeHtml(label)}</a>`;
}

function incomeForm(ctx, members, returnTo) {
  const taxYears = listTaxYears();
  return `<form method="post" action="/income" class="stack budget-form">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <section class="form-section">
      <h3>Basic details</h3>
      <div class="grid two compact">
        <label>Name <input name="name" required maxlength="120" data-modal-field="name"></label>
        <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('person_a', members)}</select></label>
      </div>
    <label>Income entry mode
      <select name="income_entry_mode" data-controls data-modal-field="incomeEntryMode">
        <option value="manual_net">Manual net income</option>
        <option value="estimated_from_gross">Estimated take-home pay from gross salary</option>
      </select>
    </label>
    </section>
    <fieldset data-controlled-by="income_entry_mode" data-show-when="manual_net">
      <legend>Manual net income</legend>
      <label>Net amount <input name="manual_amount" ${moneyInputAttrs({ min: '0.01' })} data-required-when-visible="true" data-modal-field="manualAmount"></label>
      <label>Frequency <select name="manual_frequency" data-modal-field="manualFrequency">${frequencyOptions('monthly')}</select></label>
    </fieldset>
      <fieldset data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
      <legend>Estimated take-home pay</legend>
      <label>Gross annual salary <input name="gross_annual_salary" ${moneyInputAttrs({ min: '0.01' })} data-required-when-visible="true" data-modal-field="grossAnnualSalary"></label>
      <label>Pay frequency <select name="estimated_frequency" data-modal-field="estimatedFrequency">${frequencyOptions('monthly')}</select></label>
      <label>Tax year <select name="tax_year" data-modal-field="taxYear">${taxYearOptions(taxYears, latestTaxYear())}</select></label>
      <label>Student loan plan
        <select name="student_loan_plan" data-modal-field="studentLoanPlan">
          <option value="none">No undergraduate student loan</option>
          <option value="plan_1">Plan 1</option>
          <option value="plan_2">Plan 2</option>
          <option value="plan_4">Plan 4</option>
          <option value="plan_5">Plan 5</option>
        </select>
      </label>
      <label class="checkbox-line"><input type="checkbox" name="has_postgraduate_loan" data-modal-field="hasPostgraduateLoan"> Include Postgraduate Loan repayment</label>
      <label>Pension contribution type
        <select name="pension_contribution_type" data-controls data-modal-field="pensionContributionType">
          <option value="none">None</option>
          <option value="fixed_amount">Fixed annual amount</option>
          <option value="percentage">Percentage of gross salary</option>
        </select>
      </label>
      <div class="grid two compact" data-controlled-by="pension_contribution_type" data-show-when="fixed_amount|percentage" hidden>
        <label>Pension contribution value <input name="pension_contribution_value" ${decimalInputAttrs({ min: '0', max: '100000000' })} data-required-when-visible="true" data-modal-field="pensionContributionValue"></label>
        <label>Pension tax treatment
          <select name="pension_contribution_tax_treatment" data-modal-field="pensionContributionTaxTreatment">
            <option value="pre_tax">Before tax</option>
            <option value="post_tax">After tax</option>
          </select>
        </label>
      </div>
      <label>Other regular pre-tax deductions <input name="other_pre_tax_deductions" ${moneyInputAttrs()} data-modal-field="otherPreTaxDeductions"></label>
      <label>Other regular post-tax deductions <input name="other_post_tax_deductions" ${moneyInputAttrs()} data-modal-field="otherPostTaxDeductions"></label>
      <p class="hint">The saved item uses the estimated net income. The original gross salary and assumptions are stored for review.</p>
    </fieldset>
    <section class="form-section">
      <h3>Timing and notes</h3>
    <label>Start date <input name="start_date" type="date" value="${todayIso()}" data-modal-field="startDate"></label>
    <label>End date <input name="end_date" type="date" data-modal-field="endDate"></label>
    <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="button-list">
      <button name="action" value="save">Save income</button>
      <button name="action" value="preview">Preview estimate</button>
    </div>
  </form>`;
}

function expenseForm(ctx, categories, members, returnTo) {
  const expenseCategories = categories.filter((category) => ['expense', 'debt'].includes(category.kind));
  const firstMemberLabel = ownerLabel('person_a', members);
  const secondMemberLabel = ownerLabel('person_b', members);
  return `<form method="post" action="/expenses" class="stack budget-form">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <section class="form-section">
      <h3>Cost details</h3>
    <label>Name <input name="name" required maxlength="120" data-modal-field="name"></label>
    <label>Category <select name="category_id" data-modal-field="categoryId">${categoryOptions(expenseCategories)}</select></label>
    <label>Owner <select name="owner_type" data-controls data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
    <label>Amount <input name="amount" ${moneyInputAttrs({ required: true, min: '0.01' })} data-modal-field="amount" data-split-amount-source></label>
    <label>Frequency <select name="frequency" data-modal-field="frequency">${frequencyOptions('monthly')}</select></label>
    </section>
    <fieldset data-controlled-by="owner_type" data-show-when="shared">
      <legend>Shared split</legend>
      <label>Split type
        <select name="split_type" data-controls data-modal-field="splitType">
          <option value="equal">Equal split</option>
          <option value="manual_percentage">Manual percentage split</option>
        </select>
      </label>
      <div class="split-slider-card" data-controlled-by="split_type" data-show-when="manual_percentage" hidden>
        <input type="hidden" name="person_b_percentage" value="50" data-modal-field="personBPercentage" data-split-secondary-input>
        <div class="split-slider-summary">
        <div class="split-share">
          <span class="split-share-label">${escapeHtml(firstMemberLabel)}</span>
          <strong data-split-primary-output>50%</strong>
          <small class="hint" data-split-primary-amount>£0.00</small>
        </div>
        <div class="split-share split-share-end">
          <span class="split-share-label">${escapeHtml(secondMemberLabel)}</span>
          <strong data-split-secondary-output>50%</strong>
          <small class="hint" data-split-secondary-amount>£0.00</small>
        </div>
      </div>
        <input
          name="person_a_percentage"
          type="range"
          min="0"
          max="100"
          step="1"
          value="50"
          data-modal-field="personAPercentage"
          data-split-slider
          class="split-slider-input"
          aria-label="Shared expense split"
        >
      </div>
    </fieldset>
    <section class="form-section">
      <h3>Timing and notes</h3>
    <label>Start date <input name="start_date" type="date" value="${todayIso()}" data-modal-field="startDate"></label>
    <label>End date <input name="end_date" type="date" data-modal-field="endDate"></label>
    <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <button>Save expense</button>
  </form>`;
}

function itemsTable(ctx, items, members, itemType, emptyMessage = 'No items yet.', returnTo = itemType === 'income' ? '/budget-plan/income' : '/budget-plan/bills') {
  if (!items.length) return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  const showCategory = itemType !== 'income';
  return `<table class="data-table">
    <thead><tr><th>Name</th>${showCategory ? '<th>Category</th>' : ''}<th>Owner</th><th>Amount</th><th>Monthly equivalent</th><th>Status</th><th class="actions-col"></th></tr></thead>
    <tbody>${items
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.name)}</td>
          ${showCategory ? `<td>${escapeHtml(item.category_name || '')}</td>` : ''}
          <td>${escapeHtml(ownerLabel(item.owner_type, members))}</td>
          <td>${formatCurrency(item.amount_pence)} ${item.frequency}</td>
          <td>${formatCurrency(item.monthly_equivalent_pence)}</td>
          <td>${item.is_active ? 'Active' : 'Inactive'}</td>
          <td class="actions-col">
            <div class="table-actions">
              ${actionIconButton({
                label: `Edit ${item.item_type} item`,
                icon: 'edit',
                variant: 'edit',
                attributes: `data-open-modal="${item.item_type}-modal"
                data-reset-modal="true"
                ${item.item_type === 'income' ? incomeEditAttributes(item) : expenseEditAttributes(item)}`
              })}
              <form method="post" action="/budget-item/toggle">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${item.id}">
                <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
                <input type="hidden" name="is_active" value="${item.is_active ? '0' : '1'}">
                ${actionIconButton({
                  label: item.is_active ? `Deactivate ${item.item_type} item` : `Activate ${item.item_type} item`,
                  icon: item.is_active ? 'pause' : 'play',
                  variant: item.is_active ? 'warn' : 'good',
                  type: 'submit'
                })}
              </form>
              <form method="post" action="/budget-item/delete" data-confirm="Delete this ${escapeHtml(item.item_type)} item?">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${item.id}">
                <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
                ${actionIconButton({ label: `Delete ${item.item_type} item`, icon: 'delete', variant: 'delete', type: 'submit' })}
              </form>
            </div>
          </td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function incomeEditAttributes(item) {
  const studentLoanPlans = parseEstimateStudentLoanPlans(item);
  const pensionContributionValue =
    item.estimate_pension_contribution_type === 'fixed_amount'
      ? moneyInputValue(item.estimate_pension_contribution_value || 0)
      : escapeHtml(item.estimate_pension_contribution_value || '');

  return [
    `data-fill-id="${escapeHtml(item.id)}"`,
    `data-fill-name="${escapeHtml(item.name)}"`,
    `data-fill-owner-type="${escapeHtml(item.owner_type)}"`,
    `data-fill-income-entry-mode="${escapeHtml(item.income_entry_mode || 'manual_net')}"`,
    `data-fill-manual-amount="${item.income_entry_mode === 'manual_net' ? moneyInputValue(item.amount_pence) : ''}"`,
    `data-fill-manual-frequency="${escapeHtml(item.frequency || 'monthly')}"`,
    `data-fill-gross-annual-salary="${item.estimate_gross_annual_salary_pence ? moneyInputValue(item.estimate_gross_annual_salary_pence) : ''}"`,
    `data-fill-estimated-frequency="${escapeHtml(item.estimate_pay_frequency || item.frequency || 'monthly')}"`,
    `data-fill-tax-year="${escapeHtml(item.estimate_tax_year || latestTaxYear())}"`,
    `data-fill-student-loan-plan="${escapeHtml(studentLoanPlans[0] || 'none')}"`,
    `data-fill-has-postgraduate-loan="${item.estimate_has_postgraduate_loan ? 'true' : 'false'}"`,
    `data-fill-pension-contribution-type="${escapeHtml(item.estimate_pension_contribution_type || 'none')}"`,
    `data-fill-pension-contribution-value="${pensionContributionValue}"`,
    `data-fill-pension-contribution-tax-treatment="${escapeHtml(item.estimate_pension_contribution_tax_treatment || 'pre_tax')}"`,
    `data-fill-other-pre-tax-deductions="${item.estimate_other_pre_tax_deductions_pence ? moneyInputValue(item.estimate_other_pre_tax_deductions_pence) : ''}"`,
    `data-fill-other-post-tax-deductions="${item.estimate_other_post_tax_deductions_pence ? moneyInputValue(item.estimate_other_post_tax_deductions_pence) : ''}"`,
    `data-fill-start-date="${escapeHtml(item.start_date || todayIso())}"`,
    `data-fill-end-date="${escapeHtml(item.end_date || '')}"`,
    `data-fill-notes="${escapeHtml(item.notes || '')}"`
  ].join(' ');
}

function expenseEditAttributes(item) {
  return [
    `data-fill-id="${escapeHtml(item.id)}"`,
    `data-fill-name="${escapeHtml(item.name)}"`,
    `data-fill-category-id="${escapeHtml(item.category_id || '')}"`,
    `data-fill-owner-type="${escapeHtml(item.owner_type)}"`,
    `data-fill-amount="${moneyInputValue(item.amount_pence)}"`,
    `data-fill-frequency="${escapeHtml(item.frequency || 'monthly')}"`,
    `data-fill-split-type="${escapeHtml(item.split_type || 'equal')}"`,
    `data-fill-person-a-percentage="${escapeHtml(item.person_a_percentage ?? 50)}"`,
    `data-fill-person-b-percentage="${escapeHtml(item.person_b_percentage ?? 50)}"`,
    `data-fill-start-date="${escapeHtml(item.start_date || todayIso())}"`,
    `data-fill-end-date="${escapeHtml(item.end_date || '')}"`,
    `data-fill-notes="${escapeHtml(item.notes || '')}"`
  ].join(' ');
}

function createIncome(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const itemId = Number(ctx.body.id || 0) || null;
    const name = requireString(ctx.body.name, 'Name', 120);
    const ownerType = requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner');
    const incomeEntryMode = requireChoice(ctx.body.income_entry_mode, ['manual_net', 'estimated_from_gross'], 'Income entry mode');
    const existingItem = itemId ? findBudgetItemById(db, ctx.user.household_id, itemId) : null;
    if (itemId && !existingItem) throw new Error('Income item was not found.');

    if (ctx.body.action === 'preview') {
      if (incomeEntryMode !== 'estimated_from_gross') throw new Error('Preview is only available for estimated take-home pay.');
      return renderIncomeEstimatePreview(ctx, buildEstimate(ctx));
    }

    const common = {
      householdId: ctx.user.household_id,
      name,
      itemType: 'income',
      categoryId: Number(ctx.body.category_id || 0) || null,
      ownerType,
      startDate: formDate(ctx.body.start_date),
      endDate: ctx.body.end_date || null,
      notes: optionalString(ctx.body.notes),
      isActive: existingItem ? Number(existingItem.is_active) === 1 : true,
      splitType: 'equal',
      personAPercentage: 50,
      personBPercentage: 50,
      incomeEntryMode,
      createdBy: ctx.user.id
    };

    if (incomeEntryMode === 'manual_net') {
      const amountPence = requireMoney(ctx.body.manual_amount, 'Net income amount');
      const frequency = requireChoice(ctx.body.manual_frequency, ['monthly', 'yearly'], 'Frequency');
      if (existingItem?.income_estimate_id) {
        deleteIncomeEstimate(db, ctx.user.household_id, existingItem.income_estimate_id);
      }
      const payload = {
        ...common,
        amountPence,
        frequency,
        monthlyEquivalentPence: calculateMonthlyEquivalent(amountPence, frequency),
        incomeEstimateId: null
      };
      if (existingItem) {
        updateBudgetItem(db, { ...payload, id: existingItem.id });
      } else {
        createBudgetItem(db, payload);
      }
    } else {
      const estimate = buildEstimate(ctx);
      const frequency = requireChoice(ctx.body.estimated_frequency, ['monthly', 'yearly'], 'Estimated frequency');
      const amountPence = frequency === 'monthly' ? estimate.estimatedNetMonthlyIncomePence : estimate.estimatedNetAnnualIncomePence;
      const estimatePayload = {
        householdId: ctx.user.household_id,
        budgetItemId: existingItem?.id || null,
        grossAnnualSalaryPence: estimate.grossAnnualSalaryPence,
        payFrequency: frequency,
        taxYear: estimate.taxYear,
        pensionContributionType: estimate.pensionContributionType,
        pensionContributionValue: estimate.pensionContributionValue,
        pensionContributionTaxTreatment: estimate.pensionContributionTaxTreatment,
        otherPreTaxDeductionsPence: estimate.otherPreTaxDeductionsPence,
        otherPostTaxDeductionsPence: estimate.otherPostTaxDeductionsPence,
        studentLoanPlans: estimate.studentLoanPlans,
        hasPostgraduateLoan: estimate.hasPostgraduateLoan,
        estimatedIncomeTaxPence: estimate.estimatedIncomeTaxPence,
        estimatedNationalInsurancePence: estimate.estimatedNationalInsurancePence,
        estimatedStudentLoanRepaymentPence: estimate.estimatedStudentLoanRepaymentPence,
        estimatedPostgraduateLoanRepaymentPence: estimate.estimatedPostgraduateLoanRepaymentPence,
        pensionContributionPence: estimate.pensionContributionPence,
        estimatedOtherDeductionsPence: estimate.estimatedOtherDeductionsPence,
        estimatedNetMonthlyIncomePence: estimate.estimatedNetMonthlyIncomePence,
        estimatedNetAnnualIncomePence: estimate.estimatedNetAnnualIncomePence
      };
      const savedEstimate = existingItem?.income_estimate_id
        ? updateIncomeEstimate(db, { ...estimatePayload, id: existingItem.income_estimate_id })
        : createIncomeEstimate(db, estimatePayload);
      const itemPayload = {
        ...common,
        amountPence,
        frequency,
        monthlyEquivalentPence: estimate.estimatedNetMonthlyIncomePence,
        incomeEstimateId: savedEstimate.id
      };
      if (existingItem) {
        updateBudgetItem(db, { ...itemPayload, id: existingItem.id });
      } else {
        const item = createBudgetItem(db, itemPayload);
        attachEstimateToBudgetItem(db, ctx.user.household_id, savedEstimate.id, item.id);
        updateBudgetItemIncomeEstimate(db, ctx.user.household_id, item.id, savedEstimate.id);
      }
    }
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/budget-plan/income', existingItem ? 'Income updated.' : 'Income saved.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/budget-plan/income', error);
  }
}

function renderIncomeEstimatePreview(ctx, estimate) {
  html(
    ctx.res,
    page(ctx, {
      title: 'Take-home pay estimate preview',
      body: `<section class="hero compact">
        <div>
          <p class="eyebrow">Calculation preview</p>
          <h1>Estimated take-home pay</h1>
          <p>${escapeHtml(estimate.estimateNotice)}</p>
        </div>
      </section>
      <section class="card">
        <table>
          <tbody>
            <tr><th>Gross annual salary</th><td>${formatCurrency(estimate.grossAnnualSalaryPence)}</td></tr>
            <tr><th>Estimated annual Income Tax</th><td>${formatCurrency(estimate.estimatedIncomeTaxPence)}</td></tr>
            <tr><th>Estimated annual National Insurance</th><td>${formatCurrency(estimate.estimatedNationalInsurancePence)}</td></tr>
            <tr><th>Estimated annual student loan repayment</th><td>${formatCurrency(estimate.estimatedStudentLoanRepaymentPence)}</td></tr>
            <tr><th>Estimated annual Postgraduate Loan repayment</th><td>${formatCurrency(estimate.estimatedPostgraduateLoanRepaymentPence)}</td></tr>
            <tr><th>Pension contribution</th><td>${formatCurrency(estimate.pensionContributionPence)}</td></tr>
            <tr><th>Other deductions</th><td>${formatCurrency(estimate.estimatedOtherDeductionsPence)}</td></tr>
            <tr><th>Estimated annual net income</th><td><strong>${formatCurrency(estimate.estimatedNetAnnualIncomePence)}</strong></td></tr>
            <tr><th>Estimated monthly net income</th><td><strong>${formatCurrency(estimate.estimatedNetMonthlyIncomePence)}</strong></td></tr>
          </tbody>
        </table>
        <form method="post" action="/income" class="stack preview-save">
          ${csrfField(ctx)}
          ${hiddenFields(ctx.body)}
          <input type="hidden" name="action" value="save">
          <button>Save this estimate as recurring income</button>
          <a href="/budget-plan/income">Back to income</a>
        </form>
      </section>`
    })
  );
}

function hiddenFields(fields) {
  return Object.entries(fields)
    .filter(([key]) => !['_csrf', 'action'].includes(key))
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
    .join('');
}

function buildEstimate(ctx) {
  const pensionType = requireChoice(ctx.body.pension_contribution_type || 'none', ['none', 'fixed_amount', 'percentage'], 'Pension contribution type');
  const rawPensionValue = pensionType === 'none' ? '0' : ctx.body.pension_contribution_value || '0';
  const pensionContributionValue =
    pensionType === 'fixed_amount'
      ? requireMoney(rawPensionValue, 'Pension contribution value')
      : pensionType === 'percentage'
        ? requireDecimal(rawPensionValue, 'Pension contribution value', { min: 0.01, max: 100 })
        : 0;
  const grossAnnualSalaryPence = requireMoney(ctx.body.gross_annual_salary, 'Gross annual salary');

  return estimateTakeHomePay({
    grossAnnualSalaryPence,
    taxYear: requireString(ctx.body.tax_year, 'Tax year', 20),
    pensionContributionType: pensionType,
    pensionContributionValue,
    pensionContributionTaxTreatment: requireChoice(ctx.body.pension_contribution_tax_treatment || 'pre_tax', ['pre_tax', 'post_tax'], 'Pension tax treatment'),
    otherPreTaxDeductionsPence: optionalMoney(ctx.body.other_pre_tax_deductions, 'Other regular pre-tax deductions'),
    otherPostTaxDeductionsPence: optionalMoney(ctx.body.other_post_tax_deductions, 'Other regular post-tax deductions'),
    studentLoanPlans: parseStudentLoanPlans(ctx.body),
    hasPostgraduateLoan: checkboxValue(ctx.body.has_postgraduate_loan)
  });
}

function createExpense(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const itemId = Number(ctx.body.id || 0) || null;
    const existingItem = itemId ? findBudgetItemById(db, ctx.user.household_id, itemId) : null;
    if (itemId && !existingItem) throw new Error('Expense item was not found.');
    const amountPence = requireMoney(ctx.body.amount, 'Expense amount');
    const frequency = requireChoice(ctx.body.frequency, ['monthly', 'yearly'], 'Frequency');
    const ownerType = requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner');
    const splitType = ownerType === 'shared' ? requireChoice(ctx.body.split_type || 'equal', ['equal', 'manual_percentage'], 'Split type') : 'equal';
    const personAPercentage = splitType === 'manual_percentage' ? parsePercentage(ctx.body.person_a_percentage) : 50;
    const personBPercentage = splitType === 'manual_percentage' ? Math.round((100 - personAPercentage) * 100) / 100 : 50;

    const payload = {
      householdId: ctx.user.household_id,
      id: existingItem?.id,
      name: requireString(ctx.body.name, 'Name', 120),
      itemType: 'expense',
      categoryId: Number(ctx.body.category_id || 0) || null,
      ownerType,
      amountPence,
      frequency,
      monthlyEquivalentPence: calculateMonthlyEquivalent(amountPence, frequency),
      startDate: formDate(ctx.body.start_date),
      endDate: ctx.body.end_date || null,
      notes: optionalString(ctx.body.notes),
      isActive: existingItem ? Number(existingItem.is_active) === 1 : true,
      splitType,
      personAPercentage,
      personBPercentage,
      incomeEntryMode: null,
      createdBy: ctx.user.id
    };
    if (existingItem) {
      updateBudgetItem(db, payload);
    } else {
      createBudgetItem(db, payload);
    }
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/budget-plan/bills', existingItem ? 'Expense updated.' : 'Expense saved.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/budget-plan/bills', error);
  }
}

function createOrUpdateCategoryBudgetAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const returnTo = ctx.body.return_to || flexibleSpendingReturnTo(currentMonth());
  try {
    const amountPence = requireMoney(ctx.body.amount, 'Target amount');
    const categoryId = Number(ctx.body.category_id || 0) || null;
    const budgetScope = requireChoice(ctx.body.budget_scope || 'default_monthly', ['default_monthly', 'month_override'], 'Target type');
    if (!categoryId) throw new Error('Category is required.');

    if (budgetScope === 'default_monthly') {
      saveCategoryBudgetDefault(db, {
        id: Number(ctx.body.id || 0) || null,
        householdId: ctx.user.household_id,
        categoryId,
        amountPence,
        notes: optionalString(ctx.body.notes),
        createdBy: ctx.user.id
      });
    } else {
      saveCategoryBudget(db, {
        id: Number(ctx.body.id || 0) || null,
        householdId: ctx.user.household_id,
        categoryId,
        budgetMonth: requireBudgetMonth(ctx.body.budget_month),
        amountPence,
        notes: optionalString(ctx.body.notes),
        createdBy: ctx.user.id
      });
    }

    redirectWithSuccess(ctx.res, returnTo, 'Spending target saved.');
  } catch (error) {
    redirectWithError(ctx.res, returnTo, error);
  }
}

function deleteCategoryBudgetAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const returnTo = ctx.body.return_to || flexibleSpendingReturnTo(currentMonth());
  try {
    const budgetScope = requireChoice(ctx.body.budget_scope || 'default_monthly', ['default_monthly', 'month_override'], 'Target type');
    if (budgetScope === 'default_monthly') {
      deleteCategoryBudgetDefault(db, ctx.user.household_id, Number(ctx.body.id));
    } else {
      deleteCategoryBudget(db, ctx.user.household_id, Number(ctx.body.id));
    }
    redirectWithSuccess(ctx.res, returnTo, 'Spending target deleted.');
  } catch (error) {
    redirectWithError(ctx.res, returnTo, error);
  }
}

function toggleBudgetItem(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  setBudgetItemActive(db, ctx.user.household_id, Number(ctx.body.id), ctx.body.is_active === '1');
  redirect(ctx.res, ctx.body.return_to || '/dashboard');
}

function deleteBudgetItemAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    deleteBudgetItem(db, ctx.user.household_id, Number(ctx.body.id));
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/dashboard', 'Item deleted.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/dashboard', error);
  }
}

function requireBudgetMonth(value) {
  const month = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Budget month is invalid.');
  return month;
}

function parseEstimateStudentLoanPlans(item) {
  try {
    const plans = JSON.parse(item.estimate_student_loan_plans_json || '[]');
    return Array.isArray(plans) ? plans : [];
  } catch {
    return [];
  }
}
