import { findOrCreateCategory, listCategories } from '../repositories/categoryRepository.js';
import { createTransaction, listTransactions } from '../repositories/transactionRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { parsePoundsToPence } from '../utils/money.js';
import { currentMonth, monthLabel, monthRange, todayIso } from '../utils/dates.js';
import { optionalString, requireChoice, requireString } from '../utils/validation.js';
import { csrfField, escapeHtml, formatCurrency, ownerLabel, page, typeLabel } from '../views/html.js';
import { ownerOptions } from '../views/forms.js';
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
        title: 'Transactions',
        wide: true,
        body: `<section class="page-title">
          <div>
            <p class="eyebrow">Actual tracking</p>
            <h1>Transactions</h1>
            <p>Manual actual income, expenses, and savings contributions.</p>
          </div>
          <form method="get" action="/transactions" class="inline-form">
            <label>Month <input type="month" name="month" value="${month}"></label>
            <button>View</button>
          </form>
        </section>
        <section class="action-row">
          <button type="button" data-open-modal="transaction-modal">Add transaction</button>
          <dialog id="transaction-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <p class="eyebrow">New actual transaction</p>
                  <h2>Add transaction</h2>
                  <p class="hint">Record money that actually moved. Use planned budget items for recurring expectations.</p>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              ${transactionForm(ctx, categories, members)}
            </div>
          </dialog>
        </section>
        <section class="grid one">
          <div class="card">
            <h2>${monthLabel(month)} transactions</h2>
            ${transactionsTable(transactions, members)}
          </div>
        </section>`
      })
    );
  });

  router.post('/transactions', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const type = requireChoice(ctx.body.type, ['income', 'expense', 'savings'], 'Type');
      const category = findOrCreateCategory(db, ctx.body.category_name, type === 'income' ? 'income' : type === 'savings' ? 'savings' : 'expense', ctx.user.household_id);
      const amountPence = parsePoundsToPence(ctx.body.amount);
      if (amountPence <= 0) throw new Error('Transaction amount must be greater than zero.');
      createTransaction(db, {
        householdId: ctx.user.household_id,
        transactionDate: requireString(ctx.body.transaction_date || todayIso(), 'Date', 10),
        description: requireString(ctx.body.description, 'Description', 255),
        amountPence,
        type,
        categoryId: category?.id || null,
        ownerType: requireChoice(ctx.body.owner_type, ['person_a', 'person_b', 'shared'], 'Owner'),
        source: 'manual',
        notes: optionalString(ctx.body.notes),
        createdBy: ctx.user.id
      });
      redirectWithSuccess(ctx.res, `/transactions?month=${String(ctx.body.transaction_date || todayIso()).slice(0, 7)}`, 'Transaction saved.');
    } catch (error) {
      redirectWithError(ctx.res, '/transactions', error);
    }
  });
}

function transactionForm(ctx, categories, members) {
  return `<form method="post" action="/transactions" class="stack">
    ${csrfField(ctx)}
    <section class="form-section">
      <h3>1. Transaction details</h3>
    <label>Date <input name="transaction_date" type="date" value="${todayIso()}" required></label>
    <label>Description <input name="description" maxlength="255" required></label>
    <label>Amount <input name="amount" inputmode="decimal" pattern="^\\d+(\\.\\d{1,2})?$" required></label>
    <label>Type
      <select name="type">
        <option value="expense">Expense</option>
        <option value="income">Income</option>
        <option value="savings">Savings</option>
      </select>
    </label>
    </section>
    <section class="form-section">
      <h3>2. Classification</h3>
    <label>Category
      <input name="category_name" list="category-list">
      <datalist id="category-list">
        ${categories.map((category) => `<option value="${escapeHtml(category.name)}"></option>`).join('')}
      </datalist>
    </label>
    <label>Owner <select name="owner_type">${ownerOptions('shared', members)}</select></label>
    <label>Notes <textarea name="notes" rows="3"></textarea></label>
    </section>
    <button>Save transaction</button>
  </form>`;
}

function transactionsTable(transactions, members) {
  if (!transactions.length) return '<p class="empty">No transactions for this month.</p>';
  return `<table>
    <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th>Owner</th><th>Amount</th></tr></thead>
    <tbody>${transactions
      .map(
        (transaction) => `<tr>
          <td>${transaction.transaction_date}</td>
          <td>${escapeHtml(transaction.description)}</td>
          <td>${typeLabel(transaction.type)}</td>
          <td>${escapeHtml(transaction.category_name || '')}</td>
          <td>${escapeHtml(ownerLabel(transaction.owner_type, members))}</td>
          <td>${formatCurrency(transaction.amount_pence)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
}
