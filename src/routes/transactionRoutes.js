import { findOrCreateCategory, listCategories } from '../repositories/categoryRepository.js';
import { createTransaction, deleteTransaction, findTransactionById, listTransactions, updateTransaction } from '../repositories/transactionRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { optionalString, requireChoice, requireMoney, requireString } from '../utils/validation.js';
import { actionIconButton, csrfField, escapeHtml, formatCurrency, ownerLabel, page, typeLabel } from '../views/html.js';
import { moneyInputAttrs, ownerOptions } from '../views/forms.js';
import { html } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerTransactionRoutes(router, db) {
  router.get('/transactions', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const month = ctx.query.get('month') || currentMonth();
    const range = monthRange(month);
    const transactions = listTransactions(db, ctx.user.household_id, { startDate: range.start, endDate: range.end });
    const categories = listCategories(db, ctx.user.household_id);
    const members = listHouseholdMembers(db, ctx.user.household_id);

    html(
      ctx.res,
      page(ctx, {
        title: 'Actuals',
        wide: true,
        body: `<section class="page-title">
          <div>
            <h1>Actuals</h1>
            <p class="page-context">Record actual income, spending, and savings movements.</p>
          </div>
          <form method="get" action="/transactions" class="inline-form" data-submit-on-change>
            <label>Month <input type="month" name="month" value="${month}"></label>
          </form>
        </section>
        <section class="action-row">
          <button type="button" data-open-modal="transaction-modal" data-reset-modal="true">Record transaction</button>
          <a class="button secondary" href="/csv">Import bank statement</a>
          <dialog id="transaction-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <h2>Record actual movement</h2>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              ${transactionForm(ctx, categories, members, month)}
            </div>
          </dialog>
        </section>
        <section class="grid one">
          <div class="card">
            <h2>${monthLabel(month)} transactions</h2>
            ${transactionsTable(ctx, transactions, members, month)}
          </div>
        </section>`
      })
    );
  });

  router.post('/transactions', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const transactionId = Number(ctx.body.id || 0) || null;
      if (transactionId && !findTransactionById(db, ctx.user.household_id, transactionId)) {
        throw new Error('Transaction was not found.');
      }
      const type = requireChoice(ctx.body.type, ['income', 'expense', 'savings'], 'Type');
      const category = findOrCreateCategory(db, ctx.body.category_name, type === 'income' ? 'income' : type === 'savings' ? 'savings' : 'expense', ctx.user.household_id);
      const amountPence = requireMoney(ctx.body.amount, 'Transaction amount');
      const payload = {
        householdId: ctx.user.household_id,
        id: transactionId,
        transactionDate: requireString(ctx.body.transaction_date || todayIso(), 'Date', 10),
        description: requireString(ctx.body.description, 'Description', 255),
        amountPence,
        type,
        categoryId: category?.id || null,
        ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
        source: 'manual',
        notes: optionalString(ctx.body.notes),
        createdBy: ctx.user.id
      };
      if (transactionId) {
        updateTransaction(db, payload);
      } else {
        createTransaction(db, payload);
      }
      redirectWithSuccess(
        ctx.res,
        ctx.body.return_to || `/transactions?month=${String(ctx.body.transaction_date || todayIso()).slice(0, 7)}`,
        transactionId ? 'Transaction updated.' : 'Transaction saved.'
      );
    } catch (error) {
      redirectWithError(ctx.res, ctx.body.return_to || '/transactions', error);
    }
  });

  router.post('/transactions/delete', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      deleteTransaction(db, ctx.user.household_id, Number(ctx.body.id));
      redirectWithSuccess(ctx.res, ctx.body.return_to || '/transactions', 'Transaction deleted.');
    } catch (error) {
      redirectWithError(ctx.res, ctx.body.return_to || '/transactions', error);
    }
  });
}

function transactionForm(ctx, categories, members, month) {
  return `<form method="post" action="/transactions" class="stack modal-form">
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="/transactions?month=${escapeHtml(month)}">
    <section class="form-section">
      <h3>Transaction details</h3>
    <label>Date <input name="transaction_date" type="date" value="${todayIso()}" required data-modal-field="transactionDate"></label>
    <label>Description <input name="description" maxlength="255" required data-modal-field="description"></label>
    <label>Amount <input name="amount" ${moneyInputAttrs({ required: true, min: '0.01' })} data-modal-field="amount"></label>
    <label>Type
      <select name="type" data-modal-field="type" data-transaction-type-select>
        <option value="expense">Spending</option>
        <option value="income">Income</option>
        <option value="savings">Savings</option>
      </select>
    </label>
    </section>
    <section class="form-section">
      <h3>Classification</h3>
    <label>Category
      <select name="category_name" data-modal-field="categoryName" data-transaction-category-select>
        <option value="">Choose a category</option>
        ${categories.map((category) => `<option value="${escapeHtml(category.name)}" data-kind="${escapeHtml(category.kind)}">${escapeHtml(category.name)}</option>`).join('')}
      </select>
    </label>
    <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
    <label>Notes <textarea name="notes" rows="3" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer">
      <button>Save transaction</button>
    </div>
  </form>`;
}

function transactionsTable(ctx, transactions, members, month) {
  if (!transactions.length) {
    return `<div class="empty-state compact">
      <h3>No actual transactions for this month</h3>
      <p>Add a transaction or import a bank statement to compare your plan with reality.</p>
      <div class="button-list">
        <button type="button" data-open-modal="transaction-modal" data-reset-modal="true">Record transaction</button>
        <a class="button secondary" href="/csv">Import bank statement</a>
      </div>
    </div>`;
  }
  return `<table class="data-table">
    <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th>Owner</th><th>Amount</th><th class="actions-col"></th></tr></thead>
    <tbody>${transactions
      .map(
        (transaction) => `<tr>
          <td>${transaction.transaction_date}</td>
          <td>${escapeHtml(transaction.description)}</td>
          <td>${typeLabel(transaction.type)}</td>
          <td>${escapeHtml(transaction.category_name || '')}</td>
          <td>${escapeHtml(ownerLabel(transaction.owner_type, members))}</td>
          <td>${formatCurrency(transaction.amount_pence)}</td>
          <td class="actions-col">
            <div class="table-actions">
              ${actionIconButton({
                label: 'Edit transaction',
                icon: 'edit',
                variant: 'edit',
                attributes: `data-open-modal="transaction-modal"
                data-reset-modal="true"
                data-fill-id="${escapeHtml(transaction.id)}"
                data-fill-transaction-date="${escapeHtml(transaction.transaction_date)}"
                data-fill-description="${escapeHtml(transaction.description)}"
                data-fill-amount="${escapeHtml((Number(transaction.amount_pence || 0) / 100).toFixed(2))}"
                data-fill-type="${escapeHtml(transaction.type)}"
                data-fill-category-name="${escapeHtml(transaction.category_name || '')}"
                data-fill-owner-type="${escapeHtml(transaction.owner_type)}"
                data-fill-notes="${escapeHtml(transaction.notes || '')}"`
              })}
              <form method="post" action="/transactions/delete" data-confirm="Delete this transaction?">
                ${csrfField(ctx)}
                <input type="hidden" name="id" value="${transaction.id}">
                <input type="hidden" name="return_to" value="/transactions?month=${escapeHtml(month)}">
                ${actionIconButton({ label: 'Delete transaction', icon: 'delete', variant: 'delete', type: 'submit' })}
              </form>
            </div>
          </td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}
