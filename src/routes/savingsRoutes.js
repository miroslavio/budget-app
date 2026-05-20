import { createSavingsGoal, listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { parsePoundsToPence } from '../utils/money.js';
import { requireChoice, requireString } from '../utils/validation.js';
import { savingsGoalProgress } from '../services/savingsService.js';
import { csrfField, escapeHtml, formatCurrency, ownerLabel, page } from '../views/html.js';
import { ownerOptions } from '../views/forms.js';
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
        title: 'Savings goals',
        wide: true,
        body: `<section class="page-title">
          <div>
            <p class="eyebrow">Savings</p>
            <h1>Savings goals</h1>
            <p>Track ISAs, emergency funds, and shared household savings goals.</p>
          </div>
        </section>
        <section class="action-row">
          <button type="button" data-open-modal="savings-goal-modal">Add savings goal</button>
          <dialog id="savings-goal-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <p class="eyebrow">New goal</p>
                  <h2>Add savings goal</h2>
                  <p class="hint">Set the target first, then add current balance and optional monthly contribution.</p>
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
            ${goalsTable(goals)}
          </div>
        </section>`
      })
    );
  });

  router.post('/savings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const targetAmountPence = parsePoundsToPence(ctx.body.target_amount);
      if (targetAmountPence <= 0) throw new Error('Target amount must be greater than zero.');
      createSavingsGoal(db, {
        householdId: ctx.user.household_id,
        name: requireString(ctx.body.name, 'Goal name', 120),
        targetAmountPence,
        currentSavedAmountPence: parsePoundsToPence(ctx.body.current_saved_amount || '0'),
        monthlyContributionPence: parsePoundsToPence(ctx.body.monthly_contribution || '0'),
        targetDate: ctx.body.target_date || null,
        ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
        status: requireChoice(ctx.body.status || 'active', ['active', 'completed', 'paused'], 'Status')
      });
      redirectWithSuccess(ctx.res, '/savings', 'Savings goal saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/savings', error);
    }
  });
}

function goalForm(ctx, members) {
  return `<form method="post" action="/savings" class="stack">
    ${csrfField(ctx)}
    <section class="form-section">
      <h3>1. Target</h3>
    <label>Goal name <input name="name" maxlength="120" required></label>
    <label>Target amount <input name="target_amount" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$" required></label>
    <label>Owner <select name="owner_type">${ownerOptions('shared', members)}</select></label>
    </section>
    <section class="form-section">
      <h3>2. Progress</h3>
    <label>Current saved amount <input name="current_saved_amount" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$"></label>
    <label>Monthly contribution <input name="monthly_contribution" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$"></label>
    <label>Target date <input name="target_date" type="date"></label>
    <label>Status
      <select name="status">
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="completed">Completed</option>
      </select>
    </label>
    </section>
    <button>Save goal</button>
  </form>`;
}

function goalsTable(goals) {
  if (!goals.length) return '<p class="empty">No savings goals yet.</p>';
  return `<table>
    <thead><tr><th>Goal</th><th>Owner</th><th>Progress</th><th>Remaining</th><th>Estimated completion</th><th>Status</th></tr></thead>
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
        </tr>`;
      })
      .join('')}</tbody>
  </table>`;
}
