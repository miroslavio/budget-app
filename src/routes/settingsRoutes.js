import { findHouseholdById, updateHouseholdSettings } from '../repositories/householdRepository.js';
import { createCategory, listCategories } from '../repositories/categoryRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { parsePoundsToPence } from '../utils/money.js';
import { requireString } from '../utils/validation.js';
import { csrfField, escapeHtml, formatCurrency, moneyInputValue, ownerLabel, page } from '../views/html.js';
import { html } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerSettingsRoutes(router, db) {
  router.get('/settings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, household.id);
    const categories = listCategories(db, null, 'expense');
    html(
      ctx.res,
      page(ctx, {
        title: 'Settings',
        body: `<section class="page-title">
          <div>
            <h1>Settings</h1>
          </div>
        </section>
        <section class="grid two">
          <div class="card">
            <h2>Household</h2>
            <form method="post" action="/settings" class="stack">
              ${csrfField(ctx)}
              <label>Household name <input name="name" value="${escapeHtml(household.name)}" maxlength="120" required></label>
              <label>Opening balance for forecast <input name="opening_balance" value="${moneyInputValue(household.opening_balance_pence)}" inputmode="decimal"></label>
              <button>Save settings</button>
            </form>
          </div>
          <div class="card">
            <h2>Members</h2>
            <table>
              <thead><tr><th>Person</th><th>Name</th><th>Email</th></tr></thead>
              <tbody>${members
                .map((member) => `<tr><td>${escapeHtml(ownerLabel(member.person_key, members))}</td><td>${escapeHtml(member.display_name)}</td><td>${escapeHtml(member.email)}</td></tr>`)
                .join('')}</tbody>
            </table>
            <p class="hint">Invite code for Person B: <strong>${escapeHtml(household.invite_code)}</strong></p>
            <p class="hint">Opening balance currently used by forecast: ${formatCurrency(household.opening_balance_pence)}</p>
          </div>
        </section>`
        + `<section class="card">
          <div class="card-heading">
            <div>
              <h2>Expense categories</h2>
            </div>
          </div>
          <div class="grid two">
            <form method="post" action="/settings/categories" class="stack">
              ${csrfField(ctx)}
              <label>Category name <input name="name" maxlength="120" required></label>
              <button>Add category</button>
            </form>
            <div>
              ${categories.length ? `<table>
                <thead><tr><th>Name</th><th>Scope</th></tr></thead>
                <tbody>${categories
                  .map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${category.is_default ? 'Built-in' : 'Custom'}</td></tr>`)
                  .join('')}</tbody>
              </table>` : '<p class="empty">No expense categories yet.</p>'}
            </div>
          </div>
        </section>`
      })
    );
  });

  router.post('/settings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: requireString(ctx.body.name, 'Household name', 120),
        openingBalancePence: parsePoundsToPence(ctx.body.opening_balance || '0')
      });
      redirectWithSuccess(ctx.res, '/settings', 'Settings saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings', error);
    }
  });

  router.post('/settings/categories', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      createCategory(db, {
        name: requireString(ctx.body.name, 'Category name', 120),
        kind: 'expense'
      });
      redirectWithSuccess(ctx.res, '/settings', 'Category added.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings', error);
    }
  });
}
