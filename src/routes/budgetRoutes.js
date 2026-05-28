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
import { savingsAccountTypeLabel } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems } from '../services/savingsService.js';
import { buildUnifiedSpendingBudgetRows, plannedSpendingCategorySeries, plannedSpendingSummary, spendingCategoryKey } from '../services/spendingBudgetService.js';
import { estimateTakeHomePay } from '../services/takeHomePayService.js';
import { listTaxYears, latestTaxYear } from '../services/taxRulesService.js';
import { addMonths, currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { optionalMoney, optionalString, parsePercentage, requireChoice, requireDecimal, requireMoney, requireString } from '../utils/validation.js';
import { actionIconButton, csrfField, escapeHtml, formatCurrency, moneyInputValue, ownerLabel, page } from '../views/html.js';
import { categoryOptions, decimalInputAttrs, frequencyOptions, moneyInputAttrs, ownerOptions, taxYearOptions } from '../views/forms.js';
import { pieChart } from '../views/charts.js';
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
  router.post('/expenses', (ctx) => createExpense(ctx, db));
  router.post('/budget-item/delete', (ctx) => deleteBudgetItemAction(ctx, db));
  router.post('/expenses/category-budgets', (ctx) => createOrUpdateCategoryBudgetAction(ctx, db));
  router.post('/expenses/category-budgets/delete', (ctx) => deleteCategoryBudgetAction(ctx, db));
  router.post('/budget-item/toggle', (ctx) => toggleBudgetItem(ctx, db));
}

function renderBudgetPlanOverview(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = ctx.query.get('month') || currentMonth();
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const activeItems = listActiveBudgetItems(db, ctx.user.household_id);
  const goals = listSavingsGoals(db, ctx.user.household_id);
  const savingsAccounts = listSavingsAccounts(db, ctx.user.household_id, { activeOnly: true });
  const planningItems = [...activeItems, ...plannedSavingsBudgetItems({ goals, accounts: savingsAccounts })];
  const plan = plannedMonthlySummary(planningItems, month);
  const defaultBudgets = listCategoryBudgetDefaults(db, ctx.user.household_id);
  const monthBudgets = listCategoryBudgets(db, ctx.user.household_id, { startMonth: month, endMonth: month });
  const spendingSummary = plannedSpendingSummary({
    expenseItems: activeItems,
    defaultBudgets,
    monthBudgets,
    month
  });
  const plannedSpendingPence = spendingSummary.totalPlannedSpendingPence;
  const plannedSavingsContributionsPence = plan.plannedSavingsPence;
  const plannedSurplusPence = plan.plannedIncomePence - plannedSpendingPence - plannedSavingsContributionsPence;

  const incomeItems = plan.activeItems.filter((item) => item.item_type === 'income');
  const expenseItems = plan.activeItems.filter((item) => item.item_type === 'expense');
  const savingsItems = plan.activeItems.filter((item) => item.item_type === 'savings');
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
      ${budgetPlanPageIntro(
        'overview',
        '',
        '',
        budgetPlanMonthControls(month)
      )}
      ${hasPlanData ? `${budgetPlanSummaryCards({
        plannedIncomePence: plan.plannedIncomePence,
        committedSpendingPence: spendingSummary.committedTotalPence,
        flexibleSpendingTargetPence: spendingSummary.flexibleTotalPence,
        plannedSpendingPence,
        plannedSavingsContributionsPence,
        plannedSurplusPence,
        yearlyCostsPence: yearlyMonthlyEquivalentPence(expenseItems),
        completeness
      })}
      ${budgetPlanTable([
        {
          section: 'Income',
          sectionKind: 'inflow',
          monthlyPlannedPence: plan.plannedIncomePence,
          yearlyItemsIncluded: yearlyItemsLabel(yearlyMonthlyEquivalentPence(incomeItems)),
          ownerSummary: ownerSummary(incomeItems, members),
          actionHref: '/budget-plan/income',
          actionLabel: 'Review income'
        },
        {
          section: 'Spending budgets',
          sectionKind: 'outflow',
          monthlyPlannedPence: plannedSpendingPence,
          yearlyItemsIncluded: yearlyItemsLabel(yearlyMonthlyEquivalentPence(expenseItems)),
          ownerSummary: spendingOwnerSummary(expenseItems, spendingSummary.effectiveBudgets, members),
          actionHref: `/budget-plan/spending?month=${encodeURIComponent(month)}`,
          actionLabel: 'Review spending'
        },
        {
          section: 'Planned savings',
          sectionKind: 'saving',
          monthlyPlannedPence: plannedSavingsContributionsPence,
          yearlyItemsIncluded: yearlyItemsLabel(yearlyMonthlyEquivalentPence(savingsItems)),
          ownerSummary: ownerSummary(savingsItems, members),
          actionHref: '/budget-plan/planned-savings',
          actionLabel: 'Review planned savings'
        }
      ])}` : budgetPlanEmptyState()}</div>`
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
          ${incomeItemsTable(ctx, items, members, returnTo)}
        </div>
      </section>`
    })
  );
}

function renderSpendingBudgetsPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const month = ctx.query.get('month') || currentMonth();
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const expenseItems = listBudgetItems(db, ctx.user.household_id, 'expense');
  const categories = listCategories(db, ctx.user.household_id);
  const defaultBudgets = listCategoryBudgetDefaults(db, ctx.user.household_id);
  const monthBudgets = listCategoryBudgets(db, ctx.user.household_id, { startMonth: month, endMonth: month });
  const transactions = listTransactions(db, ctx.user.household_id, { startDate: monthRange(month).start, endDate: monthRange(month).end, type: 'expense' });
  const rows = buildUnifiedSpendingBudgetRows({
    expenseItems,
    defaultBudgets,
    monthBudgets,
    transactions,
    month
  });
  const returnTo = spendingBudgetsReturnTo(month);
  const spendingSeries = plannedSpendingCategorySeries({
    expenseItems,
    defaultBudgets,
    monthBudgets,
    months: [month]
  });

  html(
    ctx.res,
    page(ctx, {
      title: 'Budget Plan · Spending budgets',
      wide: true,
      body: `${budgetPlanPageIntro('spending', '', '', budgetPlanMonthControls(month))}
      <section class="card">
        <h2>Spending budgets</h2>
        <p>Bills and committed costs are recurring payments you expect to pay. Flexible spending targets are monthly allowances for variable spending. Avoid adding the same spending twice.</p>
      </section>
      <section class="action-row">
        ${formDisclosure('expense', ctx, listCategories(db, ctx.user.household_id), members, returnTo, {
          duplicateCategoryIds: rows.effectiveBudgets.map((budget) => budget.category_id).filter(Boolean),
          duplicateMessage: 'You already have this category as a flexible spending target. Adding it here may count the same spending twice.'
        })}
        <button type="button" data-open-modal="category-budget-modal" data-reset-modal="true">Add flexible target</button>
      </section>
      <section class="grid four">
        <div class="stat">
          <span>Planned spending</span>
          <strong>${formatCurrency(rows.totalPlannedSpendingPence)}</strong>
        </div>
        <div class="stat">
          <span>Fixed / committed</span>
          <strong>${formatCurrency(rows.committedTotalPence)}</strong>
        </div>
        <div class="stat">
          <span>Variable / flexible</span>
          <strong>${formatCurrency(rows.flexibleTotalPence)}</strong>
        </div>
        <div class="stat">
          <span>Annual costs smoothed monthly</span>
          <strong>${formatCurrency(yearlyMonthlyEquivalentPence(rows.committedItems))}</strong>
        </div>
      </section>
      ${rows.overlaps.length ? `<section class="card warning-card">
        <h2>Potential double-counting to review</h2>
        <p>The categories below exist as both committed costs and flexible targets. Flexible targets in these categories are not deducted again from your plan.</p>
        <ul class="bullet-list">${rows.overlaps.map((row) => `<li>${escapeHtml(row.category_name || 'Uncategorised')}</li>`).join('')}</ul>
      </section>` : ''}
      <section class="card">
        <h2>Planned spending budgets</h2>
        ${spendingBudgetsTable(ctx, rows.rows, members, month, returnTo)}
      </section>
      <section class="card chart-card" id="planned-spending-chart">
        <div class="card-heading">
          <div>
            <h2>Planned spending by category</h2>
            <p class="hint">Includes fixed and flexible spending budgets without counting overlapping categories twice.</p>
          </div>
        </div>
        ${pieChart(spendingSeries, { title: 'Planned spending by category', emptyMessage: 'Add spending budgets to build this chart.' })}
      </section>
      <dialog id="category-budget-modal" class="modal" data-modal>
        <div class="modal-panel">
          <div class="modal-heading">
            <div>
              <h2>Add flexible target</h2>
            </div>
            <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
          </div>
          ${categoryBudgetForm(
            ctx,
            categories.filter((category) => ['expense', 'debt'].includes(category.kind)),
            month,
            returnTo,
            {
              duplicateCategoryIds: rows.committedItems.map((item) => item.category_id).filter(Boolean),
              duplicateMessage: 'You already have this category in committed costs. Adding it here may count the same spending twice.'
            }
          )}
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
      title: 'Budget Plan · Planned savings',
      wide: true,
      body: `${budgetPlanPageIntro('planned-savings')}
      <section class="action-row">
        <a class="button" href="/savings/accounts">Add planned saving</a>
        <a class="button" href="/savings/goals">View full Savings Goals</a>
      </section>
      <section class="card">
        <h2>How planned savings works</h2>
        <p>Your own monthly savings contributions are treated as money set aside from planned income, so they reduce what is left after bills and flexible spending.</p>
        <p class="hint">Employer pension contributions and Lifetime ISA bonuses do not reduce the household budget. They are shown only in savings projections.</p>
      </section>
      <section class="grid two">
        <div class="stat">
          <span>Planned savings</span>
          <strong>${formatCurrency(totalPlannedSavingsPence)}</strong>
        </div>
        <div class="stat">
          <span>Savings contributions in plan</span>
          <strong>${plannedSavingsItems.length}</strong>
          <small class="plan-stat-note">${savingsAccounts.length ? 'Monthly contributions from active accounts and pots are included in the plan.' : 'Monthly contributions from active savings goals are included in the plan until you start tracking accounts and pots.'}</small>
        </div>
      </section>
      <section class="card">
        <h2>Planned savings</h2>
        ${plannedSavingsTable(goals, plannedSavingsItems, members, savingsAccounts)}
      </section>`
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
    ${budgetPlanSectionLink('/budget-plan/spending', 'Spending Budgets', activeKey === 'spending')}
    ${budgetPlanSectionLink('/budget-plan/planned-savings', 'Planned savings', activeKey === 'planned-savings')}
  </nav>`;
}

function budgetPlanMonthControls(month) {
  const inputId = 'budget-plan-month-input';
  const formId = 'budget-plan-month-form';
  return `<form method="get" action="/budget-plan" id="${formId}" class="budget-plan-month-form" data-submit-on-change>
    <input id="${inputId}" class="budget-plan-month-input" type="month" name="month" value="${escapeHtml(month)}" aria-label="Pick month">
  </form>
  <div class="budget-plan-month-controls">
    <a class="period-pill budget-plan-month-step" href="/budget-plan?month=${encodeURIComponent(addMonths(month, -1))}" aria-label="Previous month">
      <span aria-hidden="true">&lsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-current-month-button" data-open-month-picker="${inputId}" aria-label="Pick month" title="Pick month">
      ${escapeHtml(monthLabel(month))}
    </button>
    <a class="period-pill budget-plan-month-step" href="/budget-plan?month=${encodeURIComponent(addMonths(month, 1))}" aria-label="Next month">
      <span aria-hidden="true">&rsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-month-step" data-open-month-picker="${inputId}" aria-label="Open month picker" title="Open month picker">
      ${calendarIcon()}
    </button>
  </div>`;
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
  plannedSurplusPence,
  yearlyCostsPence,
  completeness
}) {
  const balanceLabel = plannedSurplusPence >= 0 ? 'Available after plan' : 'Shortfall after plan';
  const balanceTone = plannedSurplusPence >= 0 ? 'good' : 'bad';
  return `<section class="grid four">
    ${planSummaryStat('Planned income', plannedIncomePence)}
    ${planSummaryStat('Planned spending', plannedSpendingPence, `Fixed ${formatCurrency(committedSpendingPence)} · Variable ${formatCurrency(flexibleSpendingTargetPence)}`)}
    ${planSummaryStat('Planned savings', plannedSavingsContributionsPence)}
    ${planSummaryStat('Annual costs smoothed monthly', yearlyCostsPence, yearlyCostsPence > 0 ? 'Included in planned spending.' : 'None')}
  </section>
  <section class="grid two budget-plan-status-row">
    <div class="card plan-balance-card ${balanceTone}">
      <span class="plan-balance-label">${balanceLabel}</span>
      <strong>${formatCurrency(Math.abs(plannedSurplusPence))}</strong>
      <p class="hint">Planned income minus planned spending and planned savings.</p>
    </div>
    ${planCompletenessCard(completeness)}
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
          <td class="actions-col"><a class="button" href="${row.actionHref}">${escapeHtml(row.actionLabel)}</a></td>
        </tr>`)
        .join('')}</tbody>
    </table>
  </section>`;
}

function sectionKindLabel(sectionKind) {
  if (sectionKind === 'inflow') return 'Money in';
  if (sectionKind === 'saving') return 'Set aside';
  if (sectionKind === 'outflow') return 'Money out';
  return 'Planned amount';
}

function calendarIcon() {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
    <rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 3.8v3.4M16 3.8v3.4M4 9.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8.2 13h2.6M13.2 13h2.6M8.2 16.5h2.6M13.2 16.5h2.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function budgetPlanEmptyState() {
  return `<section class="card plan-empty-state">
    <h2>Start your budget plan</h2>
    <p>Start by adding income, then add spending budgets. We&rsquo;ll calculate your planned monthly position automatically.</p>
    <div class="button-list">
      <a class="button" href="/budget-plan/income">Add income</a>
      <a class="button" href="/budget-plan/spending">Add spending budget</a>
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

function planCompleteness(expenseItems = [], month = currentMonth()) {
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
    href: `/budget-plan/spending?month=${encodeURIComponent(month)}&suggested_category=${encodeURIComponent(check.suggestedCategories.join('|'))}`
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
  const hasSharedFlexible = flexibleBudgets.some((budget) => Number(budget.amount_pence || 0) > 0);
  if (hasSharedFlexible) return 'Shared household';
  return ownerSummary(expenseItems, members);
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
    if (row.frequency === 'yearly') return `Yearly, ${formatCurrency(row.sourceAmountPence)}/year`;
    return `Monthly, ${formatCurrency(row.sourceAmountPence)}/month`;
  }
  return row.budgetScope === 'month_override' ? `Override for ${monthLabel(row.budgetMonth)}` : 'Monthly target';
}

function spendingRemainingLabel(row) {
  if (row.overlap) return 'Not counted twice';
  return overallTargetStatus(row.plannedMonthlyPence, row.actualSpentPence);
}

function spendingStatusLabel(row) {
  if (row.overlap) return 'Review overlap';
  if (row.rowType === 'flexible_target') return targetSourceLabel(row);
  return row.status;
}

function spendingBudgetActions(ctx, row, month, returnTo) {
  if (row.rowType === 'committed_cost') {
    const item = {
      id: row.id,
      category_id: row.categoryId,
      name: row.name,
      owner_type: row.ownerType,
      amount_pence: row.sourceAmountPence,
      frequency: row.frequency,
      split_type: row.splitType,
      person_a_percentage: row.personAPercentage,
      person_b_percentage: row.personBPercentage,
      notes: row.notes || '',
      start_date: row.startDate || '',
      end_date: row.endDate || '',
      is_active: row.isActive ? 1 : 0
    };
    return `<div class="table-actions">
      ${actionIconButton({
        label: 'Edit committed cost',
        icon: 'edit',
        variant: 'edit',
        attributes: `data-open-modal="expense-modal"
          data-reset-modal="true"
          ${itemEditAttributes(item)}`
      })}
      <form method="post" action="/budget-item/toggle">
        ${csrfField(ctx)}
        <input type="hidden" name="id" value="${row.id}">
        <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
        <input type="hidden" name="is_active" value="${row.isActive ? '0' : '1'}">
        ${actionIconButton({
          label: row.isActive ? 'Pause committed cost' : 'Resume committed cost',
          icon: row.isActive ? 'pause' : 'play',
          variant: row.isActive ? 'warn' : 'good',
          type: 'submit'
        })}
      </form>
      <form method="post" action="/budget-item/delete" data-confirm="Delete this planned cost?">
        ${csrfField(ctx)}
        <input type="hidden" name="id" value="${row.id}">
        <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
        ${actionIconButton({ label: 'Delete committed cost', icon: 'delete', variant: 'delete', type: 'submit' })}
      </form>
    </div>`;
  }

  if (!row.id) return '';
  return `<div class="table-actions">
    ${actionIconButton({
      label: 'Edit flexible target',
      icon: 'edit',
      variant: 'edit',
      attributes: `data-open-modal="category-budget-modal"
        data-fill-id="${escapeHtml(row.id)}"
        data-fill-scope="${escapeHtml(row.budgetScope || 'default_monthly')}"
        data-fill-month="${escapeHtml(month)}"
        data-fill-category-id="${escapeHtml(row.categoryId || '')}"
        data-fill-amount="${escapeHtml((row.plannedMonthlyPence / 100).toFixed(2))}"
        data-fill-notes="${escapeHtml(row.notes || '')}"`
    })}
    <form method="post" action="/expenses/category-budgets/delete" data-confirm="Delete this spending target?">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${escapeHtml(row.id)}">
      <input type="hidden" name="budget_scope" value="${escapeHtml(row.budgetScope || 'default_monthly')}">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      ${actionIconButton({ label: 'Delete flexible target', icon: 'delete', variant: 'delete', type: 'submit' })}
    </form>
  </div>`;
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

function spendingBudgetsTable(ctx, rows, members, month, returnTo) {
  if (!rows.length) {
    return `<div class="empty-state compact">
      <h3>No spending budgets yet</h3>
      <p>Add committed costs or flexible targets to build your planned spending budget.</p>
    </div>`;
  }

  return `<table class="data-table category-budget-table spending-budget-table">
    <thead><tr><th>Category / name</th><th>Type</th><th>Owner / split</th><th>Frequency</th><th>Planned monthly</th><th>Actual spent</th><th>Remaining</th><th>Status</th><th class="actions-col">Actions</th></tr></thead>
    <tbody>${rows
      .map((row) => `<tr>
        <td>
          <div class="cell-stack">
            <strong>${escapeHtml(row.name)}</strong>
            <small class="hint">${escapeHtml(row.rowType === 'committed_cost' ? row.categoryName : `${row.categoryName} budget`)}</small>
          </div>
        </td>
        <td>${escapeHtml(row.rowType === 'committed_cost' ? 'Fixed / committed' : 'Variable / flexible')}</td>
        <td>${escapeHtml(spendingOwnerLabel(row, members))}</td>
        <td>${escapeHtml(spendingFrequencyLabel(row))}</td>
        <td>${formatCurrency(row.plannedMonthlyPence)}</td>
        <td>${formatCurrency(row.actualSpentPence)}</td>
        <td>${escapeHtml(spendingRemainingLabel(row))}</td>
        <td>${escapeHtml(spendingStatusLabel(row))}</td>
        <td class="actions-col">${spendingBudgetActions(ctx, row, month, returnTo)}</td>
      </tr>`)
      .join('')}</tbody>
  </table>`;
}

function spendingBudgetsReturnTo(month) {
  return `/budget-plan/spending?month=${encodeURIComponent(month)}`;
}

function targetSourceLabel(row) {
  if (!row.budgetId) return 'No target';
  if (row.budgetScope === 'month_override') return `Override for ${monthLabel(row.budgetMonth)}`;
  return 'Default target';
}

function formDisclosure(itemType, ctx, categories, members, returnTo, options = {}) {
  const label = itemType === 'income' ? 'Add planned income' : 'Add committed cost';
  const modalId = `${itemType}-modal`;
  return `<button type="button" data-open-modal="${modalId}" data-reset-modal="true">${label}</button>
    <dialog id="${modalId}" class="modal" data-modal>
      <div class="modal-panel">
        <div class="modal-heading">
          <div>
            <h2>${itemType === 'income' ? 'Planned income details' : 'Committed cost details'}</h2>
          </div>
          <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
        </div>
      ${itemType === 'income' ? incomeForm(ctx, members, returnTo) : expenseForm(ctx, categories, members, returnTo, options)}
      </div>
    </dialog>`;
}

function categoryBudgetForm(ctx, categories, budgetMonth, returnTo, options = {}) {
  return `<form method="post" action="/expenses/category-budgets" class="stack budget-form modal-form">
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
      <label>Category <select name="category_id" required data-modal-field="categoryId" data-spending-warning-select data-warning-category-ids="${escapeHtml((options.duplicateCategoryIds || []).join(','))}" data-warning-message="${escapeHtml(options.duplicateMessage || '')}">${categoryOptions(categories)}</select></label>
      <p class="hint">Use this for variable monthly allowances such as groceries, fuel, eating out, clothing, entertainment, and personal spending.</p>
      <p class="inline-hint warning-text" data-spending-duplicate-warning hidden></p>
      <label>Target amount <input name="amount" ${moneyInputAttrs({ required: true, min: '0.01' })} data-modal-field="amount"></label>
      <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer">
      <button>Save spending target</button>
    </div>
  </form>`;
}

function incomeForm(ctx, members, returnTo) {
  const taxYears = listTaxYears();
  return `<form method="post" action="/income" class="stack budget-form modal-form modal-form--income" data-income-estimate-form novalidate>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <div class="modal-form-grid">
      <div class="modal-form-main">
        <section class="form-section">
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

        <section class="form-section" data-controlled-by="income_entry_mode" data-show-when="manual_net">
          <h3>Manual income</h3>
          <label>Net income <input name="manual_amount" ${moneyInputAttrs({ min: '0.01' })} data-required-when-visible="true" data-modal-field="manualAmount" data-income-summary-trigger></label>
          <label>Frequency <select name="manual_frequency" data-modal-field="manualFrequency" data-income-summary-trigger>${frequencyOptions('monthly')}</select></label>
        </section>

        <section class="form-section" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <h3>Salary details</h3>
          <label>Gross annual salary <input name="gross_annual_salary" ${moneyInputAttrs({ min: '0.01' })} data-required-when-visible="true" data-modal-field="grossAnnualSalary" data-income-summary-trigger></label>
          <div class="grid two compact">
            <label>Tax year <select name="tax_year" data-modal-field="taxYear" data-income-summary-trigger>${taxYearOptions(taxYears, latestTaxYear())}</select></label>
            <label>How often are you paid? <select name="estimated_frequency" data-modal-field="estimatedFrequency" data-income-summary-trigger>${frequencyOptions('monthly')}</select></label>
          </div>
        </section>

        <section class="form-section" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
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

        <section class="form-section" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <h3>Pension</h3>
          <div class="grid two compact">
            <label>Do you contribute to a pension?
              <select name="has_pension" data-controls data-modal-field="hasPension" data-income-summary-trigger>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            <label data-controlled-by="has_pension" data-show-when="yes" hidden>Pension contribution
              <select name="pension_contribution_type" data-controls data-modal-field="pensionContributionType" data-income-summary-trigger>
                <option value="none">Choose contribution type</option>
                <option value="fixed_amount">Fixed amount</option>
                <option value="percentage">Percentage of gross salary</option>
              </select>
            </label>
          </div>
          <div class="grid two compact" data-controlled-by="has_pension" data-show-when="yes" hidden>
            <label>Contribution amount <input name="pension_contribution_value" ${decimalInputAttrs({ min: '0', max: '100000000' })} data-modal-field="pensionContributionValue" data-income-summary-trigger></label>
            <label>How is your pension taken?
              <select name="pension_contribution_tax_treatment" data-modal-field="pensionContributionTaxTreatment" data-income-summary-trigger>
                <option value="pre_tax">Before tax</option>
                <option value="post_tax">After tax</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>
          </div>
        </section>

        <details class="form-section form-details" data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
          <summary>Other deductions</summary>
          <p class="hint">Optional. Add regular deductions that appear on your payslip.</p>
          <div class="grid two compact">
            <label>Other deductions before tax <input name="other_pre_tax_deductions" ${moneyInputAttrs()} data-modal-field="otherPreTaxDeductions" data-income-summary-trigger></label>
            <label>Other deductions after tax <input name="other_post_tax_deductions" ${moneyInputAttrs()} data-modal-field="otherPostTaxDeductions" data-income-summary-trigger></label>
          </div>
        </details>

        <section class="form-section">
          <h3>Timing and notes</h3>
          <div class="grid two compact">
            <label>Start date <input name="start_date" type="date" value="${todayIso()}" data-modal-field="startDate"></label>
            <label>End date <input name="end_date" type="date" data-modal-field="endDate"></label>
          </div>
          <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
        </section>
      </div>

      <aside class="modal-summary-panel income-summary-panel" data-income-summary>
        <div class="modal-summary-card" data-income-summary-view="manual_net">
          <h3>Planned income summary</h3>
          <p class="hint">Enter a net amount to see the monthly value used in your budget plan.</p>
          <dl class="summary-list">
            <div><dt>Entered net income</dt><dd data-summary-manual-amount>£0.00</dd></div>
            <div><dt>Frequency</dt><dd data-summary-manual-frequency>Monthly</dd></div>
            <div><dt>Monthly amount used in budget plan</dt><dd data-summary-manual-monthly>£0.00</dd></div>
          </dl>
          <p class="hint">No tax calculation applied.</p>
        </div>
        <div class="modal-summary-card" data-income-summary-view="estimated_from_gross" hidden>
          <h3>Estimated take-home pay</h3>
          <p class="hint" data-income-estimate-empty>Estimate not calculated yet. Enter salary details and calculate the estimate.</p>
          <div data-income-estimate-results hidden>
            <dl class="summary-list">
              <div><dt>Gross annual salary</dt><dd data-estimate-gross>£0.00</dd></div>
              <div><dt>Income Tax</dt><dd data-estimate-income-tax>£0.00</dd></div>
              <div><dt>National Insurance</dt><dd data-estimate-ni>£0.00</dd></div>
              <div><dt>Student loan repayment</dt><dd data-estimate-student-loan>£0.00</dd></div>
              <div data-estimate-postgraduate-row hidden><dt>Postgraduate loan repayment</dt><dd data-estimate-postgraduate>£0.00</dd></div>
              <div data-estimate-pension-row hidden><dt>Pension contribution</dt><dd data-estimate-pension>£0.00</dd></div>
              <div data-estimate-other-row hidden><dt>Other deductions</dt><dd data-estimate-other>£0.00</dd></div>
            </dl>
            <h4>Estimated take-home pay</h4>
            <dl class="summary-list">
              <div><dt>Estimated annual net income</dt><dd data-estimate-net-annual>£0.00</dd></div>
              <div><dt>Estimated monthly net income</dt><dd data-estimate-net-monthly>£0.00</dd></div>
              <div><dt>Monthly amount used in budget plan</dt><dd data-estimate-budget-monthly>£0.00</dd></div>
            </dl>
            <h4>Assumptions</h4>
            <dl class="summary-list">
              <div><dt>Tax year</dt><dd data-estimate-tax-year>—</dd></div>
              <div><dt>Student loan plan</dt><dd data-estimate-student-loan-plan>—</dd></div>
              <div><dt>Postgraduate loan</dt><dd data-estimate-postgraduate-status>—</dd></div>
              <div><dt>Pension treatment</dt><dd data-estimate-pension-treatment>—</dd></div>
              <div><dt>Calculation type</dt><dd>Budgeting estimate</dd></div>
            </dl>
          </div>
          <div class="flash error" data-income-estimate-error hidden></div>
        </div>
      </aside>
    </div>
    <div class="modal-footer">
      <button type="button" class="secondary" data-calculate-income-estimate>Calculate estimate</button>
      <button name="action" value="save">Save income</button>
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
  return `<table class="data-table income-plan-table">
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
  return {
    pre_tax: 'Pre-tax',
    post_tax: 'Post-tax'
  }[item.estimate_pension_contribution_tax_treatment] || 'Not set';
}

function formatTaxYearLabel(taxYear) {
  if (!taxYear) return 'Tax year not set';
  const [start, end] = String(taxYear).split('-');
  if (!start || !end) return taxYear;
  return `${start}/${String(end).slice(-2)}`;
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
      <p>Add rent, mortgage, council tax, utilities, subscriptions, insurance, debt repayments, or other committed costs.</p>
      <button type="button" data-open-modal="expense-modal" data-reset-modal="true">Add planned cost</button>
    </div>`;
  }

  return `<p class="empty">${escapeHtml(fallbackMessage)}</p>`;
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
    `data-fill-has-student-loan="${studentLoanPlans.length ? 'yes' : 'no'}"`,
    `data-fill-manual-amount="${item.income_entry_mode === 'manual_net' ? moneyInputValue(item.amount_pence) : ''}"`,
    `data-fill-manual-frequency="${escapeHtml(item.frequency || 'monthly')}"`,
    `data-fill-gross-annual-salary="${item.estimate_gross_annual_salary_pence ? moneyInputValue(item.estimate_gross_annual_salary_pence) : ''}"`,
    `data-fill-estimated-frequency="${escapeHtml(item.estimate_pay_frequency || item.frequency || 'monthly')}"`,
    `data-fill-tax-year="${escapeHtml(item.estimate_tax_year || latestTaxYear())}"`,
    `data-fill-student-loan-plan="${escapeHtml(studentLoanPlans[0] || 'none')}"`,
    `data-fill-has-postgraduate-loan="${item.estimate_has_postgraduate_loan ? '1' : '0'}"`,
    `data-fill-has-pension="${item.estimate_pension_contribution_type && item.estimate_pension_contribution_type !== 'none' ? 'yes' : 'no'}"`,
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
  const hasStudentLoan = String(ctx.body.has_student_loan || 'no') === 'yes';
  const pensionTreatmentRaw = ctx.body.pension_contribution_tax_treatment || 'pre_tax';
  const hasPension = String(ctx.body.has_pension || 'no') === 'yes';
  const pensionTypeRaw = hasPension ? (ctx.body.pension_contribution_type || 'none') : 'none';
  if (hasStudentLoan && !ctx.body.student_loan_plan) {
    throw new Error('Student loan repayment plan is required.');
  }
  if (hasPension && pensionTypeRaw === 'none') {
    throw new Error('Choose a pension contribution type.');
  }
  const pensionType = requireChoice(pensionTypeRaw, ['none', 'fixed_amount', 'percentage'], 'Pension contribution');
  const rawPensionValue = pensionType === 'none' ? '0' : ctx.body.pension_contribution_value || '0';
  const pensionContributionValue =
    pensionType === 'fixed_amount'
      ? requireMoney(rawPensionValue, 'Contribution amount')
      : pensionType === 'percentage'
        ? requireDecimal(rawPensionValue, 'Contribution amount', { min: 0.01, max: 100 })
        : 0;
  const grossAnnualSalaryPence = requireMoney(ctx.body.gross_annual_salary, 'Gross annual salary');

  return estimateTakeHomePay({
    grossAnnualSalaryPence,
    taxYear: requireString(ctx.body.tax_year, 'Tax year', 20),
    pensionContributionType: pensionType,
    pensionContributionValue,
    pensionContributionTaxTreatment: requireChoice(pensionTreatmentRaw === 'unknown' ? 'pre_tax' : pensionTreatmentRaw, ['pre_tax', 'post_tax'], 'How your pension is taken'),
    otherPreTaxDeductionsPence: optionalMoney(ctx.body.other_pre_tax_deductions, 'Other deductions before tax'),
    otherPostTaxDeductionsPence: optionalMoney(ctx.body.other_post_tax_deductions, 'Other deductions after tax'),
    studentLoanPlans: hasStudentLoan ? parseStudentLoanPlans(ctx.body) : [],
    hasPostgraduateLoan: checkboxValue(ctx.body.has_postgraduate_loan)
  });
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

function assertDateOrder(startDate, endDate) {
  if (startDate && endDate && endDate < startDate) {
    throw new Error('End date must be after the start date.');
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
