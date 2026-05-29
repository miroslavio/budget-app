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
  defaultProjectedRateTypeForAccount,
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

    const payload = {
      householdId: ctx.user.household_id,
      id: accountId,
      name: requireString(ctx.body.name, 'Name', 120),
      providerName: optionalString(ctx.body.provider_name, 120),
      accountType: requireChoice(
        ctx.body.account_type,
        ['current_account', 'easy_access_savings', 'fixed_savings', 'cash_isa', 'stocks_and_shares_isa', 'lifetime_isa', 'pension', 'other'],
        'Account type'
      ),
      ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
      currentBalancePence: optionalMoney(ctx.body.current_balance, 'Current balance'),
      monthlyContributionPence: optionalMoney(ctx.body.monthly_contribution, 'Monthly contribution'),
      employerMonthlyContributionPence: 0,
      projectedAnnualRate,
      projectedRateType: resolveProjectedRateType(ctx.body.account_type, ctx.body.projected_rate_type_override || ctx.body.projected_rate_type),
      includeLisaBonus: false,
      isActive: checkboxValue(ctx.body.is_active),
      notes: optionalString(ctx.body.notes)
    };

    if (payload.accountType === 'pension') {
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
  return `<form method="post" action="/savings/goals" class="stack modal-form">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <section class="form-section">
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
    <section class="form-section" data-controlled-by="tracking_mode" data-show-when="manual" hidden>
      <h3>Manual progress</h3>
      <label>Current saved amount <input name="current_saved_amount" ${moneyInputAttrs()} data-modal-field="currentSavedAmount"></label>
      <label>Monthly contribution <input name="monthly_contribution" ${moneyInputAttrs()} data-modal-field="monthlyContribution"></label>
    </section>
    <section class="form-section" data-controlled-by="tracking_mode" data-show-when="linked_pots">
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
    <section class="form-section">
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
    <div class="modal-footer">
      <button>Save goal</button>
    </div>
  </form>`;
}

function accountForm(ctx, members, returnTo) {
  const defaultRateType = defaultProjectedRateTypeForAccount('current_account');
  const defaultRateLabel = projectedRateLabelForAccount('current_account', defaultRateType);
  return `<form method="post" action="/savings/accounts" class="stack modal-form" data-savings-projection-form>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
    <input type="hidden" name="projected_annual_rate" value="0" data-modal-field="projectedAnnualRate">
    <input type="hidden" name="projected_rate_type" value="${escapeHtml(defaultRateType)}" data-modal-field="projectedRateType">
    <section class="form-section">
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
    <section class="form-section">
      <h3>Balance and projection</h3>
      <label>Current balance <input name="current_balance" ${moneyInputAttrs()} data-modal-field="currentBalance"></label>
      <label>Monthly contribution <input name="monthly_contribution" ${moneyInputAttrs()} data-modal-field="monthlyContribution"></label>
      <p class="inline-hint">This is the amount you personally plan to add each month. It is the figure counted in the household budget.</p>
      <div data-controlled-by="account_type" data-show-when="pension">
        <label>Employer monthly contribution <input name="employer_monthly_contribution" ${moneyInputAttrs()} data-modal-field="employerMonthlyContribution"></label>
        <p class="inline-hint">For pensions, add the employer top-up separately. It affects the projection, but not your household spending budget.</p>
      </div>
      <div class="form-section" data-controlled-by="account_type" data-show-when="lifetime_isa">
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
      <label class="checkbox-line">
        <input type="checkbox" name="is_active" value="1" checked data-modal-field="isActive">
        <span>Include this pot in projections</span>
      </label>
    </section>
    <section class="form-section modal-summary-card" data-savings-projection-form>
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
    <section class="form-section">
      <h3>Notes</h3>
      <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer">
      <button>Save account or pot</button>
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

  return `<table class="data-table">
    <thead><tr><th>Name</th><th>Type</th><th>Owner</th><th>Balance</th><th>Monthly additions</th></tr></thead>
    <tbody>${accounts
      .map((account) => `<tr>
        <td>${escapeHtml(account.name)}</td>
        <td>${escapeHtml(savingsAccountTypeLabel(account.account_type))}</td>
        <td>${escapeHtml(ownerLabel(account.owner_type, members))}</td>
        <td>${formatCurrency(account.current_balance_pence)}</td>
        <td>${monthlyAdditionsCell(account)}</td>
      </tr>`)
      .join('')}</tbody>
  </table>`;
}

function savingsAccountsTable(ctx, accounts, members) {
  if (!accounts.length) return '<p class="empty">No accounts or pots tracked yet.</p>';

  return `<table class="data-table">
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
          <td>${formatCurrency(account.current_balance_pence)}</td>
          <td>${monthlyAdditionsCell(account)}</td>
          <td class="actions-col">
            <div class="table-actions">
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
                data-fill-monthly-contribution="${escapeHtml((Number(account.monthly_contribution_pence || 0) / 100).toFixed(2))}"
                data-fill-employer-monthly-contribution="${escapeHtml((Number(account.employer_monthly_contribution_pence || 0) / 100).toFixed(2))}"
                data-fill-projected-annual-rate="${escapeHtml(String(Number(account.projected_annual_rate || 0)))}"
                data-fill-projected-rate-type="${escapeHtml(account.projected_rate_type)}"
                data-fill-include-lisa-bonus="${Number(account.include_lisa_bonus) === 1 ? 'true' : 'false'}"
                data-fill-is-active="${Number(account.is_active) === 1 ? 'true' : 'false'}"
                data-fill-notes="${escapeHtml(account.notes || '')}"`
              })}
              <form method="post" action="/savings/accounts/delete" data-confirm="Delete this account or pot?">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${account.id}">
                <input type="hidden" name="return_to" value="/savings/accounts">
                ${actionIconButton({ label: 'Delete account or pot', icon: 'delete', variant: 'delete', type: 'submit' })}
              </form>
            </div>
          </td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
}

function goalsTable(ctx, goals, members, returnTo) {
  if (!goals.length) {
    return '<div class="empty-state compact"><h3>No savings goals yet</h3><p>Add a goal to track progress towards an emergency fund, holiday, house deposit, or other target.</p></div>';
  }
  return `<table class="data-table">
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
          <td class="actions-col">
            <div class="table-actions">
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
            </div>
          </td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
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

  if (account.account_type === 'pension' && employerContributionPence > 0) {
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
