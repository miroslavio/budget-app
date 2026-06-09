import { createBudgetItem, deleteBudgetItem, findBudgetItemById, listActiveBudgetItems, listBudgetItems, setBudgetItemActive, updateBudgetItem, updateBudgetItemIncomeEstimate } from '../repositories/budgetItemRepository.js';
import {
  deleteCategoryBudget,
  deleteCategoryBudgetDefault,
  listCategoryBudgetDefaults,
  listCategoryBudgets,
  saveCategoryBudget,
  saveCategoryBudgetDefault,
  setCategoryBudgetDefaultActive
} from '../repositories/categoryBudgetRepository.js';
import { createIncomeEstimate, attachEstimateToBudgetItem, deleteIncomeEstimate, updateIncomeEstimate } from '../repositories/incomeEstimateRepository.js';
import { listCategories } from '../repositories/categoryRepository.js';
import { createSavingsAccount, findSavingsAccountById, listSavingsAccounts, updateSavingsAccount } from '../repositories/savingsAccountRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { calculateMonthlyEquivalent, plannedMonthlySummary } from '../services/budgetService.js';
import { isPensionAccountType, savingsAccountTypeLabel } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { buildUnifiedSpendingBudgetRows, plannedSpendingSummary, spendingCategoryKey } from '../services/spendingBudgetService.js';
import { estimateTakeHomePay } from '../services/takeHomePayService.js';
import { listTaxYears, latestTaxYear } from '../services/taxRulesService.js';
import { addMonths, currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { optionalMoney, optionalString, parsePercentage, requireChoice, requireDecimal, requireMoney, requireString } from '../utils/validation.js';
import { actionIconButton, csrfField, escapeHtml, formatCurrency, moneyInputValue, movementStat, ownerLabel, page } from '../views/html.js';
import { categoryOptions, decimalInputAttrs, frequencyOptions, moneyInputAttrs, ownerOptions, taxYearOptions } from '../views/forms.js';
import { html, json, redirect } from '../http/response.js';
import { checkboxValue, ensureAuthenticated, formDate, parseStudentLoanPlans, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerBudgetRoutes(router, db) {
  router.get('/budget-plan', (ctx) => renderBudgetPlanOverview(ctx, db));
  router.get('/budget-plan/income', (ctx) => renderIncomePlanPage(ctx, db));
  router.get('/budget-plan/spending', (ctx) => renderSpendingBudgetsPage(ctx, db));
  router.get('/budget-plan/bills', (ctx) => redirect(ctx.res, `/budget-plan/spending${ctx.url?.search || ''}`));
  router.get('/budget-plan/flexible-spending', (ctx) => redirect(ctx.res, `/budget-plan/spending${ctx.url?.search || ''}`));
  router.get('/budget-plan/planned-savings', (ctx) => renderPlannedSavingsPage(ctx, db));
  router.get('/income', (ctx) => redirect(ctx.res, `/budget-plan/income${ctx.url?.search || ''}`));
  router.get('/expenses', (ctx) => redirect(ctx.res, `/budget-plan/spending${ctx.url?.search || ''}`));
  router.post('/income', (ctx) => createIncome(ctx, db));
  router.post('/income/estimate', (ctx) => previewIncomeEstimateJson(ctx));
  router.post('/budget-plan/spending', (ctx) => savePlannedSpending(ctx, db));
  router.post('/expenses', (ctx) => createExpense(ctx, db));
  router.post('/budget-item/delete', (ctx) => deleteBudgetItemAction(ctx, db));
  router.post('/expenses/category-budgets', (ctx) => createOrUpdateCategoryBudgetAction(ctx, db));
  router.post('/expenses/category-budgets/delete', (ctx) => deleteCategoryBudgetAction(ctx, db));
  router.post('/expenses/category-budgets/toggle', (ctx) => toggleCategoryBudgetDefaultAction(ctx, db));
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
  const spendingRows = buildUnifiedSpendingBudgetRows({
    expenseItems: activeItems.filter((item) => item.item_type === 'expense'),
    defaultBudgets,
    monthBudgets: [],
    transactions: [],
    month
  });
  const spendingSummary = plannedSpendingSummary({
    expenseItems: activeItems,
    defaultBudgets,
    monthBudgets: [],
    month
  });
  const plannedSpendingPence = spendingSummary.totalPlannedSpendingPence;
  const plannedSavingsContributionsPence = plan.plannedSavingsPence;
  const plannedSurplusPence = plan.plannedIncomePence - plannedSpendingPence - plannedSavingsContributionsPence;

  const expenseItems = plan.activeItems.filter((item) => item.item_type === 'expense');
  const completeness = planCompleteness(expenseItems, month);
  const hasPlanData =
    plan.plannedIncomePence > 0 ||
    plannedSpendingPence > 0 ||
    plannedSavingsContributionsPence > 0;

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan',
      wide: true,
      body: `<div class="budget-plan-layout">
      ${budgetPlanPageIntro('overview')}
      ${hasPlanData ? `${budgetPlanSummaryCards({
        plannedIncomePence: plan.plannedIncomePence,
        committedSpendingPence: spendingSummary.committedTotalPence,
        flexibleSpendingTargetPence: spendingSummary.flexibleTotalPence,
        plannedSpendingPence,
        plannedSavingsContributionsPence,
        plannedSurplusPence
      })}
      ${budgetPlanAvailabilityInsight(plannedSurplusPence)}
      <section class="card chart-card budget-overview-spending-chart">
        <div class="card-heading">
          <h2>Where planned spending goes</h2>
          <a href="/budget-plan/spending">Review all</a>
        </div>
        ${plannedSpendingOwnerBarChart(spendingRows.rows, members)}
      </section>
      ${completeness.missingCount > 0 ? planCompletenessCard(completeness) : ''}` : budgetPlanEmptyState()}</div>`
    })
  );
}

function renderIncomePlanPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const items = listBudgetItems(db, ctx.user.household_id, 'income');
  const savingsAccounts = listSavingsAccounts(db, ctx.user.household_id);
  const returnTo = '/budget-plan/income';

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Income',
      wide: true,
      body: `<div class="budget-plan-layout">
      ${budgetPlanPageIntro('income')}
      <section class="action-row">
        ${formDisclosure('income', ctx, [], members, returnTo, {}, savingsAccounts)}
      </section>
      <section class="grid one">
        <div class="card">
          <h2>Planned income</h2>
          ${incomeItemsTable(ctx, items, members, returnTo)}
        </div>
      </section>
      </div>`
    })
  );
}

function renderSpendingBudgetsPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = currentMonth();
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const expenseItems = listBudgetItems(db, ctx.user.household_id, 'expense');
  const categories = listCategories(db, ctx.user.household_id);
  const defaultBudgets = listCategoryBudgetDefaults(db, ctx.user.household_id);
  const rows = buildUnifiedSpendingBudgetRows({
    expenseItems,
    defaultBudgets,
    monthBudgets: [],
    transactions: [],
    month
  });
  const returnTo = spendingBudgetsReturnTo();
  const spendingByCategory = plannedSpendingOwnerBarChart(rows.rows, members);

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Planned spending',
      wide: true,
      body: `<div class="budget-plan-layout">
      ${budgetPlanPageIntro('spending')}
      <section class="action-row">
        ${plannedSpendingDisclosure(ctx, categories, members, returnTo, rows)}
      </section>
      <section class="card planned-spending-view-card">
        <div class="card-heading">
          <h2>Planned spending</h2>
          <div class="period-pills view-toggle-pills" data-view-toggle-group aria-label="Planned spending view">
            <button type="button" class="period-pill active" data-view-toggle="planned-spending-view" data-view-value="items" aria-pressed="true">Items</button>
            <button type="button" class="period-pill" data-view-toggle="planned-spending-view" data-view-value="category-breakdown" aria-pressed="false">Category breakdown</button>
          </div>
        </div>
        <div data-view-panel="planned-spending-view" data-view-value="items">
          ${spendingBudgetsTable(ctx, rows.rows, members, returnTo)}
        </div>
        <div id="planned-spending-chart" data-view-panel="planned-spending-view" data-view-value="category-breakdown" hidden>
          ${spendingByCategory}
        </div>
      </section>
      ${plannedSpendingModal(ctx, categories, members, returnTo, rows)}
      </div>`
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

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Planned savings',
      wide: true,
      body: `<div class="budget-plan-layout">
      ${budgetPlanPageIntro('planned-savings')}
      <section class="action-row">
        <a class="button" href="/savings/accounts">Add planned saving</a>
        <a class="button" href="/savings/goals">View full Savings Goals</a>
      </section>
      <section class="card">
        <h2>Planned savings</h2>
        ${plannedSavingsTable(goals, plannedSavingsItems, members, savingsAccounts)}
      </section>
      </div>`
    })
  );
}

function budgetPlanPageIntro(activeKey, context, secondaryLabel = '', controls = '') {
  return `<section class="page-title">
    <div>
      <h1>Budget Plan</h1>
      ${context ? `<p class="page-context">${escapeHtml(context)}</p>` : ''}
      ${secondaryLabel ? `<p class="dashboard-period-label">${escapeHtml(secondaryLabel)}</p>` : ''}
    </div>
    ${controls}
  </section>
  <nav class="period-pills section-nav" aria-label="Budget plan sections">
    ${budgetPlanSectionLink('/budget-plan', 'Overview', activeKey === 'overview')}
    ${budgetPlanSectionLink('/budget-plan/income', 'Income', activeKey === 'income')}
    ${budgetPlanSectionLink('/budget-plan/spending', 'Planned Spending', activeKey === 'spending')}
    ${budgetPlanSectionLink('/budget-plan/planned-savings', 'Planned Savings', activeKey === 'planned-savings')}
  </nav>`;
}

function budgetPlanSectionLink(href, label, active = false) {
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${href}">${escapeHtml(label)}</a>`;
}

function budgetPlanSummaryCards({
  plannedIncomePence,
  committedSpendingPence,
  flexibleSpendingTargetPence,
  plannedSpendingPence,
  plannedSavingsContributionsPence,
  plannedSurplusPence
}) {
  return `<section class="grid four">
    ${planSummaryStat('Planned income', plannedIncomePence, '', 'good')}
    ${planSummaryStat('Planned spending', plannedSpendingPence, `Regular ${formatCurrency(committedSpendingPence)} · Variable estimate ${formatCurrency(flexibleSpendingTargetPence)}`)}
    ${planSummaryStat('Planned savings', plannedSavingsContributionsPence, '', 'good')}
    ${movementStat('Available after plan', plannedSurplusPence)}
  </section>`;
}

function budgetPlanAvailabilityInsight(plannedSurplusPence) {
  if (plannedSurplusPence >= 0) return '';
  return `<section class="inline-alert danger">
    Your current plan is over-allocated by ${formatCurrency(Math.abs(plannedSurplusPence))}.
    Review <a href="/budget-plan/spending">planned spending</a> or <a href="/budget-plan/planned-savings">planned savings</a>.
  </section>`;
}

function planSummaryStat(label, valuePence, note = '', tone = '') {
  return `<div class="stat ${escapeHtml(tone)}">
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
  const desktopTable = `<table class="data-table">
    <thead><tr><th>Section</th><th>Monthly planned</th><th>Annual costs included</th><th>Owner or split summary</th><th class="actions-col">Action</th></tr></thead>
    <tbody>${rows
      .map((row) => `<tr>
        <td>
          <div class="cell-stack">
            <strong>${escapeHtml(row.section)}</strong>
            <small class="budget-plan-row-tone ${escapeHtml(row.sectionKind || 'neutral')}">${escapeHtml(sectionKindLabel(row.sectionKind))}</small>
          </div>
        </td>
        <td><span class="budget-plan-value ${escapeHtml(row.sectionKind || 'neutral')}">${formatCurrency(row.monthlyPlannedPence)}</span></td>
        <td>${escapeHtml(row.yearlyItemsIncluded)}</td>
        <td>${escapeHtml(row.ownerSummary)}</td>
        <td class="actions-col"><a class="button" href="${escapeHtml(row.actionHref)}">${escapeHtml(row.actionLabel)}</a></td>
      </tr>`)
      .join('')}</tbody>
  </table>`;

  return `<section class="card">
    <h2>Current plan</h2>
    ${responsiveFinanceTable(desktopTable, `<div class="mobile-finance-card-list">${rows.map((row) => budgetPlanOverviewMobileCard(row)).join('')}</div>`)}
  </section>`;
}

function budgetPlanOverviewMobileCard(row) {
  const sectionKind = row.sectionKind || 'neutral';
  return `<article class="mobile-finance-card" data-mobile-sort-card>
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(row.section)}</h3>
        <p class="budget-plan-row-tone ${escapeHtml(sectionKind)}">${escapeHtml(sectionKindLabel(sectionKind))}</p>
      </div>
    </div>
    <div class="mobile-card-amount">
      <strong class="budget-plan-value ${escapeHtml(sectionKind)}">${formatCurrency(row.monthlyPlannedPence)}</strong>
      <span>${escapeHtml(row.ownerSummary)}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner or split summary</dt><dd>${escapeHtml(row.ownerSummary)}</dd></div>
      <div><dt>Annual costs included</dt><dd>${escapeHtml(row.yearlyItemsIncluded)}</dd></div>
    </dl>
    <div class="mobile-card-actions">
      <a class="button" href="${escapeHtml(row.actionHref)}">${escapeHtml(row.actionLabel)}</a>
    </div>
  </article>`;
}

function sectionKindLabel(sectionKind) {
  if (sectionKind === 'inflow') return 'Money in';
  if (sectionKind === 'saving') return 'Set aside';
  if (sectionKind === 'outflow') return 'Money out';
  return 'Planned amount';
}

function budgetPlanEmptyState() {
  return `<section class="card plan-empty-state">
    <h2>Start your budget plan</h2>
    <p>Start by adding income, then add planned spending. We&rsquo;ll calculate your planned monthly position automatically.</p>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/spending">Add planned spending</a>
      <a class="button" href="/savings/accounts">Add planned saving</a>
    </div>
  </section>`;
}

function yearlyMonthlyEquivalentPence(items) {
  return items
    .filter((item) => item.frequency === 'yearly')
    .reduce((total, item) => total + Number(item.monthly_equivalent_pence || 0), 0);
}

function yearlyItemsLabel(monthlyEquivalentPence) {
  return monthlyEquivalentPence > 0 ? `${formatCurrency(monthlyEquivalentPence)}/month from annual items` : 'None';
}

function planCompleteness(expenseItems = []) {
  const checks = [
    {
      label: 'Rent or mortgage',
      terms: ['rent', 'mortgage'],
      suggestedCategories: ['Rent', 'Mortgage']
    },
    {
      label: 'Council tax',
      terms: ['council tax'],
      suggestedCategories: ['Council tax']
    },
    {
      label: 'Utilities',
      terms: ['utilities', 'utility', 'energy', 'electric', 'gas', 'water', 'broadband', 'mobile phone', 'tv licence'],
      suggestedCategories: ['Utilities', 'Energy bill', 'Broadband', 'Mobile phone', 'TV licence']
    },
    {
      label: 'Insurance',
      terms: ['insurance'],
      suggestedCategories: ['Insurance']
    },
    {
      label: 'Subscriptions',
      terms: ['subscription', 'subscriptions'],
      suggestedCategories: ['Subscriptions']
    }
  ].map((check) => ({
    ...check,
    complete: planIncludesTerms(expenseItems, check.terms),
    href: `/budget-plan/spending?suggested_category=${encodeURIComponent(check.suggestedCategories.join('|'))}`
  }));
  const foundCount = checks.filter((check) => check.complete).length;
  const missingCount = checks.length - foundCount;

  return { checks, foundCount, missingCount };
}

function planCompletenessCard(completeness) {
  return `<div class="card plan-completeness-card">
    <div class="card-heading compact">
      <div>
        <h2>Common costs checked</h2>
        <p class="hint">A guide to common household costs. Some items may not apply to your household.</p>
      </div>
      <span class="setup-progress">${completeness.foundCount} found, ${completeness.missingCount} not added</span>
    </div>
    <ul class="plan-check-list">
      ${completeness.checks
        .map(
          (check) => `<li class="${check.complete ? 'complete' : ''}">
            <span class="plan-check-marker" aria-hidden="true">${check.complete ? '&#10003;' : '&#9675;'}</span>
            ${check.complete
              ? `<span>${escapeHtml(check.label)}</span>`
              : `<a class="plan-check-link" href="${escapeHtml(check.href)}">${escapeHtml(check.label)}</a>`}
          </li>`
        )
        .join('')}
    </ul>
  </div>`;
}

function planIncludesTerms(items, terms) {
  return items.some((item) => {
    const text = `${item.name || ''} ${item.category_name || ''}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

function ownerSummary(items, members) {
  const owners = [...new Set(items.map((item) => item.owner_type).filter(Boolean))];
  if (!owners.length) return 'None';
  if (owners.includes('shared')) return 'Shared household';
  if (owners.length === 1) return ownerLabel(owners[0], members);
  return 'Multiple household members';
}

function spendingOwnerSummary(expenseItems, flexibleBudgets, members) {
  return ownerSummary(
    [
      ...expenseItems,
      ...flexibleBudgets
        .filter((budget) => Number(budget.amount_pence || 0) > 0)
        .map((budget) => ({ owner_type: budget.owner_type || 'shared' }))
    ],
    members
  );
}

function spendingOwnerLabel(row, members) {
  if (row.ownerType !== 'shared') return ownerLabel(row.ownerType, members);
  if (row.splitType === 'manual_percentage') {
    return `Shared household (${Number(row.personAPercentage || 50)}% / ${Number(row.personBPercentage || 50)}%)`;
  }
  return 'Shared household';
}

function spendingFrequencyLabel(row) {
  if (row.rowType === 'committed_cost') {
    if (row.frequency === 'yearly') return `${formatCurrency(row.sourceAmountPence)}/year`;
    return `${formatCurrency(row.sourceAmountPence)}/month`;
  }
  return 'Monthly estimate';
}

function spendingTimingSummary(row) {
  if (row.status === 'Ended' && row.endDate) return `Ended on ${row.endDate}`;
  if (row.startDate && row.endDate) return `${row.startDate} to ${row.endDate}`;
  if (row.startDate) return `From ${row.startDate}`;
  if (row.endDate) return `Until ${row.endDate}`;
  return '';
}

function spendingBudgetsReturnTo() {
  return '/budget-plan/spending';
}

function spendingBudgetActions(ctx, row, returnTo) {
  if (row.rowType === 'committed_cost') {
    return `<div class="table-actions">
      ${actionIconButton({
      label: 'Edit regular planned spending',
      icon: 'edit',
      variant: 'edit',
      attributes: `data-open-modal="planned-spending-modal"
          data-reset-modal="true"
          data-fill-id="${escapeHtml(row.id)}"
          data-fill-spending-type="regular"
          data-fill-name="${escapeHtml(row.name)}"
          data-fill-category-id="${escapeHtml(row.categoryId || '')}"
          data-fill-owner-type="${escapeHtml(row.ownerType)}"
          data-fill-regular-amount="${moneyInputValue(row.sourceAmountPence)}"
          data-fill-frequency="${escapeHtml(row.frequency || 'monthly')}"
          data-fill-split-type="${escapeHtml(row.splitType || 'equal')}"
          data-fill-person-a-percentage="${escapeHtml(row.personAPercentage ?? 50)}"
          data-fill-person-b-percentage="${escapeHtml(row.personBPercentage ?? 50)}"
          data-fill-start-date="${escapeHtml(row.startDate || todayIso())}"
          data-fill-end-date="${escapeHtml(row.endDate || '')}"
          data-fill-notes="${escapeHtml(row.notes || '')}"`
      })}
      <form method="post" action="/budget-item/toggle">
        ${csrfField(ctx)}
        <input type="hidden" name="id" value="${row.id}">
        <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
        <input type="hidden" name="is_active" value="${row.isActive ? '0' : '1'}">
        ${actionIconButton({
      label: row.isActive ? 'Pause regular planned spending' : 'Resume regular planned spending',
      icon: row.isActive ? 'pause' : 'play',
      variant: row.isActive ? 'warn' : 'good',
      type: 'submit'
    })}
      </form>
      <form method="post" action="/budget-item/delete" data-confirm="Delete this planned spending item?">
        ${csrfField(ctx)}
        <input type="hidden" name="id" value="${row.id}">
        <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
        ${actionIconButton({ label: 'Delete regular planned spending', icon: 'delete', variant: 'delete', type: 'submit' })}
      </form>
    </div>`;
  }

  if (!row.id) return '';
  return `<div class="table-actions">
    ${actionIconButton({
      label: 'Edit variable estimate',
      icon: 'edit',
      variant: 'edit',
      attributes: `data-open-modal="planned-spending-modal"
        data-reset-modal="true"
        data-fill-id="${escapeHtml(row.id)}"
        data-fill-spending-type="variable_estimate"
        data-fill-name="${escapeHtml(row.name || '')}"
        data-fill-category-id="${escapeHtml(row.categoryId || '')}"
        data-fill-owner-type="${escapeHtml(row.ownerType || 'shared')}"
        data-fill-split-type="${escapeHtml(row.splitType || 'equal')}"
        data-fill-person-a-percentage="${escapeHtml(row.personAPercentage ?? 50)}"
        data-fill-person-b-percentage="${escapeHtml(row.personBPercentage ?? 50)}"
        data-fill-variable-amount="${escapeHtml((row.plannedMonthlyPence / 100).toFixed(2))}"
        data-fill-notes="${escapeHtml(row.notes || '')}"`
    })}
    <form method="post" action="/expenses/category-budgets/toggle">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${escapeHtml(row.id)}">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      <input type="hidden" name="is_active" value="${row.isActive === false ? '1' : '0'}">
      ${actionIconButton({
      label: row.isActive === false ? 'Resume variable estimate' : 'Pause variable estimate',
      icon: row.isActive === false ? 'play' : 'pause',
      variant: row.isActive === false ? 'good' : 'warn',
      type: 'submit'
    })}
    </form>
    <form method="post" action="/expenses/category-budgets/delete" data-confirm="Delete this planned spending item?">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${escapeHtml(row.id)}">
      <input type="hidden" name="budget_scope" value="${escapeHtml(row.budgetScope || 'default_monthly')}">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      ${actionIconButton({ label: 'Delete variable estimate', icon: 'delete', variant: 'delete', type: 'submit' })}
    </form>
  </div>`;
}

function plannedSpendingDisclosure() {
  return `<button type="button" data-open-modal="planned-spending-modal" data-reset-modal="true">Add planned spending</button>`;
}

function plannedSpendingOwnerBarChart(rows, members, options = {}) {
  const chartRows = limitedPlannedSpendingOwnerChartRows(plannedSpendingOwnerChartRows(rows, members), options.maxRows);
  if (!chartRows.length) {
    return '<div class="chart-empty">Add planned spending to build this chart.</div>';
  }

  const totalPence = chartRows.reduce((total, row) => total + row.totalPence, 0);
  const legendOwners = spendingChartLegendOwners(chartRows);
  const orderedRows = [...chartRows].reverse();
  const chartId = `planned-spending-owner-${Math.random().toString(36).slice(2)}`;
  const chartHeight = Math.min(520, Math.max(220, 118 + chartRows.length * 40));
  const ownerColours = {
    'person-a': '#1f6f5b',
    'person-b': '#4b5fb5',
    shared: '#d4863c'
  };
  const chartConfig = {
    textStyle: {
      fontFamily: 'inherit',
      color: '#17211b'
    },
    legend: {
      bottom: 0,
      left: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#5e6b63',
        fontWeight: 700
      },
      data: legendOwners.map((owner) => owner.label)
    },
    grid: {
      left: 6,
      right: 132,
      top: 10,
      bottom: legendOwners.length ? 42 : 24,
      containLabel: true
    },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        formatter: '£{value}'
      },
      splitLine: {
        lineStyle: { color: 'rgba(56, 45, 31, 0.09)' }
      }
    },
    yAxis: {
      type: 'category',
      data: orderedRows.map((row) => row.label),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: '#17211b',
        fontWeight: 700
      }
    },
    series: legendOwners.map((owner) => ({
      name: owner.label,
      type: 'bar',
      stack: 'total',
      barWidth: 12,
      data: orderedRows.map((row) => {
        const portion = row.portions.find((entry) => entry.key === owner.key);
        const valuePence = Number(portion?.amountPence || 0);
        return {
          name: row.label,
          value: Number((valuePence / 100).toFixed(2)),
          valuePence,
          ownerKey: owner.key,
          ownerLabel: owner.label,
          categoryTotalPence: row.totalPence,
          categorySharePercentage: row.totalPence ? Math.round((valuePence / row.totalPence) * 100) : 0,
          totalSharePercentage: totalPence ? Math.round((valuePence / totalPence) * 100) : 0,
          totalPercentage: totalPence ? Math.round((row.totalPence / totalPence) * 100) : 0,
          isLabelCarrier: row.portions.at(-1)?.key === owner.key
        };
      }),
      itemStyle: {
        color: ownerColours[owner.key] || '#d4863c',
        borderRadius: 2
      }
    }))
  };

  return `<div class="category-owner-chart" role="img" aria-label="Planned spending by category and owner">
    <div id="${chartId}" class="echarts-dashboard-chart planned-spending-owner-chart" style="height:${chartHeight}px" data-echarts-chart data-chart-type="planned-spending-owner" data-chart-config="${escapeHtml(JSON.stringify(chartConfig))}"></div>
    <table class="sr-only">
      <caption>Planned spending by category and owner</caption>
      <thead><tr><th>Category</th><th>Total</th>${legendOwners.map((owner) => `<th>${escapeHtml(owner.label)}</th>`).join('')}</tr></thead>
      <tbody>
        ${chartRows
          .map(
            (row) => `<tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${formatCurrency(row.totalPence)}</td>
              ${legendOwners
                .map((owner) => `<td>${formatCurrency(row.portions.find((portion) => portion.key === owner.key)?.amountPence || 0)}</td>`)
                .join('')}
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function limitedPlannedSpendingOwnerChartRows(chartRows, maxRows = Infinity) {
  if (!Number.isFinite(maxRows) || chartRows.length <= maxRows) return chartRows;
  const visibleCount = Math.max(1, maxRows - 1);
  const visibleRows = chartRows.slice(0, visibleCount);
  const groupedRows = chartRows.slice(visibleCount);
  const otherPortions = new Map();
  let otherTotalPence = 0;

  for (const row of groupedRows) {
    otherTotalPence += row.totalPence;
    for (const portion of row.portions) {
      otherPortions.set(portion.key, {
        ...portion,
        label: portion.label,
        amountPence: Number(otherPortions.get(portion.key)?.amountPence || 0) + Number(portion.amountPence || 0)
      });
    }
  }

  if (otherTotalPence <= 0) return visibleRows;
  return [
    ...visibleRows,
    {
      label: 'Other planned spending',
      totalPence: otherTotalPence,
      portions: [...otherPortions.values()].filter((portion) => portion.amountPence > 0)
    }
  ];
}

function plannedSpendingOwnerChartRows(rows, members) {
  const grouped = new Map();

  for (const row of rows) {
    if (row.isActive === false || row.status === 'Ended' || row.countedInPlan === false) continue;
    const amountPence = Number(row.plannedMonthlyPence || 0);
    if (amountPence <= 0) continue;

    const key = row.categoryKey || spendingCategoryKey(row.categoryId, row.categoryName);
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: row.categoryName || row.name || 'Uncategorised',
        totalPence: 0,
        portions: new Map()
      });
    }

    const category = grouped.get(key);
    category.totalPence += amountPence;
    for (const portion of spendingOwnerPortions(row, amountPence, members)) {
      category.portions.set(portion.key, {
        ...portion,
        amountPence: Number(category.portions.get(portion.key)?.amountPence || 0) + portion.amountPence
      });
    }
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      portions: [...row.portions.values()].filter((portion) => portion.amountPence > 0)
    }))
    .sort((a, b) => b.totalPence - a.totalPence);
}

function spendingOwnerPortions(row, amountPence, members) {
  const firstMember = members.find((member) => member.person_key === 'person_a');
  const secondMember = members.find((member) => member.person_key === 'person_b');

  if (row.ownerType === 'person_a') {
    return [{ key: 'person-a', label: firstMember?.display_name || ownerLabel('person_a', members), amountPence }];
  }
  if (row.ownerType === 'person_b') {
    return [{ key: 'person-b', label: secondMember?.display_name || ownerLabel('person_b', members), amountPence }];
  }

  if (firstMember && secondMember) {
    const personAPercentage = row.splitType === 'manual_percentage' ? Number(row.personAPercentage || 50) : 50;
    const personAPence = Math.round((amountPence * personAPercentage) / 100);
    const personBPence = amountPence - personAPence;
    return [
      { key: 'person-a', label: firstMember.display_name || ownerLabel('person_a', members), amountPence: personAPence },
      { key: 'person-b', label: secondMember.display_name || ownerLabel('person_b', members), amountPence: personBPence }
    ].filter((portion) => portion.amountPence > 0);
  }

  return [{ key: 'shared', label: 'Shared household', amountPence }];
}

function spendingChartLegendOwners(chartRows) {
  const owners = new Map();
  for (const row of chartRows) {
    for (const portion of row.portions) {
      owners.set(portion.key, { key: portion.key, label: portion.label });
    }
  }
  const order = ['person-a', 'person-b', 'shared'];
  return [...owners.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

function plannedSavingsTable(goals, plannedSavingsItems, members, savingsAccounts = []) {
  if (savingsAccounts.length) {
    const rows = savingsAccounts.filter((account) => Number(account.is_active) === 1 && Number(account.monthly_contribution_pence || 0) > 0);
    if (!rows.length) {
      return '<p class="empty">No active savings-account contributions are currently included in the budget.</p>';
    }

    const desktopTable = `<table class="data-table">
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
    const totalPence = rows.reduce((sum, account) => sum + Number(account.monthly_contribution_pence || 0), 0);
    const mobileCardsId = 'planned-savings-mobile-cards';
    return responsiveFinanceTable(desktopTable, `
      <div class="mobile-card-summary">
        <span>Total planned savings</span>
        <strong>${formatCurrency(totalPence)} / month</strong>
      </div>
      ${mobileSortControl(mobileCardsId, rows.length, [
        ['amount:desc', 'Monthly contribution, high to low'],
        ['name:asc', 'Name, A to Z'],
        ['owner:asc', 'Owner, A to Z'],
        ['type:asc', 'Type, A to Z']
      ])}
      <div id="${mobileCardsId}" class="mobile-finance-card-list">
        ${rows.map((account) => plannedSavingsAccountMobileCard(account, members)).join('')}
      </div>
    `);
  }

  const rows = goals.filter((goal) => goal.status === 'active' && Number(goal.monthly_contribution_pence || 0) > 0);
  if (!rows.length) {
    return `<p class="empty">No planned savings contributions are currently included in the budget. Add a monthly contribution to an active savings goal or start tracking savings accounts and pots.</p>`;
  }

  const desktopTable = `<table class="data-table">
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
  const totalPence = rows.reduce((sum, goal) => sum + Number(goal.monthly_contribution_pence || 0), 0);
  const mobileCardsId = 'planned-savings-goals-mobile-cards';
  return responsiveFinanceTable(desktopTable, `
    <div class="mobile-card-summary">
      <span>Total planned savings</span>
      <strong>${formatCurrency(totalPence)} / month</strong>
    </div>
    ${mobileSortControl(mobileCardsId, rows.length, [
      ['amount:desc', 'Monthly contribution, high to low'],
      ['name:asc', 'Name, A to Z'],
      ['owner:asc', 'Owner, A to Z'],
      ['status:asc', 'Status, A to Z']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${rows.map((goal) => plannedSavingsGoalMobileCard(goal, members)).join('')}
    </div>
  `);
}

function plannedSavingsAccountMobileCard(account, members) {
  const rate = `${Number(account.projected_annual_rate || 0).toFixed(2).replace(/\.00$/, '')}%`;
  return `<article class="mobile-finance-card" data-mobile-sort-card
    data-sort-name="${escapeHtml(String(account.name || '').toLowerCase())}"
    data-sort-owner="${escapeHtml(ownerLabel(account.owner_type, members).toLowerCase())}"
    data-sort-type="${escapeHtml(savingsAccountTypeLabel(account.account_type).toLowerCase())}"
    data-sort-amount="${Number(account.monthly_contribution_pence || 0)}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(account.name)}</h3>
        <p>${escapeHtml(savingsAccountTypeLabel(account.account_type))}</p>
      </div>
      <span class="mobile-card-status">Active</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${formatCurrency(Number(account.monthly_contribution_pence || 0))}</strong>
      <span>${escapeHtml(ownerLabel(account.owner_type, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel(account.owner_type, members))}</dd></div>
      <div><dt>Projected annual rate</dt><dd>${escapeHtml(rate)}</dd></div>
    </dl>
  </article>`;
}

function plannedSavingsGoalMobileCard(goal, members) {
  return `<article class="mobile-finance-card" data-mobile-sort-card
    data-sort-name="${escapeHtml(String(goal.name || '').toLowerCase())}"
    data-sort-owner="${escapeHtml(ownerLabel(goal.owner_type, members).toLowerCase())}"
    data-sort-amount="${Number(goal.monthly_contribution_pence || 0)}"
    data-sort-status="${escapeHtml(String(goal.status || '').toLowerCase())}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(goal.name)}</h3>
        <p>Manual savings contribution</p>
      </div>
      <span class="mobile-card-status">${escapeHtml(goal.status)}</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${formatCurrency(Number(goal.monthly_contribution_pence || 0))}</strong>
      <span>${escapeHtml(ownerLabel(goal.owner_type, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel(goal.owner_type, members))}</dd></div>
      <div><dt>Target date</dt><dd>${escapeHtml(goal.target_date || 'No target date')}</dd></div>
    </dl>
  </article>`;
}

function responsiveFinanceTable(tableHtml, mobileHtml) {
  return `<div class="desktop-table-wrapper">${tableHtml}</div>
  <div class="mobile-card-region">${mobileHtml}</div>`;
}

function mobileSortControl(listId, rowCount, options) {
  if (rowCount < 2) return '';
  const selectId = `${listId}-sort`;
  return `<div class="mobile-sort-control">
    <label for="${escapeHtml(selectId)}">Sort by</label>
    <select id="${escapeHtml(selectId)}" data-mobile-card-sort="${escapeHtml(listId)}">
      ${options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}
    </select>
  </div>`;
}

function mobileStatusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('pause')) return 'paused';
  if (value.includes('end')) return 'ended';
  if (value.includes('warning') || value.includes('behind')) return 'warning';
  return '';
}

function plannedSavingsContributionCell(account) {
  const notes = [];
  if (isPensionAccountType(account.account_type) && account.account_type !== 'defined_benefit_pension' && Number(account.employer_monthly_contribution_pence || 0) > 0) {
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

function spendingBudgetsTable(ctx, rows, members, returnTo) {
  if (!rows.length) {
    return `<div class="empty-state compact">
      <h3>No planned spending yet</h3>
      <p>Add the spending you expect as part of your usual plan, such as mortgage, groceries, transport, subscriptions, or insurance.</p>
    </div>`;
  }

  const totalPlannedMonthlyPence = rows.reduce(
    (total, row) => total + (row.isActive === false ? 0 : Number(row.plannedMonthlyPence || 0)),
    0
  );

  const desktopTable = `<table class="data-table category-budget-table spending-budget-table">
    <thead><tr><th>Name</th><th>Category</th><th>Type</th><th>Owner / split</th><th>Frequency</th><th>Planned monthly</th><th class="actions-col">Actions</th></tr></thead>
    <tbody>${rows
      .map((row) => `<tr class="${row.status === 'Ended' ? 'row-ended' : row.isActive === false ? 'row-paused' : ''}">
        <td>
          <div class="cell-stack">
            <strong>${escapeHtml(row.name)}</strong>
            ${
              row.overlap
                ? '<small class="hint">Review overlap with another planned item</small>'
                : row.status === 'Ended'
                  ? `<small class="hint">Ended${row.endDate ? ` · ${escapeHtml(row.endDate)}` : ''}</small>`
                  : row.isActive === false
                    ? '<small class="hint">Paused</small>'
                    : ''
            }
          </div>
        </td>
        <td>${escapeHtml(row.categoryName)}</td>
        <td>${escapeHtml(row.rowType === 'committed_cost' ? 'Regular' : 'Variable estimate')}</td>
        <td>${escapeHtml(spendingOwnerLabel(row, members))}</td>
        <td>
          <div class="cell-stack">
            <span>${escapeHtml(spendingFrequencyLabel(row))}</span>
            ${spendingTimingSummary(row) ? `<small class="hint">${escapeHtml(spendingTimingSummary(row))}</small>` : ''}
          </div>
        </td>
        <td>${formatCurrency(row.plannedMonthlyPence)}</td>
        <td class="actions-col">${spendingBudgetActions(ctx, row, returnTo)}</td>
      </tr>`)
      .join('')}</tbody>
    <tfoot>
      <tr>
        <th scope="row">Total planned spending</th>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td>${formatCurrency(totalPlannedMonthlyPence)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>`;
  const mobileCardsId = 'planned-spending-mobile-cards';
  return responsiveFinanceTable(desktopTable, `
    <div class="mobile-card-summary">
      <span>Total planned spending</span>
      <strong>${formatCurrency(totalPlannedMonthlyPence)} / month</strong>
    </div>
    ${mobileSortControl(mobileCardsId, rows.length, [
      ['amount:desc', 'Planned monthly, high to low'],
      ['name:asc', 'Name, A to Z'],
      ['category:asc', 'Category, A to Z'],
      ['type:asc', 'Type, A to Z'],
      ['status:asc', 'Status, A to Z']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${rows.map((row) => plannedSpendingMobileCard(ctx, row, members, returnTo)).join('')}
    </div>
  `);
}

function plannedSpendingMobileCard(ctx, row, members, returnTo) {
  const status = row.status || (row.isActive === false ? 'Paused' : 'Active');
  const typeLabel = row.rowType === 'committed_cost' ? 'Regular' : 'Variable estimate';
  return `<article class="mobile-finance-card ${mobileStatusClass(status)}" data-mobile-sort-card
    data-sort-name="${escapeHtml(String(row.name || '').toLowerCase())}"
    data-sort-category="${escapeHtml(String(row.categoryName || '').toLowerCase())}"
    data-sort-type="${escapeHtml(typeLabel.toLowerCase())}"
    data-sort-amount="${Number(row.plannedMonthlyPence || 0)}"
    data-sort-status="${escapeHtml(status.toLowerCase())}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(row.name)}</h3>
        <p>${escapeHtml(row.categoryName)} · ${escapeHtml(typeLabel)}</p>
      </div>
      <span class="mobile-card-status ${mobileStatusClass(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${formatCurrency(row.plannedMonthlyPence)}</strong>
      <span>${escapeHtml(spendingOwnerLabel(row, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner / split</dt><dd>${escapeHtml(spendingOwnerLabel(row, members))}</dd></div>
      <div><dt>Frequency</dt><dd>${escapeHtml(spendingFrequencyLabel(row))}</dd></div>
      ${spendingTimingSummary(row) ? `<div><dt>Timing</dt><dd>${escapeHtml(spendingTimingSummary(row))}</dd></div>` : ''}
    </dl>
    <div class="mobile-card-actions">${spendingBudgetActions(ctx, row, returnTo)}</div>
  </article>`;
}

function formDisclosure(itemType, ctx, categories, members, returnTo, options = {}, savingsAccounts = []) {
  const label = itemType === 'income' ? 'Add planned income' : 'Add planned spending';
  const modalId = `${itemType}-modal`;
  return `<button type="button" data-open-modal="${modalId}" data-reset-modal="true">${label}</button>
    <dialog id="${modalId}" class="modal" data-modal>
      <div class="modal-panel">
        <div class="modal-heading">
          <div>
            <h2>${itemType === 'income' ? 'Planned income details' : 'Planned spending details'}</h2>
          </div>
          <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
        </div>
      ${itemType === 'income' ? incomeForm(ctx, members, returnTo, savingsAccounts) : expenseForm(ctx, categories, members, returnTo, options)}
      </div>
    </dialog>`;
}

function plannedSpendingModal(ctx, categories, members, returnTo, rows) {
  return `<dialog id="planned-spending-modal" class="modal" data-modal>
    <div class="modal-panel">
      <div class="modal-heading">
        <div>
          <h2>Planned spending details</h2>
        </div>
        <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
      </div>
      ${plannedSpendingForm(ctx, categories, members, returnTo, rows)}
    </div>
  </dialog>`;
}

function plannedSpendingForm(ctx, categories, members, returnTo, rows) {
  const expenseCategories = categories.filter((category) => ['expense', 'debt'].includes(category.kind));
  const suggestedCategoryId = suggestedExpenseCategoryId(ctx, expenseCategories);
  const firstMemberLabel = ownerLabel('person_a', members);
  const secondMemberLabel = ownerLabel('person_b', members);

  return `<form method="post" action="/budget-plan/spending" class="stack budget-form modal-form" data-stepped-form>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <div class="modal-stepper">
      <div class="modal-stepper-meta">
        <span class="modal-stepper-count">Step <strong data-step-current>1</strong> of <span data-step-total>3</span></span>
        <strong class="modal-stepper-title" data-step-title>Basic details</strong>
      </div>
      <div class="modal-stepper-track"><div class="modal-stepper-bar" data-step-progress-bar></div></div>
    </div>
    <section class="form-section" data-form-step data-step-title="Basic details">
      <h3>Basic details</h3>
      <label>Spending type
        <select name="spending_type" data-controls data-modal-field="spendingType">
          <option value="regular">Regular</option>
          <option value="variable_estimate">Variable estimate</option>
        </select>
      </label>
      <p class="hint">Add the spending you expect as part of your usual plan. Use regular costs for predictable payments and variable estimates for things like groceries, transport, and eating out.</p>
      <label>Name <input name="name" maxlength="120" data-modal-field="name" data-required-when-visible="true"></label>
      <label>Owner <select name="owner_type" data-controls data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
      <fieldset>
        <legend>Shared split</legend>
        <div data-controlled-by="owner_type" data-show-when="shared">
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
              aria-label="Shared planned spending split"
            >
          </div>
        </div>
      </fieldset>
      <label>Category <select
        name="category_id"
        required
        data-modal-field="categoryId"
      >${categoryOptions(expenseCategories, suggestedCategoryId)}</select></label>
    </section>
    <div class="form-step-cluster" data-form-step data-step-title="Spending details" data-controlled-by="spending_type" data-show-when="regular">
    <section class="form-section">
      <h3>Regular spending details</h3>
      <p class="hint">Regular spending is predictable, such as mortgage, council tax, subscriptions, or insurance.</p>
      <label>Amount <input name="regular_amount" ${moneyInputAttrs({ min: '0.01' })} data-modal-field="regularAmount" data-required-when-visible="true" data-split-amount-source></label>
      <label>Frequency <select name="frequency" data-modal-field="frequency">${frequencyOptions('monthly')}</select></label>
    </section>
    </div>
    <section class="form-section" data-form-step data-step-title="Spending details" data-controlled-by="spending_type" data-show-when="variable_estimate" hidden>
      <h3>Variable estimate details</h3>
      <p class="hint">Use this for expected amounts such as groceries, transport, eating out, clothing, entertainment, or personal spending.</p>
      <label>Planned monthly amount <input name="variable_amount" ${moneyInputAttrs({ min: '0.01' })} data-modal-field="variableAmount" data-required-when-visible="true" data-split-amount-source></label>
    </section>
    <section class="form-section" data-form-step data-step-title="Timing and notes">
      <h3>Timing and notes</h3>
      <div class="grid two compact" data-controlled-by="spending_type" data-show-when="regular">
        <label>Start date <input name="start_date" type="date" value="${todayIso()}" data-modal-field="startDate"></label>
        <label>End date <input name="end_date" type="date" data-modal-field="endDate"></label>
      </div>
      <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer modal-footer-split">
      <div class="modal-footer-start">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
      </div>
      <div class="modal-footer-actions">
        <button type="button" class="secondary" data-step-back hidden>Back</button>
        <button type="button" data-step-next data-hide-on-final-step>Next</button>
        <button data-show-on-final-step hidden>Save planned spending</button>
      </div>
    </div>
  </form>`;
}

function incomeForm(ctx, members, returnTo, savingsAccounts = []) {
  const taxYears = listTaxYears();
  const pensionAccounts = savingsAccounts.filter((account) => isPensionAccountType(account.account_type));
  return `<form method="post" action="/income" class="stack budget-form modal-form modal-form--income" data-income-estimate-form data-stepped-form novalidate>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <div class="modal-stepper">
      <div class="modal-stepper-meta">
        <span class="modal-stepper-count">Step <strong data-step-current>1</strong> of <span data-step-total>5</span></span>
        <strong class="modal-stepper-title" data-step-title>Basic details</strong>
      </div>
      <div class="modal-stepper-track"><div class="modal-stepper-bar" data-step-progress-bar></div></div>
    </div>
    <div class="modal-form-main modal-form-main--full">
        <section class="form-section" data-form-step data-step-title="Basic details">
          <h3>Basic details</h3>
          <div class="grid two compact">
            <label>Name <input name="name" required maxlength="120" data-modal-field="name"></label>
            <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('person_a', members)}</select></label>
          </div>
          <label>How should this income be entered?
            <select name="income_entry_mode" data-controls data-modal-field="incomeEntryMode" data-income-summary-trigger>
              <option value="manual_net">Manual net income</option>
              <option value="estimated_from_gross">Estimate take-home pay from gross salary</option>
            </select>
          </label>
        </section>

        <section class="form-section" data-form-step data-step-title="Income amount" data-controlled-by="income_entry_mode" data-show-when="manual_net">
          <h3>Manual income</h3>
          <label>Net income <input name="manual_amount" ${moneyInputAttrs({ min: '0.01' })} data-required-when-visible="true" data-modal-field="manualAmount" data-income-summary-trigger></label>
          <label>Frequency <select name="manual_frequency" data-modal-field="manualFrequency" data-income-summary-trigger>${frequencyOptions('monthly')}</select></label>
        </section>

        <section class="form-section" data-form-step data-step-title="Salary details" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <h3>Salary details</h3>
          <label>Gross annual salary <input name="gross_annual_salary" ${moneyInputAttrs({ min: '0.01' })} data-required-when-visible="true" data-modal-field="grossAnnualSalary" data-income-summary-trigger></label>
          <div class="grid two compact">
            <label>Tax year <select name="tax_year" data-modal-field="taxYear" data-income-summary-trigger>${taxYearOptions(taxYears, latestTaxYear())}</select></label>
            <label>How often are you paid? <select name="estimated_frequency" data-modal-field="estimatedFrequency" data-income-summary-trigger>${frequencyOptions('monthly')}</select></label>
          </div>
        </section>

        <section class="form-section" data-form-step data-step-title="Student loans" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <h3>Student loans</h3>
          <div class="grid two compact">
            <label>Do you repay a student loan?
              <select name="has_student_loan" data-controls data-modal-field="hasStudentLoan" data-income-summary-trigger>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label data-controlled-by="has_student_loan" data-show-when="yes" hidden>Student loan repayment plan
              <select name="student_loan_plan" data-modal-field="studentLoanPlan" data-required-when-visible="true" data-income-summary-trigger>
                <option value="">Choose a plan</option>
                <option value="plan_1">Plan 1</option>
                <option value="plan_2">Plan 2</option>
                <option value="plan_4">Plan 4</option>
                <option value="plan_5">Plan 5</option>
              </select>
            </label>
          </div>
          <label>Do you repay a postgraduate loan?
            <select name="has_postgraduate_loan" data-modal-field="hasPostgraduateLoan" data-income-summary-trigger>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </label>
        </section>

        <section class="form-section" data-form-step data-step-title="Pension" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <h3>Pension contributions from this income</h3>
          <p class="hint">Use this for employee pension deductions from this income. Employer contributions can feed pension projections, but they do not reduce household take-home income.</p>
          <div class="pension-form-stack">
            <label>Do you contribute to a pension?
              <select name="has_pension" data-controls data-modal-field="hasPension" data-income-summary-trigger>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <div class="pension-form-card" data-controlled-by="has_pension" data-show-when="yes" hidden>
              <h4>Pension contributions from this income</h4>
              <div class="grid two compact">
                <label>Scheme type
                  <select name="pension_scheme_type" data-controls data-modal-field="pensionSchemeType">
                    <option value="defined_contribution">Defined contribution / money purchase</option>
                    <option value="defined_benefit">Defined benefit / career average / final salary</option>
                    <option value="sipp">SIPP / personal pension</option>
                    <option value="other">Other / not sure</option>
                  </select>
                </label>
                <label>Contribution method
                  <select name="pension_contribution_method" data-controls data-modal-field="pensionContributionMethod" data-income-summary-trigger>
                    <option value="salary_sacrifice">Salary sacrifice</option>
                    <option value="net_pay">Net pay arrangement</option>
                    <option value="relief_at_source">Relief at source / personal contribution</option>
                    <option value="employer_only">Employer only</option>
                    <option value="not_sure">Not sure</option>
                  </select>
                </label>
              </div>
              <p class="hint" data-controlled-by="pension_contribution_method" data-show-when="salary_sacrifice">Salary sacrifice is treated as a pre-tax deduction for this estimate and reduces taxable and National Insurance-able pay.</p>
              <p class="hint" data-controlled-by="pension_contribution_method" data-show-when="net_pay" hidden>Net pay is treated as before Income Tax but normally after National Insurance for this estimate.</p>
              <p class="hint" data-controlled-by="pension_contribution_method" data-show-when="relief_at_source" hidden>Relief at source is treated as paid from net pay. Provider tax relief is not counted as household income.</p>
              <p class="hint" data-controlled-by="pension_contribution_method" data-show-when="employer_only" hidden>Employer-only contributions do not reduce household take-home pay.</p>
              <p class="hint" data-controlled-by="pension_contribution_method" data-show-when="not_sure" hidden>This estimate treats the employee contribution as paid from net pay. Check your payslip if accuracy matters.</p>
              <div class="grid two compact">
                <label data-controlled-by="pension_contribution_method" data-hide-when="employer_only">Employee contribution
                  <select name="pension_contribution_type" data-controls data-modal-field="pensionContributionType" data-income-summary-trigger>
                    <option value="none">Choose contribution type</option>
                    <option value="percentage">Percentage of gross salary</option>
                    <option value="fixed_monthly">Fixed monthly amount</option>
                    <option value="fixed_annual">Fixed annual amount</option>
                  </select>
                </label>
                <label data-controlled-by="pension_contribution_method" data-hide-when="employer_only">Contribution value <input name="pension_contribution_value" ${decimalInputAttrs({ min: '0', max: '100000000' })} data-modal-field="pensionContributionValue" data-income-summary-trigger></label>
              </div>
              <details class="form-details">
                <summary>Advanced tax treatment</summary>
                <label>Tax treatment override
                  <select name="pension_contribution_tax_treatment" data-modal-field="pensionContributionTaxTreatment" data-income-summary-trigger>
                    <option value="">Use contribution method</option>
                    <option value="pre_tax">Before Income Tax</option>
                    <option value="post_tax">From net pay</option>
                  </select>
                </label>
              </details>
              <p class="hint" data-controlled-by="pension_scheme_type" data-show-when="defined_benefit" hidden>For defined benefit pensions, enter the employee contribution deducted from pay. The app tracks the pay impact, not the actuarial value of the pension promise.</p>
            </div>
            <div class="pension-form-card" data-controlled-by="has_pension" data-show-when="yes" hidden>
              <h4>Link to pension pot or entitlement</h4>
              <p class="hint">Use this if you want the employee deduction and any employer contribution to feed a pension pot, entitlement, linked goals, and long-term projections.</p>
              <label>Pension pot or entitlement
                <select name="pension_tracking_mode" data-controls data-modal-field="pensionTrackingMode">
                  <option value="none">Do not link</option>
                  ${pensionAccounts.length ? '<option value="link_existing">Link existing pension pot / entitlement</option>' : ''}
                  <option value="create_new">Create a pension pot in Savings</option>
                </select>
              </label>
              <label data-controlled-by="pension_tracking_mode" data-show-when="link_existing" hidden>Existing pension pot or entitlement
                <select name="linked_savings_account_id" data-modal-field="linkedSavingsAccountId">
                  <option value="">Choose a pension pot or entitlement</option>
                  ${pensionAccountOptions(pensionAccounts, members)}
                </select>
              </label>
              <label data-controlled-by="pension_tracking_mode" data-show-when="create_new" hidden>Pension pot name
                <input name="new_pension_account_name" maxlength="120" placeholder="e.g. Workplace pension" data-modal-field="newPensionAccountName">
              </label>
            </div>
            <div class="pension-form-card" data-controlled-by="pension_tracking_mode" data-show-when="link_existing|create_new" hidden>
              <h4>Employer contribution</h4>
              <p class="hint">Employer contributions increase the linked pension pot projection but do not reduce household income.</p>
              <div class="grid two compact">
                <label>Does your employer contribute?
                  <select name="has_employer_pension_contribution" data-controls data-modal-field="hasEmployerPensionContribution">
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
                <label data-controlled-by="has_employer_pension_contribution" data-show-when="yes" hidden>Employer contribution
                  <select name="employer_pension_contribution_type" data-controls data-modal-field="employerPensionContributionType">
                    <option value="none">Choose contribution type</option>
                    <option value="percentage">Percentage of gross salary</option>
                    <option value="fixed_monthly">Fixed monthly amount</option>
                    <option value="fixed_annual">Fixed annual amount</option>
                  </select>
                </label>
              </div>
              <div class="grid two compact" data-controlled-by="has_employer_pension_contribution" data-show-when="yes" hidden>
                <label>Employer contribution amount <input name="employer_pension_contribution_value" ${decimalInputAttrs({ min: '0', max: '100000000' })} data-modal-field="employerPensionContributionValue"></label>
                <div class="hint-block">
                  <p class="hint">For matching, choose percentage and enter the employer percentage, for example 9.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section" data-form-step data-step-title="Other deductions" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <h3>Other deductions</h3>
          <p class="hint">Optional. Add regular deductions that appear on your payslip.</p>
          <div class="grid two compact">
            <label>Other deductions before tax <input name="other_pre_tax_deductions" ${moneyInputAttrs()} data-modal-field="otherPreTaxDeductions" data-income-summary-trigger></label>
            <label>Other deductions after tax <input name="other_post_tax_deductions" ${moneyInputAttrs()} data-modal-field="otherPostTaxDeductions" data-income-summary-trigger></label>
          </div>
        </section>

        <section class="form-section" data-form-step data-step-title="Timing and notes">
          <h3>Timing and notes</h3>
          <div class="grid two compact">
            <label>Start date <input name="start_date" type="date" value="${todayIso()}" data-modal-field="startDate"></label>
            <label>End date <input name="end_date" type="date" data-modal-field="endDate"></label>
          </div>
          <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
        </section>
    </div>
    <div class="flash error" data-income-estimate-error hidden></div>
    <div class="modal-footer modal-footer-split">
      <div class="modal-footer-start">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
      </div>
      <div class="modal-footer-actions">
        <button type="button" class="secondary" data-step-back hidden>Back</button>
        <button type="button" data-step-next data-hide-on-final-step>Next</button>
        <button name="action" value="save" data-show-on-final-step hidden>Save income</button>
      </div>
    </div>
  </form>`;
}

function expenseForm(ctx, categories, members, returnTo, options = {}) {
  const expenseCategories = categories.filter((category) => ['expense', 'debt'].includes(category.kind));
  const suggestedCategoryId = suggestedExpenseCategoryId(ctx, expenseCategories);
  const firstMemberLabel = ownerLabel('person_a', members);
  const secondMemberLabel = ownerLabel('person_b', members);
  return `<form method="post" action="/expenses" class="stack budget-form modal-form">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <section class="form-section">
      <h3>Cost details</h3>
    <label>Name <input name="name" required maxlength="120" data-modal-field="name"></label>
    <label>Category <select name="category_id" data-modal-field="categoryId" data-spending-warning-select data-warning-category-ids="${escapeHtml((options.duplicateCategoryIds || []).join(','))}" data-warning-message="${escapeHtml(options.duplicateMessage || '')}">${categoryOptions(expenseCategories, suggestedCategoryId)}</select></label>
    <p class="hint">Use this for recurring or predictable payments such as rent, mortgage, council tax, utilities, insurance, subscriptions, childcare, loans, and phone contracts.</p>
    <p class="inline-hint warning-text" data-spending-duplicate-warning hidden></p>
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
    <div class="modal-footer">
      <button>Save expense</button>
    </div>
  </form>`;
}

function suggestedExpenseCategoryId(ctx, categories) {
  const suggestedCategories = String(ctx.query.get('suggested_category') || '')
    .split('|')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!suggestedCategories.length) return '';
  return categories.find((category) => suggestedCategories.includes(String(category.name || '').trim().toLowerCase()))?.id || '';
}

function incomeItemsTable(ctx, items, members, returnTo = '/budget-plan/income') {
  if (!items.length) {
    return `<div class="empty-state compact">
      <h3>No planned income yet</h3>
      <p>Add salary, regular income, benefits, or estimated take-home pay to start building your budget plan.</p>
      <button type="button" data-open-modal="income-modal" data-reset-modal="true">Add planned income</button>
    </div>`;
  }

  const totalPlannedMonthlyPence = items.reduce((total, item) => total + Number(item.monthly_equivalent_pence || 0), 0);
  const desktopTable = `<table class="data-table income-plan-table">
    <thead><tr><th>Name</th><th>Owner</th><th>Frequency</th><th>Planned monthly</th><th>Status</th><th class="actions-col">Actions</th></tr></thead>
    <tbody>${items.map((item) => incomeTableRows(ctx, item, members, returnTo)).join('')}</tbody>
    <tfoot>
      <tr>
        <th scope="row">Total planned income</th>
        <td></td>
        <td></td>
        <td>${formatCurrency(totalPlannedMonthlyPence)}</td>
        <td></td>
        <td></td>
      </tr>
    </tfoot>
  </table>`;
  const mobileCardsId = 'planned-income-mobile-cards';
  return `${responsiveFinanceTable(desktopTable, `
    <div class="mobile-card-summary">
      <span>Total planned income</span>
      <strong>${formatCurrency(totalPlannedMonthlyPence)} / month</strong>
    </div>
    ${mobileSortControl(mobileCardsId, items.length, [
      ['amount:desc', 'Planned monthly, high to low'],
      ['name:asc', 'Name, A to Z'],
      ['owner:asc', 'Owner, A to Z'],
      ['status:asc', 'Status, A to Z']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${items.map((item) => incomeMobileCard(ctx, item, members, returnTo)).join('')}
    </div>
  `)}`;
}

function incomeTableRows(ctx, item, members, returnTo) {
  const breakdownId = `income-breakdown-${item.id}`;
  return `<tr>
      <td>
        <div class="cell-stack">
          <strong>${escapeHtml(item.name)}</strong>
          <small class="hint">${escapeHtml(incomeMethodSummary(item))}</small>
        </div>
      </td>
      <td>${escapeHtml(ownerLabel(item.owner_type, members))}</td>
      <td>${escapeHtml(incomeFrequencySummary(item))}</td>
      <td>${formatCurrency(item.monthly_equivalent_pence)}</td>
      <td>${escapeHtml(itemStatusLabel(item))}</td>
      <td class="actions-col">
        <div class="table-actions">
          ${actionIconButton({
            label: 'View income breakdown',
            icon: 'view',
            variant: 'view',
            attributes: `aria-expanded="false" data-toggle-row="${escapeHtml(breakdownId)}"`
          })}
          ${actionIconButton({
            label: 'Edit income',
            icon: 'edit',
            variant: 'edit',
            attributes: `data-open-modal="income-modal"
              data-reset-modal="true"
              ${incomeEditAttributes(item)}`
          })}
          <form method="post" action="/budget-item/toggle">
            ${csrfField(ctx)}
            <input type="hidden" name="id" value="${item.id}">
            <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
            <input type="hidden" name="is_active" value="${item.is_active ? '0' : '1'}">
            ${actionIconButton({
              label: Number(item.is_active) === 1 ? 'Pause income' : 'Resume income',
              icon: Number(item.is_active) === 1 ? 'pause' : 'play',
              variant: Number(item.is_active) === 1 ? 'warn' : 'good',
              type: 'submit'
            })}
          </form>
          <form method="post" action="/budget-item/delete" data-confirm="Delete this income item?">
            ${csrfField(ctx)}
            <input type="hidden" name="id" value="${item.id}">
            <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
            ${actionIconButton({ label: 'Delete income', icon: 'delete', variant: 'delete', type: 'submit' })}
          </form>
        </div>
      </td>
    </tr>
    <tr id="${escapeHtml(breakdownId)}" class="income-breakdown-row" hidden>
      <td colspan="6">${incomeBreakdownCard(item)}</td>
    </tr>`;
}

function incomeMobileCard(ctx, item, members, returnTo) {
  const status = itemStatusLabel(item);
  const breakdownId = `income-breakdown-mobile-${item.id}`;
  return `<article class="mobile-finance-card ${mobileStatusClass(status)}" data-mobile-sort-card
    data-sort-name="${escapeHtml(String(item.name || '').toLowerCase())}"
    data-sort-owner="${escapeHtml(ownerLabel(item.owner_type, members).toLowerCase())}"
    data-sort-amount="${Number(item.monthly_equivalent_pence || 0)}"
    data-sort-status="${escapeHtml(status.toLowerCase())}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(incomeMethodSummary(item))}</p>
      </div>
      <span class="mobile-card-status ${mobileStatusClass(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${formatCurrency(item.monthly_equivalent_pence)}</strong>
      <span>${escapeHtml(ownerLabel(item.owner_type, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel(item.owner_type, members))}</dd></div>
      <div><dt>Frequency</dt><dd>${escapeHtml(incomeFrequencySummary(item))}</dd></div>
    </dl>
    <div class="mobile-card-actions">
      ${incomeMobileActions(ctx, item, returnTo, breakdownId)}
    </div>
    <div id="${escapeHtml(breakdownId)}" hidden>${incomeBreakdownCard(item)}</div>
  </article>`;
}

function incomeMobileActions(ctx, item, returnTo, breakdownId) {
  return `<div class="table-actions">
    ${actionIconButton({
      label: 'View income breakdown',
      icon: 'view',
      variant: 'view',
      attributes: `aria-expanded="false" data-toggle-row="${escapeHtml(breakdownId)}"`
    })}
    ${actionIconButton({
      label: 'Edit income',
      icon: 'edit',
      variant: 'edit',
      attributes: `data-open-modal="income-modal"
        data-reset-modal="true"
        ${incomeEditAttributes(item)}`
    })}
    <form method="post" action="/budget-item/toggle">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${item.id}">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      <input type="hidden" name="is_active" value="${item.is_active ? '0' : '1'}">
      ${actionIconButton({
        label: Number(item.is_active) === 1 ? 'Pause income' : 'Resume income',
        icon: Number(item.is_active) === 1 ? 'pause' : 'play',
        variant: Number(item.is_active) === 1 ? 'warn' : 'good',
        type: 'submit'
      })}
    </form>
    <form method="post" action="/budget-item/delete" data-confirm="Delete this income item?">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${item.id}">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      ${actionIconButton({ label: 'Delete income', icon: 'delete', variant: 'delete', type: 'submit' })}
    </form>
  </div>`;
}

function incomeMethodSummary(item) {
  if (item.income_entry_mode === 'estimated_from_gross') {
    return `Estimated from gross salary · ${formatTaxYearLabel(item.estimate_tax_year || '')} tax year · ${studentLoanMethodSummary(item)}`;
  }
  if (item.frequency === 'yearly') return 'Yearly income';
  return 'Manual net income';
}

function incomeFrequencySummary(item) {
  if (item.income_entry_mode === 'estimated_from_gross') {
    return `Gross salary, ${formatCurrency(item.estimate_gross_annual_salary_pence || 0)}/year`;
  }
  if (item.frequency === 'yearly') {
    return `Yearly, ${formatCurrency(item.amount_pence || 0)}/year`;
  }
  return `Net income, ${formatCurrency(item.amount_pence || 0)}/month`;
}

function itemStatusLabel(item) {
  if (item.end_date && item.end_date < todayIso()) return 'Ended';
  return Number(item.is_active) === 1 ? 'Active' : 'Paused';
}

function incomeBreakdownCard(item) {
  if (item.income_entry_mode === 'estimated_from_gross') {
    return `<div class="inline-detail-card">
      <div class="inline-detail-grid">
        <section>
          <h3>Gross pay</h3>
          <dl>
            <div><dt>Gross annual salary</dt><dd>${formatCurrency(item.estimate_gross_annual_salary_pence || 0)}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Deductions</h3>
          <dl>
            <div><dt>Income Tax</dt><dd>${formatCurrency(0 - Number(item.estimate_income_tax_pence || 0))}</dd></div>
            <div><dt>National Insurance</dt><dd>${formatCurrency(0 - Number(item.estimate_national_insurance_pence || 0))}</dd></div>
            <div><dt>Student loan repayment</dt><dd>${formatCurrency(0 - Number(item.estimate_student_loan_repayment_pence || 0))}</dd></div>
            ${Number(item.estimate_has_postgraduate_loan) ? `<div><dt>Postgraduate loan repayment</dt><dd>${formatCurrency(0 - Number(item.estimate_postgraduate_loan_repayment_pence || 0))}</dd></div>` : ''}
            ${Number(item.estimate_pension_contribution_pence || 0) > 0 ? `<div><dt>Pension contribution</dt><dd>${formatCurrency(0 - Number(item.estimate_pension_contribution_pence || 0))}</dd></div>` : ''}
            ${Number(item.estimate_other_deductions_pence || 0) > 0 ? `<div><dt>Other deductions</dt><dd>${formatCurrency(0 - Number(item.estimate_other_deductions_pence || 0))}</dd></div>` : ''}
          </dl>
        </section>
        <section>
          <h3>Estimated take-home pay</h3>
          <dl>
            <div><dt>Estimated net annual income</dt><dd>${formatCurrency(item.estimate_net_annual_income_pence || 0)}</dd></div>
            <div><dt>Estimated net monthly income</dt><dd>${formatCurrency(item.estimate_net_monthly_income_pence || 0)}</dd></div>
            <div><dt>Monthly amount used in budget plan</dt><dd>${formatCurrency(item.monthly_equivalent_pence || 0)}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Assumptions</h3>
          <dl>
            <div><dt>Income entry method</dt><dd>Estimated from gross salary</dd></div>
            <div><dt>Tax year</dt><dd>${escapeHtml(formatTaxYearLabel(item.estimate_tax_year || ''))}</dd></div>
            <div><dt>Student loan</dt><dd>${escapeHtml(studentLoanAssumptionLabel(item))}</dd></div>
            <div><dt>Postgraduate loan</dt><dd>${Number(item.estimate_has_postgraduate_loan) ? 'Yes' : 'No'}</dd></div>
            <div><dt>Pension treatment</dt><dd>${escapeHtml(pensionTreatmentLabel(item))}</dd></div>
            <div><dt>Pay frequency</dt><dd>${escapeHtml(capitalise(item.estimate_pay_frequency || item.frequency || 'monthly'))}</dd></div>
            <div><dt>Calculation type</dt><dd>Budgeting estimate</dd></div>
          </dl>
        </section>
      </div>
    </div>`;
  }

  const enteredAmountLabel = item.frequency === 'yearly'
    ? `${formatCurrency(item.amount_pence || 0)}/year`
    : `${formatCurrency(item.amount_pence || 0)}/month`;

  if (item.frequency === 'yearly') {
    return `<div class="inline-detail-card">
      <div class="inline-detail-grid compact">
        <section>
          <h3>Yearly income</h3>
          <dl>
            <div><dt>Entered amount</dt><dd>${enteredAmountLabel}</dd></div>
            <div><dt>Monthly equivalent</dt><dd>${formatCurrency(item.monthly_equivalent_pence || 0)}/month</dd></div>
            <div><dt>Calculation</dt><dd>${formatCurrency(item.amount_pence || 0)} ÷ 12</dd></div>
            <div><dt>Monthly amount used in budget plan</dt><dd>${formatCurrency(item.monthly_equivalent_pence || 0)}</dd></div>
          </dl>
        </section>
      </div>
    </div>`;
  }

  return `<div class="inline-detail-card">
    <div class="inline-detail-grid compact">
      <section>
        <h3>Manual net income</h3>
        <dl>
          <div><dt>Entered amount</dt><dd>${enteredAmountLabel}</dd></div>
          <div><dt>Monthly amount used in budget plan</dt><dd>${formatCurrency(item.monthly_equivalent_pence || 0)}</dd></div>
          <div><dt>Tax calculation</dt><dd>No tax calculation applied.</dd></div>
        </dl>
      </section>
    </div>
  </div>`;
}

function studentLoanMethodSummary(item) {
  const labels = parseEstimateStudentLoanPlans(item).map((plan) => studentLoanPlanLabel(plan));
  if (Number(item.estimate_has_postgraduate_loan)) labels.push('Postgraduate Loan');
  return labels.length ? labels.join(' + ') : 'No student loan';
}

function studentLoanAssumptionLabel(item) {
  const labels = parseEstimateStudentLoanPlans(item).map((plan) => studentLoanPlanLabel(plan));
  return labels.length ? labels.join(' + ') : 'No undergraduate student loan';
}

function studentLoanPlanLabel(plan) {
  return {
    plan_1: 'Plan 1',
    plan_2: 'Plan 2',
    plan_4: 'Plan 4',
    plan_5: 'Plan 5'
  }[plan] || plan;
}

function pensionTreatmentLabel(item) {
  if ((item.estimate_pension_contribution_type || 'none') === 'none') return 'Not set';
  const methodLabel = pensionContributionMethodLabel(item.estimate_pension_contribution_method || inferPensionContributionMethod(item));
  return {
    pre_tax: `${methodLabel} · before Income Tax`,
    post_tax: `${methodLabel} · from net pay`
  }[item.estimate_pension_contribution_tax_treatment] || methodLabel;
}

function pensionContributionMethodLabel(method) {
  return {
    salary_sacrifice: 'Salary sacrifice',
    net_pay: 'Net pay arrangement',
    relief_at_source: 'Relief at source',
    employer_only: 'Employer only',
    not_sure: 'Not sure'
  }[method] || 'Not set';
}

function formatTaxYearLabel(taxYear) {
  if (!taxYear) return 'Tax year not set';
  const [start, end] = String(taxYear).split('-');
  if (!start || !end) return taxYear;
  return `${start}/${String(end).slice(-2)}`;
}

function pensionAccountOptions(accounts, members) {
  return accounts
    .map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(ownerLabel(account.owner_type, members))}</option>`)
    .join('');
}

function capitalise(value) {
  const text = String(value || '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function itemsTable(ctx, items, members, itemType, emptyMessage = 'No items yet.', returnTo = itemType === 'income' ? '/budget-plan/income' : '/budget-plan/spending') {
  if (!items.length) return budgetItemEmptyState(itemType, emptyMessage);
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

function budgetItemEmptyState(itemType, fallbackMessage) {
  if (itemType === 'income') {
    return `<div class="empty-state compact">
      <h3>No planned income yet</h3>
      <p>Add salary, regular income, or an estimated take-home pay item to start your Budget Plan.</p>
      <button type="button" data-open-modal="income-modal" data-reset-modal="true">Add planned income</button>
    </div>`;
  }

  if (itemType === 'expense') {
    return `<div class="empty-state compact">
      <h3>No bills or regular costs yet</h3>
      <p>Add rent, mortgage, council tax, utilities, subscriptions, insurance, debt repayments, or other regular planned spending.</p>
      <button type="button" data-open-modal="expense-modal" data-reset-modal="true">Add planned spending</button>
    </div>`;
  }

  return `<p class="empty">${escapeHtml(fallbackMessage)}</p>`;
}

function incomeEditAttributes(item) {
  const studentLoanPlans = parseEstimateStudentLoanPlans(item);
  const pensionContributionValue =
    ['fixed_amount', 'fixed_monthly', 'fixed_annual'].includes(item.estimate_pension_contribution_type)
      ? moneyInputValue(item.estimate_pension_contribution_value || 0)
      : escapeHtml(item.estimate_pension_contribution_value || '');
  const pensionSchemeType = item.estimate_pension_scheme_type || inferPensionSchemeType(item);

  return [
    `data-fill-id="${escapeHtml(item.id)}"`,
    `data-fill-name="${escapeHtml(item.name)}"`,
    `data-fill-owner-type="${escapeHtml(item.owner_type)}"`,
    `data-fill-income-entry-mode="${escapeHtml(item.income_entry_mode || 'manual_net')}"`,
    `data-fill-has-student-loan="${studentLoanPlans.length ? 'yes' : 'no'}"`,
    `data-fill-manual-amount="${item.income_entry_mode === 'manual_net' ? moneyInputValue(item.amount_pence) : ''}"`,
    `data-fill-manual-frequency="${escapeHtml(item.frequency || 'monthly')}"`,
    `data-fill-gross-annual-salary="${item.estimate_gross_annual_salary_pence ? moneyInputValue(item.estimate_gross_annual_salary_pence) : ''}"`,
    `data-fill-estimated-frequency="${escapeHtml(item.estimate_pay_frequency || item.frequency || 'monthly')}"`,
    `data-fill-tax-year="${escapeHtml(item.estimate_tax_year || latestTaxYear())}"`,
    `data-fill-student-loan-plan="${escapeHtml(studentLoanPlans[0] || 'none')}"`,
    `data-fill-has-postgraduate-loan="${item.estimate_has_postgraduate_loan ? '1' : '0'}"`,
    `data-fill-has-pension="${hasIncomePensionDetails(item) ? 'yes' : 'no'}"`,
    `data-fill-pension-scheme-type="${escapeHtml(pensionSchemeType)}"`,
    `data-fill-pension-contribution-method="${escapeHtml(item.estimate_pension_contribution_method || inferPensionContributionMethod(item))}"`,
    `data-fill-pension-contribution-type="${escapeHtml(normaliseContributionType(item.estimate_pension_contribution_type || 'none'))}"`,
    `data-fill-pension-contribution-value="${pensionContributionValue}"`,
    `data-fill-pension-contribution-tax-treatment="${escapeHtml(item.estimate_pension_contribution_tax_treatment || 'pre_tax')}"`,
    `data-fill-pension-tracking-mode="${item.estimate_linked_savings_account_id ? 'link_existing' : 'none'}"`,
    `data-fill-linked-savings-account-id="${escapeHtml(item.estimate_linked_savings_account_id || '')}"`,
    `data-fill-new-pension-account-name="${escapeHtml(item.name ? `${item.name} pension` : 'Workplace pension')}"`,
    `data-fill-has-employer-pension-contribution="${item.estimate_employer_pension_contribution_type && item.estimate_employer_pension_contribution_type !== 'none' ? 'yes' : 'no'}"`,
    `data-fill-employer-pension-contribution-type="${escapeHtml(normaliseContributionType(item.estimate_employer_pension_contribution_type || 'none'))}"`,
    `data-fill-employer-pension-contribution-value="${['fixed_amount', 'fixed_monthly', 'fixed_annual'].includes(item.estimate_employer_pension_contribution_type) ? moneyInputValue(item.estimate_employer_pension_contribution_value || 0) : escapeHtml(item.estimate_employer_pension_contribution_value || '')}"`,
    `data-fill-other-pre-tax-deductions="${item.estimate_other_pre_tax_deductions_pence ? moneyInputValue(item.estimate_other_pre_tax_deductions_pence) : ''}"`,
    `data-fill-other-post-tax-deductions="${item.estimate_other_post_tax_deductions_pence ? moneyInputValue(item.estimate_other_post_tax_deductions_pence) : ''}"`,
    `data-fill-start-date="${escapeHtml(item.start_date || todayIso())}"`,
    `data-fill-end-date="${escapeHtml(item.end_date || '')}"`,
    `data-fill-notes="${escapeHtml(item.notes || '')}"`
  ].join(' ');
}

function inferPensionSchemeType(item) {
  if (['defined_contribution', 'defined_benefit', 'sipp', 'other'].includes(item.estimate_pension_scheme_type)) {
    return item.estimate_pension_scheme_type;
  }
  return 'defined_contribution';
}

function hasIncomePensionDetails(item) {
  return Boolean(
    (item.estimate_pension_contribution_type && item.estimate_pension_contribution_type !== 'none') ||
      (item.estimate_employer_pension_contribution_type && item.estimate_employer_pension_contribution_type !== 'none') ||
      item.estimate_linked_savings_account_id
  );
}

function inferPensionContributionMethod(item) {
  if (item.estimate_pension_scheme_type === 'salary_sacrifice') return 'salary_sacrifice';
  if (item.estimate_pension_contribution_tax_treatment === 'post_tax') return 'relief_at_source';
  return 'net_pay';
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

    const startDate = formDate(ctx.body.start_date);
    const endDate = ctx.body.end_date || null;
    assertDateOrder(startDate, endDate);

    const common = {
      householdId: ctx.user.household_id,
      name,
      itemType: 'income',
      categoryId: Number(ctx.body.category_id || 0) || null,
      ownerType,
      startDate,
      endDate,
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
      const pensionTracking = resolveIncomePensionTracking({
        ctx,
        db,
        estimate,
        existingItem,
        ownerType,
        incomeName: name
      });
      const estimatePayload = {
        householdId: ctx.user.household_id,
        budgetItemId: existingItem?.id || null,
        grossAnnualSalaryPence: estimate.grossAnnualSalaryPence,
        payFrequency: frequency,
        taxYear: estimate.taxYear,
        pensionSchemeType: estimate.pensionSchemeType,
        pensionContributionMethod: estimate.pensionContributionMethod,
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
        estimatedNetAnnualIncomePence: estimate.estimatedNetAnnualIncomePence,
        linkedSavingsAccountId: pensionTracking.linkedSavingsAccountId,
        employerPensionContributionType: pensionTracking.employerPensionContributionType,
        employerPensionContributionValue: pensionTracking.employerPensionContributionValue
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

function resolveIncomePensionTracking({ ctx, db, estimate, existingItem, ownerType, incomeName }) {
  const hasPension = String(ctx.body.has_pension || 'no') === 'yes';
  if (!hasPension) {
    return {
      linkedSavingsAccountId: null,
      employerPensionContributionType: 'none',
      employerPensionContributionValue: 0
    };
  }

  const trackingMode = requireChoice(ctx.body.pension_tracking_mode || 'none', ['none', 'link_existing', 'create_new'], 'Pension pot in Savings');
  const employerContribution = parseEmployerPensionContribution(ctx.body, estimate.grossAnnualSalaryPence);

  if (trackingMode === 'none') {
    return {
      linkedSavingsAccountId: null,
      employerPensionContributionType: employerContribution.type,
      employerPensionContributionValue: employerContribution.value
    };
  }

  const employeeMonthlyContributionPence = Math.round(Number(estimate.pensionContributionPence || 0) / 12);
  const employerMonthlyContributionPence = Math.round(Number(employerContribution.annualContributionPence || 0) / 12);
  if (trackingMode === 'link_existing') {
    const linkedSavingsAccountId = Number(ctx.body.linked_savings_account_id || 0) || null;
    if (!linkedSavingsAccountId) throw new Error('Choose an existing pension pot.');
    const existingAccount = findSavingsAccountById(db, ctx.user.household_id, linkedSavingsAccountId);
    if (!existingAccount || !isPensionAccountType(existingAccount.account_type)) {
      throw new Error('Selected pension pot or entitlement was not found.');
    }
    updateSavingsAccount(db, {
      id: existingAccount.id,
      householdId: ctx.user.household_id,
      name: existingAccount.name,
      providerName: existingAccount.provider_name,
      accountType: existingAccount.account_type,
      ownerType: existingAccount.owner_type,
      currentBalancePence: Number(existingAccount.current_balance_pence || 0),
      monthlyContributionPence: employeeMonthlyContributionPence,
      employerMonthlyContributionPence,
      availableForHouseholdCashflow: Number(existingAccount.available_for_household_cashflow) === 1,
      accessType: existingAccount.access_type,
      accessDate: existingAccount.access_date,
      accessAge: existingAccount.access_age,
      accessNotes: existingAccount.access_notes,
      projectedAnnualRate: Number(existingAccount.projected_annual_rate || 0),
      projectedRateType: existingAccount.projected_rate_type,
      includeLisaBonus: Number(existingAccount.include_lisa_bonus) === 1,
      annualChargePercentage: Number(existingAccount.annual_charge_percentage || 0),
      annualPensionEntitlementPence: Number(existingAccount.annual_pension_entitlement_pence || 0),
      lumpSumEntitlementPence: Number(existingAccount.lump_sum_entitlement_pence || 0),
      isActive: Number(existingAccount.is_active) === 1,
      notes: existingAccount.notes
    });
    return {
      linkedSavingsAccountId,
      employerPensionContributionType: employerContribution.type,
      employerPensionContributionValue: employerContribution.value
    };
  }

  const newAccountName = requireString(ctx.body.new_pension_account_name || `${incomeName} pension`, 'Pension pot name', 120);
  const createdAccount = createSavingsAccount(db, {
    householdId: ctx.user.household_id,
    name: newAccountName,
    providerName: null,
    accountType: pensionAccountTypeForScheme(estimate.pensionSchemeType),
    ownerType,
    currentBalancePence: 0,
    monthlyContributionPence: employeeMonthlyContributionPence,
    employerMonthlyContributionPence,
    availableForHouseholdCashflow: false,
    accessType: 'locked_until_age',
    accessDate: null,
    accessAge: null,
    accessNotes: 'Created from planned income pension settings.',
    projectedAnnualRate: 0,
    projectedRateType: 'growth',
    includeLisaBonus: false,
    annualChargePercentage: 0,
    annualPensionEntitlementPence: 0,
    lumpSumEntitlementPence: 0,
    isActive: true,
    notes: 'Review this pension pot in Savings to confirm balance, provider, and growth assumption.'
  });
  return {
    linkedSavingsAccountId: createdAccount.id,
    employerPensionContributionType: employerContribution.type,
    employerPensionContributionValue: employerContribution.value
  };
}

function pensionAccountTypeForScheme(schemeType) {
  if (schemeType === 'defined_benefit') return 'defined_benefit_pension';
  if (schemeType === 'sipp') return 'sipp_pension';
  return 'defined_contribution_pension';
}

function parseEmployerPensionContribution(body, grossAnnualSalaryPence) {
  const hasEmployerPensionContribution = String(body.has_employer_pension_contribution || 'no') === 'yes';
  if (!hasEmployerPensionContribution) {
    return { type: 'none', value: 0, annualContributionPence: 0 };
  }
  const type = normaliseContributionType(requireChoice(body.employer_pension_contribution_type || 'none', ['none', 'fixed_amount', 'fixed_monthly', 'fixed_annual', 'percentage'], 'Employer contribution'));
  if (type === 'none') {
    throw new Error('Choose an employer contribution type.');
  }
  const rawValue = body.employer_pension_contribution_value || '0';
  const value =
    type === 'fixed_monthly' || type === 'fixed_annual'
      ? requireMoney(rawValue, 'Employer contribution amount')
      : requireDecimal(rawValue, 'Employer contribution amount', { min: 0.01, max: 100 });
  const annualContributionPence =
    type === 'fixed_monthly'
      ? value * 12
      : type === 'fixed_annual'
        ? value
      : Math.round(Number(grossAnnualSalaryPence || 0) * (Number(value || 0) / 100));
  return { type, value, annualContributionPence };
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
  const hasStudentLoan = String(ctx.body.has_student_loan || 'no') === 'yes';
  const hasPension = String(ctx.body.has_pension || 'no') === 'yes';
  const pensionSchemeType = hasPension
    ? requireChoice(ctx.body.pension_scheme_type || 'defined_contribution', ['defined_contribution', 'defined_benefit', 'sipp', 'other'], 'Scheme type')
    : 'defined_contribution';
  const pensionContributionMethod = hasPension
    ? requireChoice(ctx.body.pension_contribution_method || 'salary_sacrifice', ['salary_sacrifice', 'net_pay', 'relief_at_source', 'employer_only', 'not_sure'], 'Contribution method')
    : 'salary_sacrifice';
  const pensionTypeRaw = hasPension && pensionContributionMethod !== 'employer_only' ? (ctx.body.pension_contribution_type || 'none') : 'none';
  if (hasStudentLoan && !ctx.body.student_loan_plan) {
    throw new Error('Student loan repayment plan is required.');
  }
  if (hasPension && pensionContributionMethod !== 'employer_only' && pensionTypeRaw === 'none') {
    throw new Error('Choose a pension contribution type.');
  }
  const pensionType = normaliseContributionType(requireChoice(pensionTypeRaw, ['none', 'fixed_amount', 'fixed_monthly', 'fixed_annual', 'percentage'], 'Employee contribution'));
  const rawPensionValue = pensionType === 'none' ? '0' : ctx.body.pension_contribution_value || '0';
  const pensionContributionValue =
    pensionType === 'fixed_monthly' || pensionType === 'fixed_annual'
      ? requireMoney(rawPensionValue, 'Contribution amount')
      : pensionType === 'percentage'
        ? requireDecimal(rawPensionValue, 'Contribution amount', { min: 0.01, max: 100 })
        : 0;
  const grossAnnualSalaryPence = requireMoney(ctx.body.gross_annual_salary, 'Gross annual salary');
  const taxTreatmentOverride = ctx.body.pension_contribution_tax_treatment
    ? requireChoice(ctx.body.pension_contribution_tax_treatment, ['pre_tax', 'post_tax'], 'Tax treatment')
    : null;

  return estimateTakeHomePay({
    grossAnnualSalaryPence,
    taxYear: requireString(ctx.body.tax_year, 'Tax year', 20),
    pensionSchemeType,
    pensionContributionMethod,
    pensionContributionType: pensionType,
    pensionContributionValue,
    pensionContributionTaxTreatment: taxTreatmentOverride,
    otherPreTaxDeductionsPence: optionalMoney(ctx.body.other_pre_tax_deductions, 'Other deductions before tax'),
    otherPostTaxDeductionsPence: optionalMoney(ctx.body.other_post_tax_deductions, 'Other deductions after tax'),
    studentLoanPlans: hasStudentLoan ? parseStudentLoanPlans(ctx.body) : [],
    hasPostgraduateLoan: checkboxValue(ctx.body.has_postgraduate_loan)
  });
}

function normaliseContributionType(type) {
  return type === 'fixed_amount' ? 'fixed_annual' : type;
}

function previewIncomeEstimateJson(ctx) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const estimate = buildEstimate(ctx);
    json(ctx.res, {
      ok: true,
      estimate: {
        grossAnnualSalaryPence: estimate.grossAnnualSalaryPence,
        estimatedIncomeTaxPence: estimate.estimatedIncomeTaxPence,
        estimatedNationalInsurancePence: estimate.estimatedNationalInsurancePence,
        estimatedStudentLoanRepaymentPence: estimate.estimatedStudentLoanRepaymentPence,
        estimatedPostgraduateLoanRepaymentPence: estimate.estimatedPostgraduateLoanRepaymentPence,
        pensionContributionPence: estimate.pensionContributionPence,
        estimatedOtherDeductionsPence: estimate.estimatedOtherDeductionsPence,
        estimatedNetAnnualIncomePence: estimate.estimatedNetAnnualIncomePence,
        estimatedNetMonthlyIncomePence: estimate.estimatedNetMonthlyIncomePence,
        taxYear: formatTaxYearLabel(estimate.taxYear),
        studentLoanPlan: estimate.studentLoanPlans.length ? estimate.studentLoanPlans.map((plan) => studentLoanPlanLabel(plan)).join(' + ') : 'No undergraduate student loan',
        postgraduateLoanStatus: estimate.hasPostgraduateLoan ? 'Yes' : 'No',
        pensionTreatment: String(ctx.body.has_pension || 'no') === 'yes'
          ? (ctx.body.pension_contribution_tax_treatment === 'unknown' ? 'Not sure' : pensionTreatmentLabel({
              estimate_pension_contribution_type: estimate.pensionContributionType,
              estimate_pension_contribution_tax_treatment: ctx.body.pension_contribution_tax_treatment
            }))
          : 'Not set',
        plannedMonthlyPence: estimate.estimatedNetMonthlyIncomePence
      }
    });
  } catch (error) {
    json(ctx.res, { ok: false, error: error.message || String(error) }, 400);
  }
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
    const startDate = formDate(ctx.body.start_date);
    const endDate = ctx.body.end_date || null;
    assertDateOrder(startDate, endDate);

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
      startDate,
      endDate,
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
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/budget-plan/spending', existingItem ? 'Expense updated.' : 'Expense saved.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/budget-plan/spending', error);
  }
}

function savePlannedSpending(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const spendingType = requireChoice(ctx.body.spending_type, ['regular', 'variable_estimate'], 'Spending type');
  return spendingType === 'regular'
    ? saveRegularPlannedSpending(ctx, db)
    : saveVariablePlannedSpending(ctx, db);
}

function saveRegularPlannedSpending(ctx, db) {
  try {
    const itemId = Number(ctx.body.id || 0) || null;
    const existingItem = itemId ? findBudgetItemById(db, ctx.user.household_id, itemId) : null;
    if (itemId && !existingItem) throw new Error('Planned spending item was not found.');
    const amountPence = requireMoney(ctx.body.regular_amount, 'Regular amount');
    const frequency = requireChoice(ctx.body.frequency, ['monthly', 'yearly'], 'Frequency');
    const ownerType = requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner');
    const splitType = ownerType === 'shared' ? requireChoice(ctx.body.split_type || 'equal', ['equal', 'manual_percentage'], 'Split type') : 'equal';
    const personAPercentage = splitType === 'manual_percentage' ? parsePercentage(ctx.body.person_a_percentage) : 50;
    const personBPercentage = splitType === 'manual_percentage' ? Math.round((100 - personAPercentage) * 100) / 100 : 50;
    const startDate = formDate(ctx.body.start_date);
    const endDate = ctx.body.end_date || null;
    assertDateOrder(startDate, endDate);

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
      startDate,
      endDate,
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
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/budget-plan/spending', existingItem ? 'Planned spending updated.' : 'Planned spending saved.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/budget-plan/spending', error);
  }
}

function saveVariablePlannedSpending(ctx, db) {
  const returnTo = ctx.body.return_to || spendingBudgetsReturnTo();
  try {
    const amountPence = requireMoney(ctx.body.variable_amount, 'Planned monthly amount');
    const categoryId = Number(ctx.body.category_id || 0) || null;
    if (!categoryId) throw new Error('Category is required.');
    const ownership = plannedSpendingOwnershipFromBody(ctx.body);

    saveCategoryBudgetDefault(db, {
      id: Number(ctx.body.id || 0) || null,
      householdId: ctx.user.household_id,
      categoryId,
      name: requireString(ctx.body.name, 'Name', 120),
      ...ownership,
      amountPence,
      notes: optionalString(ctx.body.notes),
      createdBy: ctx.user.id
    });

    redirectWithSuccess(ctx.res, returnTo, 'Planned spending saved.');
  } catch (error) {
    redirectWithError(ctx.res, returnTo, error);
  }
}

function plannedSpendingOwnershipFromBody(body) {
  const ownerType = requireChoice(body.owner_type || 'shared', ['person_a', 'person_b', 'shared'], 'Owner');
  const splitType = ownerType === 'shared' ? requireChoice(body.split_type || 'equal', ['equal', 'manual_percentage'], 'Split type') : 'equal';
  const personAPercentage = splitType === 'manual_percentage' ? parsePercentage(body.person_a_percentage) : 50;
  const personBPercentage = splitType === 'manual_percentage' ? Math.round((100 - personAPercentage) * 100) / 100 : 50;
  return {
    ownerType,
    splitType,
    personAPercentage,
    personBPercentage
  };
}

function assertDateOrder(startDate, endDate) {
  if (startDate && endDate && endDate < startDate) {
    throw new Error('End date must be after the start date.');
  }
}

function createOrUpdateCategoryBudgetAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const returnTo = ctx.body.return_to || spendingBudgetsReturnTo();
  try {
    const amountPence = requireMoney(ctx.body.amount, 'Planned monthly amount');
    const categoryId = Number(ctx.body.category_id || 0) || null;
    const budgetScope = requireChoice(ctx.body.budget_scope || 'default_monthly', ['default_monthly', 'month_override'], 'Target type');
    if (!categoryId) throw new Error('Category is required.');

    if (budgetScope === 'default_monthly') {
      saveCategoryBudgetDefault(db, {
        id: Number(ctx.body.id || 0) || null,
        householdId: ctx.user.household_id,
        categoryId,
        name: optionalString(ctx.body.name),
        ...plannedSpendingOwnershipFromBody(ctx.body),
        amountPence,
        notes: optionalString(ctx.body.notes),
        createdBy: ctx.user.id
      });
    } else {
      saveCategoryBudget(db, {
        id: Number(ctx.body.id || 0) || null,
        householdId: ctx.user.household_id,
        categoryId,
        name: optionalString(ctx.body.name),
        budgetMonth: requireBudgetMonth(ctx.body.budget_month),
        ...plannedSpendingOwnershipFromBody(ctx.body),
        amountPence,
        notes: optionalString(ctx.body.notes),
        createdBy: ctx.user.id
      });
    }

    redirectWithSuccess(ctx.res, returnTo, 'Planned spending saved.');
  } catch (error) {
    redirectWithError(ctx.res, returnTo, error);
  }
}

function deleteCategoryBudgetAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const returnTo = ctx.body.return_to || spendingBudgetsReturnTo();
  try {
    const budgetScope = requireChoice(ctx.body.budget_scope || 'default_monthly', ['default_monthly', 'month_override'], 'Target type');
    if (budgetScope === 'default_monthly') {
      deleteCategoryBudgetDefault(db, ctx.user.household_id, Number(ctx.body.id));
    } else {
      deleteCategoryBudget(db, ctx.user.household_id, Number(ctx.body.id));
    }
    redirectWithSuccess(ctx.res, returnTo, 'Planned spending deleted.');
  } catch (error) {
    redirectWithError(ctx.res, returnTo, error);
  }
}

function toggleBudgetItem(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  setBudgetItemActive(db, ctx.user.household_id, Number(ctx.body.id), ctx.body.is_active === '1');
  redirect(ctx.res, ctx.body.return_to || '/dashboard');
}

function toggleCategoryBudgetDefaultAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  setCategoryBudgetDefaultActive(db, ctx.user.household_id, Number(ctx.body.id), ctx.body.is_active === '1');
  redirect(ctx.res, ctx.body.return_to || spendingBudgetsReturnTo());
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
