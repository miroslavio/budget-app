import { createSavingsGoal, deleteSavingsGoal, findSavingsGoalById, listSavingsGoals, updateSavingsGoal } from '../repositories/savingsGoalRepository.js';
import { createSavingsAccount, deleteSavingsAccount, findSavingsAccountById, listSavingsAccounts, updateSavingsAccount } from '../repositories/savingsAccountRepository.js';
import { listSavingsGoalAccountLinks, replaceSavingsGoalAccountLinks } from '../repositories/savingsGoalAccountRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { checkboxValue, ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';
import { optionalMoney, optionalString, requireChoice, requireDecimal, requireMoney, requireString } from '../utils/validation.js';
import { currentMonth } from '../utils/dates.js';
import { savingsGoalMetrics } from '../services/savingsService.js';
import {
  buildSavingsProjection,
  defaultAccessSettingsForAccount,
  defaultProjectedRateTypeForAccount,
  isPensionAccountType,
  projectedRateLabelForAccount,
  savingsAccountSummary,
  savingsAccountTypeLabel,
  savingsAccountTypeOptions
} from '../services/savingsAccountService.js';
import { savingsProjectionChart } from '../views/charts.js';
import { actionIconButton, csrfField, escapeHtml, formatCurrency, formatSignedCurrency, ownerLabel, page } from '../views/html.js';
import { decimalInputAttrs, moneyInputAttrs, ownerOptions } from '../views/forms.js';
import { html } from '../http/response.js';

export function registerSavingsRoutes(router, db) {
  router.get('/savings', (ctx) => renderSavingsOverview(ctx, db));
  router.get('/savings/accounts', (ctx) => renderSavingsAccountsPage(ctx, db));
  router.get('/savings/goals', (ctx) => renderSavingsGoalsPage(ctx, db));

  router.post('/savings', (ctx) => saveSavingsGoal(ctx, db));
  router.post('/savings/goals', (ctx) => saveSavingsGoal(ctx, db));
  router.post('/savings/delete', (ctx) => removeSavingsGoal(ctx, db));

  router.post('/savings/accounts', (ctx) => saveSavingsAccountAction(ctx, db));
  router.post('/savings/accounts/delete', (ctx) => removeSavingsAccountAction(ctx, db));
}

function renderSavingsOverview(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const accounts = listSavingsAccounts(db, ctx.user.household_id);
  const goalLinks = listSavingsGoalAccountLinks(db, ctx.user.household_id);
  const goals = decorateGoalsWithLinkedAccounts(listSavingsGoals(db, ctx.user.household_id), goalLinks, accounts);
  const summary = savingsAccountSummary(accounts);
  const projection = buildSavingsProjection(accounts, { startMonth: currentMonth(), months: 12 });
  const projectedYearEndPence = projection.months.at(-1)?.closingBalancePence ?? summary.totalBalancePence;
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const totalGoalTargetPence = activeGoals.reduce((sum, goal) => sum + Number(goal.target_amount_pence || 0), 0);
  const currentGoalSavedPence = activeGoals.reduce((sum, goal) => sum + Number(goal.metrics?.currentSavedPence || 0), 0);
  const hasSavingsData = accounts.length > 0 || goals.length > 0;

  html(
    ctx.res,
    page(ctx, {
      title: 'Savings',
      wide: true,
      body: `<div class="savings-layout">
      ${savingsPageIntro('overview')}
      ${savingsAccountDialog(ctx, members, '/savings')}
      ${savingsGoalDialog(ctx, members, accounts, '/savings')}
      ${hasSavingsData ? `<section class="action-row">
        <div class="button-list">
          <button type="button" data-open-modal="savings-account-modal" data-reset-modal="true">Add account or pot</button>
          <button type="button" data-open-modal="savings-goal-modal" data-reset-modal="true">Add savings goal</button>
        </div>
      </section>
      ${overviewCards(summary, projectedYearEndPence, totalGoalTargetPence, currentGoalSavedPence)}
      <section class="grid two">
        <div class="card">
          <h2>Accounts & pots</h2>
          ${accountsSnapshotTable(accounts, members)}
        </div>
        <div class="card">
          <h2>Savings goal progress</h2>
          ${goalsOverview(goals)}
        </div>
      </section>` : savingsEmptyState()}
      ${savingsOverviewProjectionCard(summary, projection, 12)}
      </div>`
    })
  );
}

function renderSavingsAccountsPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const accounts = listSavingsAccounts(db, ctx.user.household_id);
  const summary = savingsAccountSummary(accounts);

  html(
    ctx.res,
    page(ctx, {
      title: 'Savings · Accounts & Pots',
      wide: true,
      body: `<div class="savings-layout">
      ${savingsPageIntro('accounts')}
      <section class="action-row">
        <div class="button-list">
          <button type="button" data-open-modal="savings-account-modal" data-reset-modal="true">Add account or pot</button>
        </div>
        ${savingsAccountDialog(ctx, members, '/savings/accounts')}
      </section>
      <section class="grid four">
        <div class="stat">
          <span>Active pots</span>
          <strong>${summary.activeCount}</strong>
        </div>
        <div class="stat">
          <span>Total saved now</span>
          <strong>${formatCurrency(summary.totalBalancePence)}</strong>
        </div>
        <div class="stat">
          <span>Monthly additions</span>
          <strong>${formatCurrency(summary.monthlyContributionPence + summary.employerContributionPence)}</strong>
        </div>
        <div class="stat">
          <span>Excluded from projections</span>
          <strong>${Math.max(0, accounts.length - summary.activeCount)}</strong>
        </div>
      </section>
      <section class="card">
        <h2>Accounts and pots</h2>
        ${savingsAccountsTable(ctx, accounts, members)}
      </section>
      </div>`
    })
  );
}

function renderSavingsGoalsPage(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  const members = listHouseholdMembers(db, ctx.user.household_id);
  const accounts = listSavingsAccounts(db, ctx.user.household_id);
  const goalLinks = listSavingsGoalAccountLinks(db, ctx.user.household_id);
  const goals = decorateGoalsWithLinkedAccounts(listSavingsGoals(db, ctx.user.household_id), goalLinks, accounts);
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const targetPence = activeGoals.reduce((sum, goal) => sum + Number(goal.target_amount_pence || 0), 0);
  const savedPence = activeGoals.reduce((sum, goal) => sum + Number(goal.metrics?.currentSavedPence || 0), 0);
  const monthlyContributionPence = activeGoals.reduce((sum, goal) => sum + Number(goal.metrics?.monthlyAdditionsPence || 0), 0);

  html(
    ctx.res,
    page(ctx, {
      title: 'Savings · Goals',
      wide: true,
      body: `<div class="savings-layout">
      ${savingsPageIntro('goals')}
      <section class="action-row">
        <div class="button-list">
          <button type="button" data-open-modal="savings-goal-modal" data-reset-modal="true">Add savings goal</button>
        </div>
        ${savingsGoalDialog(ctx, members, accounts, '/savings/goals')}
      </section>
      <section class="grid four">
        <div class="stat">
          <span>Active goals</span>
          <strong>${activeGoals.length}</strong>
        </div>
        <div class="stat">
          <span>Total goal target</span>
          <strong>${formatCurrency(targetPence)}</strong>
        </div>
        <div class="stat">
          <span>Currently saved</span>
          <strong>${formatCurrency(savedPence)}</strong>
        </div>
        <div class="stat">
          <span>Linked monthly additions</span>
          <strong>${formatCurrency(monthlyContributionPence)}</strong>
        </div>
      </section>
      <section class="grid one">
        <div class="card">
          <h2>Goals</h2>
          ${goalsTable(ctx, goals, members, '/savings/goals')}
        </div>
      </section>
      </div>`
    })
  );
}

function saveSavingsGoal(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const goalId = Number(ctx.body.id || 0) || null;
    if (goalId && !findSavingsGoalById(db, ctx.user.household_id, goalId)) {
      throw new Error('Savings goal was not found.');
    }
    const linkedAccountIds = parseIdList(ctx.body.linked_account_ids);
    const targetAmountPence = requireMoney(ctx.body.target_amount, 'Target amount');
    const trackingMode = requireChoice(ctx.body.tracking_mode || 'manual', ['manual', 'linked_pots'], 'Tracking mode');
    const payload = {
      householdId: ctx.user.household_id,
      id: goalId,
      name: requireString(ctx.body.name, 'Goal name', 120),
      targetAmountPence,
      currentSavedAmountPence: trackingMode === 'manual' ? optionalMoney(ctx.body.current_saved_amount, 'Current saved amount') : 0,
      monthlyContributionPence: trackingMode === 'manual' ? optionalMoney(ctx.body.monthly_contribution, 'Monthly contribution') : 0,
      targetDate: ctx.body.target_date || null,
      trackingMode,
      goalType: requireChoice(ctx.body.goal_type || 'general', ['general', 'retirement'], 'Goal type'),
      ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
      status: requireChoice(ctx.body.status || 'active', ['active', 'completed', 'paused'], 'Status'),
      notes: optionalString(ctx.body.notes)
    };
    db.exec('BEGIN');
    try {
      const goal = goalId ? updateSavingsGoal(db, payload) : createSavingsGoal(db, payload);
      replaceSavingsGoalAccountLinks(db, ctx.user.household_id, goal.id, linkedAccountIds);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/savings/goals', goalId ? 'Savings goal updated.' : 'Savings goal saved.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/savings/goals', error);
  }
}

function removeSavingsGoal(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    deleteSavingsGoal(db, ctx.user.household_id, Number(ctx.body.id));
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/savings/goals', 'Savings goal deleted.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/savings/goals', error);
  }
}

function saveSavingsAccountAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    const accountId = Number(ctx.body.id || 0) || null;
    if (accountId && !findSavingsAccountById(db, ctx.user.household_id, accountId)) {
      throw new Error('Savings account or pot was not found.');
    }

    const projectedAnnualRate = resolveProjectedAnnualRate(ctx.body);
    const accountType = requireChoice(
      ctx.body.account_type,
      ['current_account', 'easy_access_savings', 'fixed_savings', 'cash_isa', 'stocks_and_shares_isa', 'lifetime_isa', 'pension', 'defined_contribution_pension', 'sipp_pension', 'defined_benefit_pension', 'other'],
      'Account type'
    );
    const isDefinedBenefit = accountType === 'defined_benefit_pension';
    const accessDefaults = defaultAccessSettingsForAccount(accountType);

    const payload = {
      householdId: ctx.user.household_id,
      id: accountId,
      name: requireString(ctx.body.name, 'Name', 120),
      providerName: optionalString(ctx.body.provider_name, 120),
      accountType,
      ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
      currentBalancePence: isDefinedBenefit ? optionalMoney(ctx.body.estimated_transfer_value, 'Estimated transfer value') : optionalMoney(ctx.body.current_balance, 'Current balance'),
      monthlyContributionPence: isDefinedBenefit ? 0 : optionalMoney(ctx.body.monthly_contribution, 'Monthly contribution'),
      employerMonthlyContributionPence: 0,
      availableForHouseholdCashflow: ctx.body.available_for_household_cashflow !== undefined
        ? checkboxValue(ctx.body.available_for_household_cashflow)
        : accessDefaults.availableForHouseholdCashflow,
      accessType: requireChoice(
        ctx.body.access_type || accessDefaults.accessType,
        ['instant_access', 'notice', 'penalty_withdrawal', 'locked_until_date', 'locked_until_age'],
        'Access type'
      ),
      accessDate: optionalString(ctx.body.access_date, 10),
      accessAge: optionalInteger(ctx.body.access_age, 'Access age', { min: 0, max: 120 }),
      accessNotes: optionalString(ctx.body.access_notes),
      projectedAnnualRate,
      projectedRateType: resolveProjectedRateType(ctx.body.account_type, ctx.body.projected_rate_type_override || ctx.body.projected_rate_type),
      includeLisaBonus: false,
      annualChargePercentage: optionalPercentage(ctx.body.annual_charge_percentage, 'Annual charge'),
      annualPensionEntitlementPence: isDefinedBenefit ? optionalMoney(ctx.body.annual_pension_entitlement, 'Annual pension entitlement') : 0,
      lumpSumEntitlementPence: isDefinedBenefit ? optionalMoney(ctx.body.lump_sum_entitlement, 'Lump sum entitlement') : 0,
      isActive: checkboxValue(ctx.body.is_active),
      notes: optionalString(ctx.body.notes)
    };

    if (isPensionAccountType(payload.accountType) && !isDefinedBenefit) {
      payload.employerMonthlyContributionPence = optionalMoney(ctx.body.employer_monthly_contribution, 'Employer monthly contribution');
    }

    if (payload.accountType === 'lifetime_isa') {
      payload.includeLisaBonus = checkboxValue(ctx.body.include_lisa_bonus);
    }

    if (accountId) {
      updateSavingsAccount(db, payload);
    } else {
      createSavingsAccount(db, payload);
    }

    redirectWithSuccess(
      ctx.res,
      ctx.body.return_to || '/savings/accounts',
      accountId ? 'Savings account or pot updated.' : 'Savings account or pot saved.'
    );
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/savings/accounts', error);
  }
}

function removeSavingsAccountAction(ctx, db) {
  if (!ensureAuthenticated(ctx)) return;
  try {
    deleteSavingsAccount(db, ctx.user.household_id, Number(ctx.body.id));
    redirectWithSuccess(ctx.res, ctx.body.return_to || '/savings/accounts', 'Savings account or pot deleted.');
  } catch (error) {
    redirectWithError(ctx.res, ctx.body.return_to || '/savings/accounts', error);
  }
}

function savingsPageIntro(activeKey) {
  return `<section class="page-title">
    <div>
      <h1>Savings</h1>
    </div>
  </section>
  <nav class="period-pills section-nav" aria-label="Savings sections">
    ${savingsSectionLink('/savings', 'Overview', activeKey === 'overview')}
    ${savingsSectionLink('/savings/accounts', 'Accounts & Pots', activeKey === 'accounts')}
    ${savingsSectionLink('/savings/goals', 'Goals', activeKey === 'goals')}
  </nav>`;
}

function savingsSectionLink(href, label, active = false) {
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${href}">${escapeHtml(label)}</a>`;
}

function overviewCards(summary, projectedYearEndPence, totalGoalTargetPence, currentGoalSavedPence) {
  const monthlyAdditionsPence = Number(summary.monthlyContributionPence || 0) + Number(summary.employerContributionPence || 0);
  return `<section class="grid four">
    <div class="stat">
      <span>Total saved now</span>
      <strong>${formatCurrency(summary.totalBalancePence)}</strong>
    </div>
    <div class="stat">
      <span>Monthly additions</span>
      <strong>${formatCurrency(monthlyAdditionsPence)}</strong>
    </div>
    <div class="stat">
      <span>Projected in 12 months</span>
      <strong>${formatCurrency(projectedYearEndPence)}</strong>
    </div>
    <div class="stat">
      <span>Goals progress</span>
      <strong>${totalGoalTargetPence > 0 ? `${Math.round((currentGoalSavedPence / totalGoalTargetPence) * 100)}%` : 'No goals yet'}</strong>
  </section>`;
}

function projectionBreakdownCard(summary, projection, months) {
  if (!projection.accounts.length) return '';
  const totals = projection.accounts.reduce(
    (aggregate, account) => {
      aggregate.personalContributionPence += Number(account.totalPersonalContributionPence || 0);
      aggregate.topUpsPence += Number(account.totalEmployerContributionPence || 0) + Number(account.totalBonusPence || 0);
      aggregate.growthPence += Number(account.totalGrowthPence || 0);
      return aggregate;
    },
    { personalContributionPence: 0, topUpsPence: 0, growthPence: 0 }
  );
  const projectedTotalPence = projection.months.at(-1)?.closingBalancePence ?? summary.totalBalancePence;
  return `<section class="card">
    <div class="card-heading">
      <div>
        <h2>Projection summary</h2>
      </div>
    </div>
    <section class="grid projection-summary-grid">
      <div class="stat">
        <span>Starting balance</span>
        <strong>${formatCurrency(summary.totalBalancePence)}</strong>
      </div>
      <div class="stat">
        <span>Personal contributions</span>
        <strong>${formatCurrency(totals.personalContributionPence)}</strong>
      </div>
      <div class="stat">
        <span>Employer and LISA top-ups</span>
        <strong>${formatCurrency(totals.topUpsPence)}</strong>
      </div>
      <div class="stat">
        <span>Projected growth / interest</span>
        <strong>${formatCurrency(totals.growthPence)}</strong>
      </div>
      <div class="stat">
        <span>Projected total</span>
        <strong>${formatCurrency(projectedTotalPence)}</strong>
      </div>
    </section>
  </section>`;
}

function savingsOverviewProjectionCard(summary, projection, months) {
  if (!projection.accounts.length) return '';
  const totals = projection.accounts.reduce(
    (aggregate, account) => {
      aggregate.personalContributionPence += Number(account.totalPersonalContributionPence || 0);
      aggregate.topUpsPence += Number(account.totalEmployerContributionPence || 0) + Number(account.totalBonusPence || 0);
      aggregate.growthPence += Number(account.totalGrowthPence || 0);
      return aggregate;
    },
    { personalContributionPence: 0, topUpsPence: 0, growthPence: 0 }
  );
  const projectedTotalPence = projection.months.at(-1)?.closingBalancePence ?? summary.totalBalancePence;
  return `<section class="card chart-card">
    <div class="card-heading">
      <div>
        <h2>Savings projection</h2>
      </div>
    </div>
    <div data-view-panel="savings-overview" data-view-value="balances" class="view-panel">
      ${savingsProjectionChart(projection, {
        emptyMessage: 'Add an account or pot to start projecting balances.'
      })}
    </div>
  </section>`;
}

function savingsEmptyState() {
  return `<section class="card plan-empty-state">
    <h2>Start tracking your savings properly</h2>
    <p>Add the real accounts and pots that hold your money, then add long-term goals separately. We&rsquo;ll use balances, monthly contributions, and projected rates to show where each pot could be heading.</p>
    <div class="button-list">
      <button type="button" data-open-modal="savings-account-modal" data-reset-modal="true">Add account or pot</button>
      <button type="button" data-open-modal="savings-goal-modal" data-reset-modal="true">Add savings goal</button>
    </div>
  </section>`;
}

function savingsGoalDialog(ctx, members, accounts, returnTo) {
  return `<dialog id="savings-goal-modal" class="modal" data-modal>
    <div class="modal-panel">
      <div class="modal-heading">
        <div>
          <h2>Savings goal details</h2>
        </div>
        <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
      </div>
      ${goalForm(ctx, members, accounts, returnTo)}
    </div>
  </dialog>`;
}

function savingsAccountDialog(ctx, members, returnTo) {
  return `<dialog id="savings-account-modal" class="modal" data-modal>
    <div class="modal-panel">
      <div class="modal-heading">
        <div>
          <h2>Account or pot details</h2>
        </div>
        <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
      </div>
      ${accountForm(ctx, members, returnTo)}
    </div>
  </dialog>`;
}

function goalForm(ctx, members, accounts, returnTo) {
  return `<form method="post" action="/savings/goals" class="stack modal-form" data-stepped-form>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <div class="modal-stepper">
      <div class="modal-stepper-meta">
        <span class="modal-stepper-count">Step <strong data-step-current>1</strong> of <span data-step-total>3</span></span>
        <strong class="modal-stepper-title" data-step-title>Goal</strong>
      </div>
      <div class="modal-stepper-track"><div class="modal-stepper-bar" data-step-progress-bar></div></div>
    </div>
    <section class="form-section" data-form-step data-step-title="Goal">
      <h3>Goal</h3>
      <label>Goal name <input name="name" maxlength="120" required data-modal-field="name"></label>
      <label>How should progress be tracked?
        <select name="tracking_mode" data-modal-field="trackingMode" data-controls>
          <option value="linked_pots">From linked accounts and pots</option>
          <option value="manual">Manually</option>
        </select>
      </label>
      <label>Goal type
        <select name="goal_type" data-modal-field="goalType">
          <option value="general">General</option>
          <option value="retirement">Retirement</option>
        </select>
      </label>
      <label>Target amount <input name="target_amount" ${moneyInputAttrs({ required: true, min: '0.01' })} data-modal-field="targetAmount"></label>
      <label>Target date <input name="target_date" type="date" data-modal-field="targetDate"></label>
      <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
    </section>
    <section class="form-section" data-form-step data-step-title="Progress tracking" data-controlled-by="tracking_mode" data-show-when="manual" hidden>
      <h3>Manual progress</h3>
      <label>Current saved amount <input name="current_saved_amount" ${moneyInputAttrs()} data-modal-field="currentSavedAmount"></label>
      <label>Monthly contribution <input name="monthly_contribution" ${moneyInputAttrs()} data-modal-field="monthlyContribution"></label>
    </section>
    <section class="form-section" data-form-step data-step-title="Progress tracking" data-controlled-by="tracking_mode" data-show-when="linked_pots">
      <h3>Linked pots</h3>
      ${
        accounts.length
          ? `<fieldset class="option-checklist" data-modal-field-array="linkedAccountIds">
              <legend>Accounts and pots linked to this goal</legend>
              ${accounts
                .map(
                  (account) => `<label class="checkbox-line">
                    <input type="checkbox" name="linked_account_ids" value="${account.id}">
                    <span>${escapeHtml(account.name)} <small class="hint">· ${escapeHtml(savingsAccountTypeLabel(account.account_type))}</small></span>
                  </label>`
                )
                .join('')}
            </fieldset>`
          : '<p class="hint">Track an account or pot first if you want to link this goal to where the money sits.</p>'
      }
    </section>
    <section class="form-section" data-form-step data-step-title="Status and notes">
      <h3>Status and notes</h3>
      <label>Status
        <select name="status" data-modal-field="status">
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer modal-footer-split">
      <div class="modal-footer-start">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
      </div>
      <div class="modal-footer-actions">
        <button type="button" class="secondary" data-step-back hidden>Back</button>
        <button type="button" data-step-next data-hide-on-final-step>Next</button>
        <button data-show-on-final-step hidden>Save goal</button>
      </div>
    </div>
  </form>`;
}

function accountForm(ctx, members, returnTo) {
  const defaultRateType = defaultProjectedRateTypeForAccount('current_account');
  const defaultRateLabel = projectedRateLabelForAccount('current_account', defaultRateType);
  const defaultAccess = defaultAccessSettingsForAccount('current_account');
  return `<form method="post" action="/savings/accounts" class="stack modal-form" data-savings-projection-form data-stepped-form>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <input type="hidden" name="projected_annual_rate" value="0" data-modal-field="projectedAnnualRate">
    <input type="hidden" name="projected_rate_type" value="${escapeHtml(defaultRateType)}" data-modal-field="projectedRateType">
    <div class="modal-stepper">
      <div class="modal-stepper-meta">
        <span class="modal-stepper-count">Step <strong data-step-current>1</strong> of <span data-step-total>5</span></span>
        <strong class="modal-stepper-title" data-step-title>Account or pot</strong>
      </div>
      <div class="modal-stepper-track"><div class="modal-stepper-bar" data-step-progress-bar></div></div>
    </div>
    <section class="form-section" data-form-step data-step-title="Account or pot">
      <h3>Account or pot</h3>
      <label>Name <input name="name" maxlength="120" required data-modal-field="name"></label>
      <label>Provider or wrapper <input name="provider_name" maxlength="120" data-modal-field="providerName"></label>
      <label>Account type
        <select name="account_type" data-modal-field="accountType" data-controls>
          ${savingsAccountTypeOptions().map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>
      <p class="inline-hint">Choose the wrapper or account the money actually sits in, such as a current account, cash savings account, ISA, pension, or another pot.</p>
      <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
    </section>
    <section class="form-section" data-form-step data-step-title="Contributions and access">
      <h3>Contributions and access</h3>
      <div data-controlled-by="account_type" data-show-when="defined_benefit_pension" hidden>
        <label>Annual pension entitlement <input name="annual_pension_entitlement" ${moneyInputAttrs()} data-modal-field="annualPensionEntitlement"></label>
        <label>Lump sum entitlement <input name="lump_sum_entitlement" ${moneyInputAttrs()} data-modal-field="lumpSumEntitlement"></label>
        <label>Estimated transfer value <input name="estimated_transfer_value" ${moneyInputAttrs()} data-modal-field="estimatedTransferValue"></label>
        <p class="inline-hint">Defined benefit pensions are future income entitlements. They are not treated as normal balance-growth pots unless you enter an estimated transfer value.</p>
      </div>
      <div data-controlled-by="account_type" data-hide-when="defined_benefit_pension">
        <label>Current balance <input name="current_balance" ${moneyInputAttrs()} data-modal-field="currentBalance"></label>
        <label>Monthly contribution <input name="monthly_contribution" ${moneyInputAttrs()} data-modal-field="monthlyContribution"></label>
        <p class="inline-hint">This is the amount you personally plan to add each month. It is the figure counted in the household budget.</p>
      </div>
      <div data-controlled-by="account_type" data-show-when="pension|defined_contribution_pension|sipp_pension">
        <label>Employer monthly contribution <input name="employer_monthly_contribution" ${moneyInputAttrs()} data-modal-field="employerMonthlyContribution"></label>
        <p class="inline-hint">For pensions, add the employer top-up separately. It affects the projection, but not your household spending budget.</p>
      </div>
      <label class="checkbox-line">
        <input type="checkbox" name="available_for_household_cashflow" value="1" ${defaultAccess.availableForHouseholdCashflow ? 'checked' : ''} data-modal-field="availableForHouseholdCashflow">
        <span>Include this balance in household cashflow forecasts</span>
      </label>
      <label>Access type
        <select name="access_type" data-modal-field="accessType" data-savings-access-type>
          ${accessTypeOptions(defaultAccess.accessType)}
        </select>
      </label>
      <div data-controlled-by="access_type" data-show-when="locked_until_date">
        <label>Access date <input name="access_date" type="date" data-modal-field="accessDate"></label>
      </div>
      <div data-controlled-by="access_type" data-show-when="locked_until_age">
        <label>Access age <input name="access_age" ${decimalInputAttrs({ min: '0', max: '120', decimals: 0, step: '1' })} data-modal-field="accessAge"></label>
      </div>
      <label>Access notes <textarea name="access_notes" rows="2" data-modal-field="accessNotes"></textarea></label>
      <p class="inline-hint">Turn on household cashflow access only if this balance could realistically be used to cover normal household spending.</p>
    </section>
    <section class="form-section" data-form-step data-step-title="Projection assumptions" data-controlled-by="account_type" data-hide-when="defined_benefit_pension">
      <h3>Projection assumptions</h3>
      <div class="form-section nested-form-section" data-controlled-by="account_type" data-show-when="lifetime_isa">
        <h3>Lifetime ISA bonus</h3>
        <label class="checkbox-line">
          <input type="checkbox" name="include_lisa_bonus" value="1" data-modal-field="includeLisaBonus">
          <span>Apply the 25% government bonus in projections</span>
        </label>
        <p class="inline-hint">Use this if you want the projection to include the usual Lifetime ISA bonus on eligible contributions.</p>
      </div>
      <label>
        <span data-savings-rate-label>${escapeHtml(defaultRateLabel)}</span>
        <select name="projection_preset" data-savings-rate-preset data-modal-field="projectionPreset">
          <option value="0">No growth: 0%</option>
          <option value="2">Low: 2%</option>
          <option value="4">Medium: 4%</option>
          <option value="6">High: 6%</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <div data-savings-custom-rate hidden>
        <label>Custom percentage <input name="projected_annual_rate_custom" ${decimalInputAttrs({ min: '0', max: '100', decimals: 2, step: '0.1' })} data-modal-field="projectedAnnualRateCustom"></label>
      </div>
      <div data-savings-rate-type-override hidden>
        <label>Treat projected return as
          <select name="projected_rate_type_override" data-modal-field="projectedRateTypeOverride">
            <option value="interest">Interest</option>
            <option value="growth">Growth</option>
          </select>
        </label>
      </div>
      <p class="inline-hint" data-savings-rate-helper>Use a cautious planning assumption. Actual investment returns can be higher or lower.</p>
      <div data-controlled-by="account_type" data-show-when="stocks_and_shares_isa|lifetime_isa|pension|defined_contribution_pension|sipp_pension">
        <label>Annual charge <input name="annual_charge_percentage" ${decimalInputAttrs({ min: '0', max: '100', decimals: 2, step: '0.01' })} data-modal-field="annualChargePercentage"></label>
        <p class="inline-hint">Optional. Enter platform or fund charges as a yearly percentage, for example 0.43.</p>
      </div>
      <label class="checkbox-line">
        <input type="checkbox" name="is_active" value="1" checked data-modal-field="isActive">
        <span>Include this pot in projections</span>
      </label>
      <p class="inline-hint">If you pause a pot, it stays in the table but no longer feeds savings projections or linked-goal forecasting.</p>
    </section>
    <section class="form-section modal-summary-card" data-form-step data-step-title="Projection preview" data-savings-projection-form>
      <h3>12-month projection preview</h3>
      <dl class="summary-list">
        <div><dt>Monthly contribution</dt><dd data-savings-preview-monthly>£0.00</dd></div>
        <div><dt>Annual contribution</dt><dd data-savings-preview-annual>£0.00</dd></div>
        <div data-savings-preview-employer-row hidden><dt>Employer contributions</dt><dd data-savings-preview-employer>£0.00</dd></div>
        <div data-savings-preview-lisa-row hidden><dt>Projected LISA bonus</dt><dd data-savings-preview-lisa>£0.00</dd></div>
        <div><dt data-savings-preview-rate-label>${escapeHtml(defaultRateLabel)}</dt><dd data-savings-preview-rate-value>0%</dd></div>
        <div><dt>Projected value after 12 months</dt><dd data-savings-preview-total>£0.00</dd></div>
      </dl>
      <div data-savings-scenarios hidden>
        <p class="inline-hint">Use a cautious planning assumption. Actual investment returns can be higher or lower.</p>
        <dl class="summary-list" data-savings-scenarios-list></dl>
      </div>
    </section>
    <section class="form-section" data-form-step data-step-title="Notes">
      <h3>Notes</h3>
      <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer modal-footer-split">
      <div class="modal-footer-start">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
      </div>
      <div class="modal-footer-actions">
        <button type="button" class="secondary" data-step-back hidden>Back</button>
        <button type="button" data-step-next data-hide-on-final-step>Next</button>
        <button data-show-on-final-step hidden>Save account or pot</button>
      </div>
    </div>
  </form>`;
}

function goalsOverview(goals) {
  if (!goals.length) {
    return '<div class="empty-state compact"><h3>No savings goals yet</h3><p>Add a goal to track progress towards an emergency fund, holiday, house deposit, or other target.</p></div>';
  }
  return `<div class="goal-list">${goals.map((goal) => goalProgress(goal)).join('')}</div>`;
}

function goalProgress(goal) {
  const progress = goal.metrics || savingsGoalMetrics(goal, { linkedAccounts: goal.linkedAccounts || [] });
  return `<article class="goal">
    <div class="goal-head"><strong>${escapeHtml(goal.name)}</strong><span>${formatCurrency(progress.currentSavedPence)} of ${formatCurrency(goal.target_amount_pence)}</span></div>
    <progress value="${progress.progressPercentage}" max="100"></progress>
    <small class="goal-meta">${progress.progressPercentage}% · ${escapeHtml(progress.statusLabel)}${goal.linkedAccounts?.length ? ` · ${escapeHtml(goalLinkedPotsSummary(goal))}` : ''}</small>
  </article>`;
}

function accountsSnapshotTable(accounts, members) {
  if (!accounts.length) return '<p class="empty">No accounts or pots tracked yet.</p>';

  const desktopTable = `<table class="data-table">
    <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th>Balance</th><th>Monthly additions</th></tr></thead>
    <tbody>${accounts
      .map((account) => `<tr>
        <td>${escapeHtml(account.name)}</td>
        <td>${escapeHtml(savingsAccountTypeLabel(account.account_type))}</td>
        <td>${escapeHtml(ownerLabel(account.owner_type, members))}</td>
        <td>${accountBalanceCell(account)}</td>
        <td>${monthlyAdditionsCell(account)}</td>
      </tr>`)
      .join('')}</tbody>
  </table>`;
  const mobileCardsId = 'accounts-snapshot-mobile-cards';
  return responsiveFinanceTable(desktopTable, `
    ${mobileSortControl(mobileCardsId, accounts.length, [
      ['balance:desc', 'Balance, high to low'],
      ['name:asc', 'Name, A to Z'],
      ['owner:asc', 'Owner, A to Z'],
      ['monthly:desc', 'Monthly additions, high to low']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${accounts.map((account) => savingsAccountMobileCard(account, members)).join('')}
    </div>
  `);
}

function savingsAccountsTable(ctx, accounts, members) {
  if (!accounts.length) return '<p class="empty">No accounts or pots tracked yet.</p>';

  const desktopTable = `<table class="data-table">
    <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th>Balance</th><th>Monthly additions</th><th class="actions-col"></th></tr></thead>
    <tbody>${accounts
      .map((account) => {
        return `<tr>
          <td>
            <div class="cell-stack">
              <strong>${escapeHtml(account.name)}</strong>
              ${account.provider_name ? `<small class="hint">${escapeHtml(account.provider_name)}</small>` : Number(account.is_active) === 0 ? '<small class="hint">Excluded from projections</small>' : ''}
            </div>
          </td>
          <td>${escapeHtml(savingsAccountTypeLabel(account.account_type))}</td>
          <td>${escapeHtml(ownerLabel(account.owner_type, members))}</td>
          <td>${accountBalanceCell(account)}</td>
          <td>${monthlyAdditionsCell(account)}</td>
          <td class="actions-col">${savingsAccountActions(ctx, account)}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
  const mobileCardsId = 'savings-accounts-mobile-cards';
  return responsiveFinanceTable(desktopTable, `
    ${mobileSortControl(mobileCardsId, accounts.length, [
      ['balance:desc', 'Balance, high to low'],
      ['name:asc', 'Name, A to Z'],
      ['owner:asc', 'Owner, A to Z'],
      ['monthly:desc', 'Monthly additions, high to low'],
      ['status:asc', 'Status, A to Z']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${accounts.map((account) => savingsAccountMobileCard(account, members, savingsAccountActions(ctx, account))).join('')}
    </div>
  `);
}

function goalsTable(ctx, goals, members, returnTo) {
  if (!goals.length) {
    return '<div class="empty-state compact"><h3>No savings goals yet</h3><p>Add a goal to track progress towards an emergency fund, holiday, house deposit, or other target.</p></div>';
  }
  const desktopTable = `<table class="data-table">
    <thead><tr><th>Goal</th><th>Owner</th><th>Target</th><th>Current saved</th><th>Projected at target date</th><th>Shortfall / surplus</th><th>Linked pots</th><th>Status</th><th class="actions-col"></th></tr></thead>
    <tbody>${goals
      .map((goal) => {
        const progress = goal.metrics || savingsGoalMetrics(goal, { linkedAccounts: goal.linkedAccounts || [] });
        return `<tr>
          <td>
            <div class="cell-stack">
              <strong>${escapeHtml(goal.name)}</strong>
              <small class="hint">${escapeHtml(goal.goal_type === 'retirement' ? 'Retirement' : progress.trackingMode === 'linked_pots' ? 'Linked pots' : 'Manual progress')}</small>
            </div>
          </td>
          <td>${escapeHtml(ownerLabel(goal.owner_type, members))}</td>
          <td>${formatCurrency(goal.target_amount_pence)}</td>
          <td>${formatCurrency(progress.currentSavedPence)}</td>
          <td>${progress.projectedValueAtTargetDatePence === null ? '—' : formatCurrency(progress.projectedValueAtTargetDatePence)}</td>
          <td class="${progress.projectedShortfallSurplusPence > 0 ? 'forecast-movement positive' : progress.projectedShortfallSurplusPence < 0 ? 'forecast-movement negative' : ''}">${progress.projectedShortfallSurplusPence === null ? '—' : formatSignedCurrency(progress.projectedShortfallSurplusPence)}</td>
          <td>${escapeHtml(goalLinkedPotsSummary(goal))}</td>
          <td>${escapeHtml(progress.statusLabel)}</td>
          <td class="actions-col">${savingsGoalActions(ctx, goal, progress, returnTo)}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
  const mobileCardsId = 'savings-goals-mobile-cards';
  return responsiveFinanceTable(desktopTable, `
    ${mobileSortControl(mobileCardsId, goals.length, [
      ['targetDate:asc', 'Target date, soonest first'],
      ['target:desc', 'Target, high to low'],
      ['name:asc', 'Name, A to Z'],
      ['owner:asc', 'Owner, A to Z'],
      ['status:asc', 'Status, A to Z']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${goals
        .map((goal) => {
          const progress = goal.metrics || savingsGoalMetrics(goal, { linkedAccounts: goal.linkedAccounts || [] });
          return savingsGoalMobileCard(ctx, goal, progress, members, returnTo);
        })
        .join('')}
    </div>
  `);
}

function savingsAccountActions(ctx, account) {
  return `<div class="table-actions">
    ${actionIconButton({
      label: 'Edit account or pot',
      icon: 'edit',
      variant: 'edit',
      attributes: `data-open-modal="savings-account-modal"
      data-reset-modal="true"
      data-fill-id="${escapeHtml(account.id)}"
      data-fill-name="${escapeHtml(account.name)}"
      data-fill-provider-name="${escapeHtml(account.provider_name || '')}"
      data-fill-account-type="${escapeHtml(account.account_type)}"
      data-fill-owner-type="${escapeHtml(account.owner_type)}"
      data-fill-current-balance="${escapeHtml((Number(account.current_balance_pence || 0) / 100).toFixed(2))}"
      data-fill-estimated-transfer-value="${escapeHtml((Number(account.current_balance_pence || 0) / 100).toFixed(2))}"
      data-fill-monthly-contribution="${escapeHtml((Number(account.monthly_contribution_pence || 0) / 100).toFixed(2))}"
      data-fill-employer-monthly-contribution="${escapeHtml((Number(account.employer_monthly_contribution_pence || 0) / 100).toFixed(2))}"
      data-fill-available-for-household-cashflow="${Number(account.available_for_household_cashflow) === 1 ? 'true' : 'false'}"
      data-fill-access-type="${escapeHtml(account.access_type || defaultAccessSettingsForAccount(account.account_type).accessType)}"
      data-fill-access-date="${escapeHtml(account.access_date || '')}"
      data-fill-access-age="${escapeHtml(account.access_age ?? '')}"
      data-fill-access-notes="${escapeHtml(account.access_notes || '')}"
      data-fill-projected-annual-rate="${escapeHtml(String(Number(account.projected_annual_rate || 0)))}"
      data-fill-projected-rate-type="${escapeHtml(account.projected_rate_type)}"
      data-fill-include-lisa-bonus="${Number(account.include_lisa_bonus) === 1 ? 'true' : 'false'}"
      data-fill-annual-charge-percentage="${escapeHtml(String(Number(account.annual_charge_percentage || 0) || ''))}"
      data-fill-annual-pension-entitlement="${escapeHtml((Number(account.annual_pension_entitlement_pence || 0) / 100).toFixed(2))}"
      data-fill-lump-sum-entitlement="${escapeHtml((Number(account.lump_sum_entitlement_pence || 0) / 100).toFixed(2))}"
      data-fill-is-active="${Number(account.is_active) === 1 ? 'true' : 'false'}"
      data-fill-notes="${escapeHtml(account.notes || '')}"`
    })}
    <form method="post" action="/savings/accounts/delete" data-confirm="Delete this account or pot?">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${account.id}">
      <input type="hidden" name="return_to" value="/savings/accounts">
      ${actionIconButton({ label: 'Delete account or pot', icon: 'delete', variant: 'delete', type: 'submit' })}
    </form>
  </div>`;
}

function savingsGoalActions(ctx, goal, progress, returnTo) {
  return `<div class="table-actions">
    ${actionIconButton({
      label: 'Edit savings goal',
      icon: 'edit',
      variant: 'edit',
      attributes: `data-open-modal="savings-goal-modal"
      data-reset-modal="true"
      data-fill-id="${escapeHtml(goal.id)}"
      data-fill-name="${escapeHtml(goal.name)}"
      data-fill-tracking-mode="${escapeHtml(progress.trackingMode)}"
      data-fill-goal-type="${escapeHtml(goal.goal_type || 'general')}"
      data-fill-target-amount="${escapeHtml((Number(goal.target_amount_pence || 0) / 100).toFixed(2))}"
      data-fill-owner-type="${escapeHtml(goal.owner_type)}"
      data-fill-current-saved-amount="${escapeHtml((Number(goal.current_saved_amount_pence || 0) / 100).toFixed(2))}"
      data-fill-monthly-contribution="${escapeHtml((Number(goal.monthly_contribution_pence || 0) / 100).toFixed(2))}"
      data-fill-target-date="${escapeHtml(goal.target_date || '')}"
      data-fill-status="${escapeHtml(goal.status)}"
      data-fill-notes="${escapeHtml(goal.notes || '')}"
      data-fill-linked-account-ids="${escapeHtml(goal.linkedAccounts?.map((account) => account.id).join(',') || '')}"`
    })}
    <form method="post" action="/savings/delete" data-confirm="Delete this savings goal?">
      ${csrfField(ctx)}
      <input type="hidden" name="id" value="${goal.id}">
      <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
      ${actionIconButton({ label: 'Delete savings goal', icon: 'delete', variant: 'delete', type: 'submit' })}
    </form>
  </div>`;
}

function savingsAccountMobileCard(account, members, actions = '') {
  const status = Number(account.is_active) === 1 ? 'Active' : 'Excluded';
  const monthlyTotalPence = Number(account.monthly_contribution_pence || 0) + Number(account.employer_monthly_contribution_pence || 0);
  return `<article class="mobile-finance-card ${mobileStatusClass(status)}" data-mobile-sort-card
    data-sort-name="${escapeHtml(String(account.name || '').toLowerCase())}"
    data-sort-owner="${escapeHtml(ownerLabel(account.owner_type, members).toLowerCase())}"
    data-sort-balance="${Number(account.current_balance_pence || 0)}"
    data-sort-monthly="${monthlyTotalPence}"
    data-sort-status="${escapeHtml(status.toLowerCase())}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(account.name)}</h3>
        <p>${escapeHtml(account.provider_name || savingsAccountTypeLabel(account.account_type))}</p>
      </div>
      <span class="mobile-card-status ${mobileStatusClass(status)}">${escapeHtml(status)}</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${account.account_type === 'defined_benefit_pension' ? formatCurrency(account.annual_pension_entitlement_pence || 0) : formatCurrency(account.current_balance_pence)}</strong>
      <span>${escapeHtml(ownerLabel(account.owner_type, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel(account.owner_type, members))}</dd></div>
      <div><dt>Type</dt><dd>${escapeHtml(savingsAccountTypeLabel(account.account_type))}</dd></div>
      <div><dt>Monthly additions</dt><dd>${monthlyAdditionsCell(account)}</dd></div>
    </dl>
    ${actions ? `<div class="mobile-card-actions">${actions}</div>` : ''}
  </article>`;
}

function savingsGoalMobileCard(ctx, goal, progress, members, returnTo) {
  const projected = progress.projectedValueAtTargetDatePence === null ? 'Not projected' : formatCurrency(progress.projectedValueAtTargetDatePence);
  const shortfallSurplus = progress.projectedShortfallSurplusPence === null ? 'Not projected' : formatSignedCurrency(progress.projectedShortfallSurplusPence);
  return `<article class="mobile-finance-card ${mobileStatusClass(progress.statusLabel)}" data-mobile-sort-card
    data-sort-name="${escapeHtml(String(goal.name || '').toLowerCase())}"
    data-sort-owner="${escapeHtml(ownerLabel(goal.owner_type, members).toLowerCase())}"
    data-sort-target="${Number(goal.target_amount_pence || 0)}"
    data-sort-target-date="${escapeHtml(goal.target_date || '9999-12-31')}"
    data-sort-status="${escapeHtml(String(progress.statusLabel || '').toLowerCase())}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(goal.name)}</h3>
        <p>${escapeHtml(goal.goal_type === 'retirement' ? 'Retirement' : progress.trackingMode === 'linked_pots' ? 'Linked pots' : 'Manual progress')}</p>
      </div>
      <span class="mobile-card-status ${mobileStatusClass(progress.statusLabel)}">${escapeHtml(progress.statusLabel)}</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${formatCurrency(progress.currentSavedPence)}</strong>
      <span>${escapeHtml(ownerLabel(goal.owner_type, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel(goal.owner_type, members))}</dd></div>
      <div><dt>Projected at target date</dt><dd>${escapeHtml(projected)}</dd></div>
      <div><dt>Shortfall / surplus</dt><dd>${escapeHtml(shortfallSurplus)}</dd></div>
      <div><dt>Linked pots</dt><dd>${escapeHtml(goalLinkedPotsSummary(goal))}</dd></div>
    </dl>
    <div class="mobile-card-actions">${savingsGoalActions(ctx, goal, progress, returnTo)}</div>
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
  if (value.includes('excluded') || value.includes('pause') || value.includes('behind')) return 'warning';
  if (value.includes('end')) return 'ended';
  return '';
}

function decorateGoalsWithLinkedAccounts(goals, linkedAccountRows, accounts = []) {
  const accountsById = new Map(accounts.map((account) => [String(account.id), account]));
  const linkedAccountsByGoalId = new Map();
  for (const row of linkedAccountRows) {
    const key = String(row.goal_id);
    const current = linkedAccountsByGoalId.get(key) || [];
    current.push(accountsById.get(String(row.savings_account_id)) || {
      id: row.savings_account_id,
      name: row.savings_account_name,
      owner_type: row.owner_type,
      account_type: row.account_type,
      current_balance_pence: 0,
      monthly_contribution_pence: 0,
      employer_monthly_contribution_pence: 0,
      projected_annual_rate: 0,
      projected_rate_type: defaultProjectedRateTypeForAccount(row.account_type),
      include_lisa_bonus: 0,
      is_active: 1
    });
    linkedAccountsByGoalId.set(key, current);
  }

  return goals.map((goal) => ({
    ...goal,
    linkedAccounts: linkedAccountsByGoalId.get(String(goal.id)) || [],
    metrics: savingsGoalMetrics(goal, {
      linkedAccounts: linkedAccountsByGoalId.get(String(goal.id)) || [],
      startMonth: currentMonth()
    })
  }));
}

function goalLinkedPotsSummary(goal) {
  if (!goal.linkedAccounts?.length) return 'Not linked';
  return goal.linkedAccounts.map((account) => account.name).join(', ');
}

function monthlyAdditionsCell(account) {
  const personalContributionPence = Number(account.monthly_contribution_pence || 0);
  const employerContributionPence = Number(account.employer_monthly_contribution_pence || 0);
  const includeLisaBonus = Number(account.include_lisa_bonus) === 1;
  const extras = [];

  if (isPensionAccountType(account.account_type) && account.account_type !== 'defined_benefit_pension' && employerContributionPence > 0) {
    extras.push(`Employer ${formatCurrency(employerContributionPence)}/month`);
  }

  if (account.account_type === 'lifetime_isa' && includeLisaBonus) {
    extras.push('25% LISA bonus in projections');
  }

  return `<div class="cell-stack">
    <strong>${formatCurrency(personalContributionPence)}</strong>
    ${extras.map((text) => `<small class="hint">${escapeHtml(text)}</small>`).join('')}
  </div>`;
}

function accountBalanceCell(account) {
  if (account.account_type !== 'defined_benefit_pension') {
    return formatCurrency(account.current_balance_pence);
  }
  const rows = [
    `<strong>${formatCurrency(account.annual_pension_entitlement_pence || 0)}/year</strong>`
  ];
  if (Number(account.lump_sum_entitlement_pence || 0) > 0) {
    rows.push(`<small class="hint">Lump sum ${formatCurrency(account.lump_sum_entitlement_pence)}</small>`);
  }
  if (Number(account.current_balance_pence || 0) > 0) {
    rows.push(`<small class="hint">Transfer value ${formatCurrency(account.current_balance_pence)}</small>`);
  }
  return `<div class="cell-stack">${rows.join('')}</div>`;
}

function resolveProjectedAnnualRate(body) {
  const preset = String(body.projection_preset || '').trim();
  const presetRates = new Set(['0', '2', '4', '6']);

  if (presetRates.has(preset)) {
    return Number(preset);
  }

  if (String(body.projected_annual_rate || '').trim()) {
    return requireDecimal(body.projected_annual_rate, 'Projected annual rate', { min: 0, max: 100 });
  }

  if (String(body.projected_annual_rate_custom || '').trim()) {
    return requireDecimal(body.projected_annual_rate_custom, 'Custom projected annual rate', { min: 0, max: 100 });
  }

  return 0;
}

function resolveProjectedRateType(accountType, overrideValue) {
  if (accountType === 'other') {
    return requireChoice(overrideValue || 'interest', ['interest', 'growth'], 'Projected return type');
  }
  return defaultProjectedRateTypeForAccount(accountType);
}

function parseIdList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.flatMap((entry) => String(entry || '').split(',')).map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0))];
}

function accessTypeOptions(selectedValue = 'instant_access') {
  return [
    ['instant_access', 'Available now'],
    ['notice', 'Notice account'],
    ['penalty_withdrawal', 'Withdrawal penalty'],
    ['locked_until_date', 'Locked until a date'],
    ['locked_until_age', 'Locked until an age']
  ]
    .map(([value, label]) => `<option value="${value}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function optionalInteger(value, fieldName, { min = null, max = null } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  if (!Number.isInteger(number)) throw new Error(`${fieldName} must be a whole number.`);
  if (min !== null && number < min) throw new Error(`${fieldName} must be at least ${min}.`);
  if (max !== null && number > max) throw new Error(`${fieldName} must be no more than ${max}.`);
  return number;
}

function optionalPercentage(value, fieldName) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return 0;
  return requireDecimal(trimmed, fieldName, { min: 0, max: 100 });
}
