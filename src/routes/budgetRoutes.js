import { createBudgetItem, listBudgetItems, setBudgetItemActive, updateBudgetItemIncomeEstimate } from '../repositories/budgetItemRepository.js';
import { createIncomeEstimate, attachEstimateToBudgetItem } from '../repositories/incomeEstimateRepository.js';
import { listCategories } from '../repositories/categoryRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { calculateMonthlyEquivalent } from '../services/budgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { estimateTakeHomePay } from '../services/takeHomePayService.js';
import { listTaxYears, latestTaxYear } from '../services/taxRulesService.js';
import { parsePoundsToPence } from '../utils/money.js';
import { todayIso } from '../utils/dates.js';
import { optionalString, parsePercentage, requireChoice, requireString } from '../utils/validation.js';
import { csrfField, escapeHtml, formatCurrency, ownerLabel, page, selected } from '../views/html.js';
import { categoryOptions, frequencyOptions, ownerOptions, taxYearOptions } from '../views/forms.js';
import { pieChart } from '../views/charts.js';
import { html, redirect } from '../http/response.js';
import { checkboxValue, ensureAuthenticated, formDate, parseStudentLoanPlans, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerBudgetRoutes(router, db) {
  router.get('/income', (ctx) => renderBudgetPage(ctx, db, 'income'));
  router.get('/expenses', (ctx) => renderBudgetPage(ctx, db, 'expense'));
  router.post('/income', (ctx) => createIncome(ctx, db));
  router.post('/expenses', (ctx) => createExpense(ctx, db));
  router.post('/budget-item/toggle', (ctx) => toggleBudgetItem(ctx, db));
}

function renderBudgetPage(ctx, db, itemType) {
  if (!ensureAuthenticated(ctx)) return;
  const categories = listCategories(db, ctx.user.household_id);
  const items = listBudgetItems(db, ctx.user.household_id, itemType);
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const title = itemType === 'income' ? 'Income' : 'Expenses';
  const expenseChartOwner = ctx.query.get('chart_owner') || 'household';
  const expenseSeries = itemType === 'expense' ? plannedExpenseCategorySeries(items, { owner: expenseChartOwner }) : [];

  html(
    ctx.res,
    page(ctx, {
      title,
      wide: true,
      body: `<section class="page-title">
        <div>
          <p class="eyebrow">Planned budget</p>
          <h1>${title}</h1>
          <p>${itemType === 'income' ? 'Add manual net income or estimate UK take-home pay from gross salary.' : 'Track fixed, variable, discretionary, subscription, debt, and household costs.'}</p>
        </div>
      </section>
      ${itemType === 'expense' ? expenseChartSection(expenseSeries, expenseChartOwner, members) : ''}
      <section class="action-row">
        ${formDisclosure(itemType, ctx, categories, members)}
      </section>
      <section class="grid one">
        <div class="card">
          <h2>Current ${title.toLowerCase()}</h2>
          ${itemsTable(ctx, items, members)}
        </div>
      </section>`
    })
  );
}

function formDisclosure(itemType, ctx, categories, members) {
  const label = itemType === 'income' ? 'Add income' : 'Add expense';
  const modalId = `${itemType}-modal`;
  return `<button type="button" data-open-modal="${modalId}">${label}</button>
    <dialog id="${modalId}" class="modal" data-modal>
      <div class="modal-panel">
        <div class="modal-heading">
          <div>
            <p class="eyebrow">New planned ${itemType}</p>
            <h2>${label}</h2>
            <p class="hint">${itemType === 'income' ? 'Choose manual net income or estimate take-home pay. Only the relevant fields are shown.' : 'Add one planned recurring cost. Shared split fields only appear for shared manual splits.'}</p>
          </div>
          <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
        </div>
      ${itemType === 'income' ? incomeForm(ctx, members) : expenseForm(ctx, categories, members)}
      </div>
    </dialog>`;
}

function expenseChartSection(series, owner, members) {
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Planned monthly expenses by category</h2>
        <p class="hint">Yearly costs are shown as monthly equivalents. Person views use the configured shared split.</p>
      </div>
      <form method="get" action="/expenses" class="inline-form">
        <label>View
          <select name="chart_owner">
            <option value="household" ${selected(owner, 'household')}>Household</option>
            <option value="person_a" ${selected(owner, 'person_a')}>${escapeHtml(members.find((member) => member.person_key === 'person_a')?.display_name || 'Person A')}</option>
            <option value="person_b" ${selected(owner, 'person_b')}>${escapeHtml(members.find((member) => member.person_key === 'person_b')?.display_name || 'Person B')}</option>
          </select>
        </label>
        <button>Update chart</button>
      </form>
    </div>
    ${pieChart(series, { title: 'Planned monthly expenses by category', emptyMessage: 'Add expenses to build this chart.' })}
  </section>`;
}

function incomeForm(ctx, members) {
  const taxYears = listTaxYears();
  return `<form method="post" action="/income" class="stack budget-form">
    ${csrfField(ctx)}
    <section class="form-section">
      <h3>1. Basic details</h3>
      <div class="grid two compact">
        <label>Name <input name="name" required maxlength="120"></label>
        <label>Owner <select name="owner_type">${ownerOptions('person_a', members)}</select></label>
      </div>
    <label>Income entry mode
      <select name="income_entry_mode" data-controls>
        <option value="manual_net">Manual net income</option>
        <option value="estimated_from_gross">Estimated take-home pay from gross salary</option>
      </select>
    </label>
    </section>
    <fieldset data-controlled-by="income_entry_mode" data-show-when="manual_net">
      <legend>Manual net income</legend>
      <label>Net amount <input name="manual_amount" inputmode="decimal" pattern="^-?\\d+(\\.\\d{1,2})?$" data-required-when-visible="true"></label>
      <label>Frequency <select name="manual_frequency">${frequencyOptions('monthly')}</select></label>
    </fieldset>
      <fieldset data-controlled-by="income_entry_mode" data-show-when="estimated_from_gross" hidden>
      <legend>Estimated take-home pay</legend>
      <label>Gross annual salary <input name="gross_annual_salary" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$" data-required-when-visible="true"></label>
      <label>Pay frequency <select name="estimated_frequency">${frequencyOptions('monthly')}</select></label>
      <label>Tax year <select name="tax_year">${taxYearOptions(taxYears, latestTaxYear())}</select></label>
      <label>Student loan plan
        <select name="student_loan_plan">
          <option value="none">No undergraduate student loan</option>
          <option value="plan_1">Plan 1</option>
          <option value="plan_2">Plan 2</option>
          <option value="plan_4">Plan 4</option>
          <option value="plan_5">Plan 5</option>
        </select>
      </label>
      <label class="checkbox-line"><input type="checkbox" name="has_postgraduate_loan"> Include Postgraduate Loan repayment</label>
      <label>Pension contribution type
        <select name="pension_contribution_type" data-controls>
          <option value="none">None</option>
          <option value="fixed_amount">Fixed annual amount</option>
          <option value="percentage">Percentage of gross salary</option>
        </select>
      </label>
      <div class="grid two compact" data-controlled-by="pension_contribution_type" data-show-when="fixed_amount|percentage" hidden>
        <label>Pension contribution value <input name="pension_contribution_value" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$" data-required-when-visible="true"></label>
        <label>Pension tax treatment
          <select name="pension_contribution_tax_treatment">
            <option value="pre_tax">Before tax</option>
            <option value="post_tax">After tax</option>
          </select>
        </label>
      </div>
      <label>Other regular pre-tax deductions <input name="other_pre_tax_deductions" inputmode="decimal"></label>
      <label>Other regular post-tax deductions <input name="other_post_tax_deductions" inputmode="decimal"></label>
      <p class="hint">The saved item uses the estimated net income. The original gross salary and assumptions are stored for review.</p>
    </fieldset>
    <section class="form-section">
      <h3>3. Timing and notes</h3>
    <label>Start date <input name="start_date" type="date" value="${todayIso()}"></label>
    <label>End date <input name="end_date" type="date"></label>
    <label>Notes <textarea name="notes" rows="3"></textarea></label>
    </section>
    <div class="button-list">
      <button name="action" value="save">Save income</button>
      <button name="action" value="preview">Preview estimate</button>
    </div>
  </form>`;
}

function expenseForm(ctx, categories, members) {
  const expenseCategories = categories.filter((category) => ['expense', 'debt'].includes(category.kind));
  return `<form method="post" action="/expenses" class="stack budget-form">
    ${csrfField(ctx)}
    <section class="form-section">
      <h3>1. Cost details</h3>
    <label>Name <input name="name" required maxlength="120"></label>
    <label>Category <select name="category_id">${categoryOptions(expenseCategories)}</select></label>
    <label>Owner <select name="owner_type" data-controls>${ownerOptions('shared', members)}</select></label>
    <label>Amount <input name="amount" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$" required></label>
    <label>Frequency <select name="frequency">${frequencyOptions('monthly')}</select></label>
    </section>
    <fieldset data-controlled-by="owner_type" data-show-when="shared">
      <legend>Shared split</legend>
      <label>Split type
        <select name="split_type" data-controls>
          <option value="equal">Equal split</option>
          <option value="manual_percentage">Manual percentage split</option>
        </select>
      </label>
      <div class="grid two compact" data-controlled-by="split_type" data-show-when="manual_percentage" hidden>
        <label>Person A percentage <input name="person_a_percentage" type="number" min="0" max="100" step="0.01" value="50"></label>
        <label>Person B percentage <input name="person_b_percentage" type="number" min="0" max="100" step="0.01" value="50"></label>
      </div>
    </fieldset>
    <section class="form-section">
      <h3>3. Timing and notes</h3>
    <label>Start date <input name="start_date" type="date" value="${todayIso()}"></label>
    <label>End date <input name="end_date" type="date"></label>
    <label>Notes <textarea name="notes" rows="3"></textarea></label>
    </section>
    <button>Save expense</button>
  </form>`;
}

function itemsTable(ctx, items, members) {
  if (!items.length) return '<p class="empty">No items yet.</p>';
  return `<table>
    <thead><tr><th>Name</th><th>Category</th><th>Owner</th><th>Amount</th><th>Monthly equivalent</th><th>Status</th><th></th></tr></thead>
    <tbody>${items
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.category_name || '')}</td>
          <td>${escapeHtml(ownerLabel(item.owner_type, members))}</td>
          <td>${formatCurrency(item.amount_pence)} ${item.frequency}</td>
          <td>${formatCurrency(item.monthly_equivalent_pence)}</td>
          <td>${item.is_active ? 'Active' : 'Inactive'}</td>
          <td>
            <form method="post" action="/budget-item/toggle">
              ${csrfField(ctx)}
              <input type="hidden" name="id" value="${item.id}">
              <input type="hidden" name="return_to" value="${item.item_type === 'income' ? '/income' : '/expenses'}">
              <input type="hidden" name="is_active" value="${item.is_active ? '0' : '1'}">
              <button class="link-button">${item.is_active ? 'Deactivate' : 'Activate'}</button>
            </form>
          </td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}

function createIncome(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const name = requireString(ctx.body.name, 'Name', 120);
    const ownerType = requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner');
    const incomeEntryMode = requireChoice(ctx.body.income_entry_mode, ['manual_net', 'estimated_from_gross'], 'Income entry mode');

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
      isActive: true,
      splitType: 'equal',
      personAPercentage: 50,
      personBPercentage: 50,
      incomeEntryMode,
      createdBy: ctx.user.id
    };

    if (incomeEntryMode === 'manual_net') {
      const amountPence = parsePoundsToPence(ctx.body.manual_amount);
      if (amountPence <= 0) throw new Error('Net income amount must be greater than zero.');
      const frequency = requireChoice(ctx.body.manual_frequency, ['monthly', 'yearly'], 'Frequency');
      createBudgetItem(db, {
        ...common,
        amountPence,
        frequency,
        monthlyEquivalentPence: calculateMonthlyEquivalent(amountPence, frequency)
      });
    } else {
      const estimate = buildEstimate(ctx);
      const frequency = requireChoice(ctx.body.estimated_frequency, ['monthly', 'yearly'], 'Estimated frequency');
      const amountPence = frequency === 'monthly' ? estimate.estimatedNetMonthlyIncomePence : estimate.estimatedNetAnnualIncomePence;
      const savedEstimate = createIncomeEstimate(db, {
        householdId: ctx.user.household_id,
        budgetItemId: null,
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
      });
      const item = createBudgetItem(db, {
        ...common,
        amountPence,
        frequency,
        monthlyEquivalentPence: estimate.estimatedNetMonthlyIncomePence,
        incomeEstimateId: savedEstimate.id
      });
      attachEstimateToBudgetItem(db, ctx.user.household_id, savedEstimate.id, item.id);
      updateBudgetItemIncomeEstimate(db, ctx.user.household_id, item.id, savedEstimate.id);
    }
    redirectWithSuccess(ctx.res, '/income', 'Income saved.');
  } catch (error) {
    redirectWithError(ctx.res, '/income', error);
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
          <a href="/income">Back to income</a>
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
  const pensionContributionValue = pensionType === 'fixed_amount' ? parsePoundsToPence(rawPensionValue) : Number(rawPensionValue || 0);
  const grossAnnualSalaryPence = parsePoundsToPence(ctx.body.gross_annual_salary);
  if (grossAnnualSalaryPence <= 0) throw new Error('Gross annual salary must be greater than zero.');

  return estimateTakeHomePay({
    grossAnnualSalaryPence,
    taxYear: requireString(ctx.body.tax_year, 'Tax year', 20),
    pensionContributionType: pensionType,
    pensionContributionValue,
    pensionContributionTaxTreatment: requireChoice(ctx.body.pension_contribution_tax_treatment || 'pre_tax', ['pre_tax', 'post_tax'], 'Pension tax treatment'),
    otherPreTaxDeductionsPence: parsePoundsToPence(ctx.body.other_pre_tax_deductions || '0'),
    otherPostTaxDeductionsPence: parsePoundsToPence(ctx.body.other_post_tax_deductions || '0'),
    studentLoanPlans: parseStudentLoanPlans(ctx.body),
    hasPostgraduateLoan: checkboxValue(ctx.body.has_postgraduate_loan)
  });
}

function createExpense(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const amountPence = parsePoundsToPence(ctx.body.amount);
    if (amountPence <= 0) throw new Error('Expense amount must be greater than zero.');
    const frequency = requireChoice(ctx.body.frequency, ['monthly', 'yearly'], 'Frequency');
    const ownerType = requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner');
    const splitType = ownerType === 'shared' ? requireChoice(ctx.body.split_type || 'equal', ['equal', 'manual_percentage'], 'Split type') : 'equal';
    const personAPercentage = splitType === 'manual_percentage' ? parsePercentage(ctx.body.person_a_percentage) : 50;
    const personBPercentage = splitType === 'manual_percentage' ? parsePercentage(ctx.body.person_b_percentage) : 50;
    if (ownerType === 'shared' && splitType === 'manual_percentage' && Math.round((personAPercentage + personBPercentage) * 100) !== 10000) {
      throw new Error('Manual split percentages must add up to 100%.');
    }

    createBudgetItem(db, {
      householdId: ctx.user.household_id,
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
      isActive: true,
      splitType,
      personAPercentage,
      personBPercentage,
      incomeEntryMode: null,
      createdBy: ctx.user.id
    });
    redirectWithSuccess(ctx.res, '/expenses', 'Expense saved.');
  } catch (error) {
    redirectWithError(ctx.res, '/expenses', error);
  }
}

function toggleBudgetItem(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  setBudgetItemActive(db, ctx.user.household_id, Number(ctx.body.id), ctx.body.is_active === '1');
  redirect(ctx.res, ctx.body.return_to || '/dashboard');
}
