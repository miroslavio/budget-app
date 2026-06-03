import { findHouseholdById, updateHouseholdSettings } from '../repositories/householdRepository.js';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../repositories/categoryRepository.js';
import { resetHouseholdData, deleteHouseholdAndUsers } from '../repositories/dataManagementRepository.js';
import { deleteSession } from '../repositories/sessionRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { requireString } from '../utils/validation.js';
import { actionIconButton, csrfField, escapeHtml, page } from '../views/html.js';
import { clearSessionCookie } from '../middleware/session.js';
import { html, redirect } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerSettingsRoutes(router, db) {
  router.get('/settings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    redirect(ctx.res, '/settings/household');
  });

  router.get('/settings/household', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, household.id);
    html(
      ctx.res,
      page(ctx, {
        title: 'Settings · Household',
        wide: true,
        body: `${settingsPageIntro('household')}
        <section class="grid two">
          <div class="card">
            <h2>Household</h2>
            <form method="post" action="/settings/household" class="stack">
              ${csrfField(ctx)}
              <label>Household name <input name="name" value="${escapeHtml(household.name)}" maxlength="120" required></label>
              <p class="hint">Household invite code: <strong>${escapeHtml(household.invite_code)}</strong></p>
              <button>Save settings</button>
            </form>
          </div>
          <div class="card">
            <h2>Members</h2>
            <table class="data-table">
              <thead><tr><th>Name</th><th>Email</th></tr></thead>
              <tbody>${members
                .map((member) => `<tr><td>${escapeHtml(member.display_name)}</td><td>${escapeHtml(member.email)}</td></tr>`)
                .join('')}</tbody>
            </table>
          </div>
        </section>`
      })
    );
  });

  router.get('/settings/categories', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const categories = listCategories(db, ctx.user.household_id, 'expense');
    html(
      ctx.res,
      page(ctx, {
        title: 'Settings · Expense categories',
        wide: true,
        body: `${settingsPageIntro('categories')}
        <section class="card">
          <div class="card-heading">
            <div>
              <h2>Expense categories</h2>
            </div>
            <button type="button" data-open-modal="add-category-modal" data-reset-modal="true">Add category</button>
          </div>
          ${categories.length ? `<table class="data-table settings-categories-table">
            <thead><tr><th>Name</th><th class="actions-col">Actions</th></tr></thead>
            <tbody>${categories
              .map(
                (category) => `<tr>
                  <td>${escapeHtml(category.name)}</td>
                  <td class="actions-col">
                    <div class="inline-form category-actions">
                      ${actionIconButton({
                        label: 'Edit category',
                        icon: 'edit',
                        variant: 'edit',
                        attributes: `data-open-modal="edit-category-modal"
                        data-fill-id="${category.id}"
                        data-fill-name="${escapeHtml(category.name)}"`
                      })}
                      <form method="post" action="/settings/categories/delete" data-confirm="Delete this category? Existing items will keep their records but lose the category.">
                        ${csrfField(ctx)}
                        <input type="hidden" name="id" value="${category.id}">
                        ${actionIconButton({ label: 'Delete category', icon: 'delete', variant: 'delete', type: 'submit' })}
                      </form>
                    </div>
                  </td>
                </tr>`
              )
              .join('')}</tbody>
          </table>` : '<p class="empty">No custom categories yet. Add categories if you want extra labels beyond the standard household list.</p>'}
          <dialog id="add-category-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <h2>Add category</h2>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              <form method="post" action="/settings/categories" class="stack modal-form">
                ${csrfField(ctx)}
                <label>Category name <input name="name" maxlength="120" required></label>
                <div class="modal-footer">
                  <button>Add category</button>
                </div>
              </form>
            </div>
          </dialog>
          <dialog id="edit-category-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <h2>Edit category</h2>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              <form method="post" action="/settings/categories/update" class="stack modal-form">
                ${csrfField(ctx)}
                <input type="hidden" name="id" data-modal-field="id">
                <label>Category name <input name="name" data-modal-field="name" maxlength="120" required></label>
                <div class="modal-footer">
                  <button>Save category</button>
                </div>
              </form>
            </div>
          </dialog>
        </section>`
      })
    );
  });

  router.get('/settings/danger-zone', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const household = findHouseholdById(db, ctx.user.household_id);
    html(
      ctx.res,
      page(ctx, {
        title: 'Settings · Danger zone',
        wide: true,
        body: `${settingsPageIntro('danger-zone')}
        <section class="card danger-zone">
          <h2>Danger zone</h2>
          <div class="grid two compact">
            <form method="post" action="/settings/reset-data" class="stack" data-confirm="Reset all household financial data? This keeps member logins but removes budget items, actuals, imports, savings, categories, and forecast assumptions.">
              ${csrfField(ctx)}
              <div>
                <h3>Reset household data</h3>
                <p class="hint">Keeps the household and member logins, but clears Budget Plan, Actuals, imports, savings, custom categories, and the forecast adjustment.</p>
              </div>
              <label>Type RESET to confirm <input name="confirmation" autocomplete="off" required></label>
              <button class="danger-button">Reset data</button>
            </form>
            <form method="post" action="/settings/delete-household" class="stack" data-confirm="Delete this household and all member accounts? This cannot be undone.">
              ${csrfField(ctx)}
              <div>
                <h3>Delete household and accounts</h3>
                <p class="hint">Deletes the household, all member accounts, sessions, and all financial data. Use this when you want to register again as a first-time user.</p>
              </div>
              <label>Type ${escapeHtml(household.name)} to confirm <input name="confirmation" autocomplete="off" required></label>
              <button class="danger-button">Delete household</button>
            </form>
          </div>
        </section>`
      })
    );
  });

  router.post('/settings/household', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: requireString(ctx.body.name, 'Household name', 120),
        openingBalancePence: household.opening_balance_pence,
        forecastAdjustmentPence: household.forecast_adjustment_pence,
        skipPlannedSavings: household.skip_planned_savings
      });
      redirectWithSuccess(ctx.res, '/settings/household', 'Settings saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings/household', error);
    }
  });

  router.post('/settings/categories', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      createCategory(db, {
        householdId: ctx.user.household_id,
        name: requireString(ctx.body.name, 'Category name', 120),
        kind: 'expense'
      });
      redirectWithSuccess(ctx.res, '/settings/categories', 'Category added.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings/categories', error);
    }
  });

  router.post('/settings/categories/update', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      updateCategory(db, {
        householdId: ctx.user.household_id,
        id: Number(ctx.body.id),
        kind: 'expense',
        name: requireString(ctx.body.name, 'Category name', 120)
      });
      redirectWithSuccess(ctx.res, '/settings/categories', 'Category updated.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings/categories', error);
    }
  });

  router.post('/settings/categories/delete', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      deleteCategory(db, ctx.user.household_id, Number(ctx.body.id));
      redirectWithSuccess(ctx.res, '/settings/categories', 'Category deleted.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings/categories', error);
    }
  });

  router.post('/settings/reset-data', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      if (String(ctx.body.confirmation || '').trim() !== 'RESET') {
        throw new Error('Type RESET to confirm resetting household data.');
      }
      resetHouseholdData(db, ctx.user.household_id);
      redirectWithSuccess(ctx.res, '/dashboard', 'Household data reset. You can now set up a fresh budget.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings/danger-zone', error);
    }
  });

  router.post('/settings/delete-household', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      if (String(ctx.body.confirmation || '').trim() !== household.name) {
        throw new Error(`Type ${household.name} to confirm deleting this household.`);
      }
      const householdId = ctx.user.household_id;
      const sessionId = ctx.sessionId;
      deleteHouseholdAndUsers(db, householdId);
      if (sessionId) deleteSession(db, sessionId);
      clearSessionCookie(ctx.res, ctx.secure);
      redirectWithSuccess(ctx.res, '/register', 'Household deleted. Create a new account to start again.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings/danger-zone', error);
    }
  });
}

function settingsPageIntro(activeKey) {
  return `<section class="page-title">
    <div>
      <h1>Settings</h1>
    </div>
  </section>
  <nav class="period-pills section-nav" aria-label="Settings sections">
    ${settingsSectionLink('/settings/household', 'Household & members', activeKey === 'household')}
    ${settingsSectionLink('/settings/categories', 'Expense categories', activeKey === 'categories')}
    ${settingsSectionLink('/settings/danger-zone', 'Danger zone', activeKey === 'danger-zone')}
  </nav>`;
}

function settingsSectionLink(href, label, active = false) {
  return `<a class="period-pill${active ? ' active' : ''}" ${active ? 'aria-current="page"' : ''} href="${href}">${escapeHtml(label)}</a>`;
}
