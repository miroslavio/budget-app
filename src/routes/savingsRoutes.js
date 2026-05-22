import { createSavingsGoal, deleteSavingsGoal, findSavingsGoalById, listSavingsGoals, updateSavingsGoal } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { optionalMoney, requireChoice, requireMoney, requireString } from '../utils/validation.js';
import { savingsGoalProgress } from '../services/savingsService.js';
import { actionIconButton, csrfField, escapeHtml, formatCurrency, ownerLabel, page } from '../views/html.js';
import { moneyInputAttrs, ownerOptions } from '../views/forms.js';
import { html } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerSavingsRoutes(router, db) {
  router.get('/savings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const goals = listSavingsGoals(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, ctx.user.household_id);
    html(
      ctx.res,
      page(ctx, {
        title: 'Savings Goals',
        wide: true,
        body: `<section class="page-title">
          <div>
            <h1>Savings Goals</h1>
            <p class="page-context">Track target balances, monthly contributions, and shared household savings progress.</p>
          </div>
        </section>
        <section class="action-row">
          <button type="button" data-open-modal="savings-goal-modal" data-reset-modal="true">Add savings goal</button>
          <dialog id="savings-goal-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <h2>Savings goal details</h2>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              ${goalForm(ctx, members)}
            </div>
          </dialog>
        </section>
        <section class="grid one">
          <div class="card">
            <h2>Goals</h2>
            ${goalsTable(ctx, goals, members)}
          </div>
        </section>`
      })
    );
  });

  router.post('/savings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const goalId = Number(ctx.body.id || 0) || null;
      if (goalId && !findSavingsGoalById(db, ctx.user.household_id, goalId)) {
        throw new Error('Savings goal was not found.');
      }
      const targetAmountPence = requireMoney(ctx.body.target_amount, 'Target amount');
      const payload = {
        householdId: ctx.user.household_id,
        id: goalId,
        name: requireString(ctx.body.name, 'Goal name', 120),
        targetAmountPence,
        currentSavedAmountPence: optionalMoney(ctx.body.current_saved_amount, 'Current saved amount'),
        monthlyContributionPence: optionalMoney(ctx.body.monthly_contribution, 'Monthly contribution'),
        targetDate: ctx.body.target_date || null,
        ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
        status: requireChoice(ctx.body.status || 'active', ['active', 'completed', 'paused'], 'Status')
      };
      if (goalId) {
        updateSavingsGoal(db, payload);
      } else {
        createSavingsGoal(db, payload);
      }
      redirectWithSuccess(ctx.res, ctx.body.return_to || '/savings', goalId ? 'Savings goal updated.' : 'Savings goal saved.');
    } catch (error) {
      redirectWithError(ctx.res, ctx.body.return_to || '/savings', error);
    }
  });

  router.post('/savings/delete', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      deleteSavingsGoal(db, ctx.user.household_id, Number(ctx.body.id));
      redirectWithSuccess(ctx.res, ctx.body.return_to || '/savings', 'Savings goal deleted.');
    } catch (error) {
      redirectWithError(ctx.res, ctx.body.return_to || '/savings', error);
    }
  });
}

function goalForm(ctx, members) {
  return `<form method="post" action="/savings" class="stack">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="/savings">
    <section class="form-section">
      <h3>Target</h3>
    <label>Goal name <input name="name" maxlength="120" required data-modal-field="name"></label>
    <label>Target amount <input name="target_amount" ${moneyInputAttrs({ required: true, min: '0.01' })} data-modal-field="targetAmount"></label>
    <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
    </section>
    <section class="form-section">
      <h3>Progress</h3>
    <label>Current saved amount <input name="current_saved_amount" ${moneyInputAttrs()} data-modal-field="currentSavedAmount"></label>
    <label>Monthly contribution <input name="monthly_contribution" ${moneyInputAttrs()} data-modal-field="monthlyContribution"></label>
    <label>Target date <input name="target_date" type="date" data-modal-field="targetDate"></label>
    <label>Status
      <select name="status" data-modal-field="status">
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="completed">Completed</option>
      </select>
    </label>
    </section>
    <button>Save goal</button>
  </form>`;
}

function goalsTable(ctx, goals, members) {
  if (!goals.length) return '<p class="empty">No savings goals yet.</p>';
  return `<table class="data-table">
    <thead><tr><th>Goal</th><th>Owner</th><th>Progress</th><th>Remaining</th><th>Estimated completion</th><th>Status</th><th class="actions-col"></th></tr></thead>
    <tbody>${goals
      .map((goal) => {
        const progress = savingsGoalProgress(goal);
        return `<tr>
          <td>${escapeHtml(goal.name)}</td>
          <td>${escapeHtml(ownerLabel(goal.owner_type, members))}</td>
          <td>${progress.progressPercentage}%</td>
          <td>${formatCurrency(progress.remainingPence)}</td>
          <td>${progress.estimatedCompletionDate || 'Not enough data'}</td>
          <td>${goal.status}${progress.onTrack === false ? ' · behind target' : progress.onTrack === true ? ' · on track' : ''}</td>
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
                data-fill-target-amount="${escapeHtml((Number(goal.target_amount_pence || 0) / 100).toFixed(2))}"
                data-fill-owner-type="${escapeHtml(goal.owner_type)}"
                data-fill-current-saved-amount="${escapeHtml((Number(goal.current_saved_amount_pence || 0) / 100).toFixed(2))}"
                data-fill-monthly-contribution="${escapeHtml((Number(goal.monthly_contribution_pence || 0) / 100).toFixed(2))}"
                data-fill-target-date="${escapeHtml(goal.target_date || '')}"
                data-fill-status="${escapeHtml(goal.status)}"`
              })}
              <form method="post" action="/savings/delete" data-confirm="Delete this savings goal?">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${goal.id}">
                <input type="hidden" name="return_to" value="/savings">
                ${actionIconButton({ label: 'Delete savings goal', icon: 'delete', variant: 'delete', type: 'submit' })}
              </form>
            </div>
          </td>
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
}
