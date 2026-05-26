import { findHouseholdById, updateHouseholdSettings } from '../repositories/householdRepository.js';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../repositories/categoryRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { requireString } from '../utils/validation.js';
import { actionIconButton, csrfField, escapeHtml, page } from '../views/html.js';
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
        wide: true,
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
            <p class="hint">Household invite code: <strong>${escapeHtml(household.invite_code)}</strong></p>
          </div>
        </section>
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
          </table>` : '<p class="empty">No categories yet.</p>'}
          <dialog id="add-category-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <h2>Add category</h2>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              <form method="post" action="/settings/categories" class="stack">
                ${csrfField(ctx)}
                <label>Category name <input name="name" maxlength="120" required></label>
                <button>Add category</button>
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
              <form method="post" action="/settings/categories/update" class="stack">
                ${csrfField(ctx)}
                <input type="hidden" name="id" data-modal-field="id">
                <label>Category name <input name="name" data-modal-field="name" maxlength="120" required></label>
                <button>Save category</button>
              </form>
            </div>
          </dialog>
        </section>`
      })
    );
  });

  router.post('/settings', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const household = findHouseholdById(db, ctx.user.household_id);
      updateHouseholdSettings(db, ctx.user.household_id, {
        name: requireString(ctx.body.name, 'Household name', 120),
        openingBalancePence: household.opening_balance_pence
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

  router.post('/settings/categories/update', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      updateCategory(db, {
        id: Number(ctx.body.id),
        kind: 'expense',
        name: requireString(ctx.body.name, 'Category name', 120)
      });
      redirectWithSuccess(ctx.res, '/settings', 'Category updated.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings', error);
    }
  });

  router.post('/settings/categories/delete', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      deleteCategory(db, Number(ctx.body.id));
      redirectWithSuccess(ctx.res, '/settings', 'Category deleted.');
    } catch (error) {
      redirectWithError(ctx.res, '/settings', error);
    }
  });
}
