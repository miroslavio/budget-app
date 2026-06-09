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
          </div>
          ${actualsMonthControls(month)}
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

function actualsMonthControls(month) {
  const inputId = 'actuals-month-input';
  return `<form method="get" action="/transactions" class="budget-plan-month-form" data-submit-on-change>
    <input id="${inputId}" class="budget-plan-month-input" type="month" name="month" value="${escapeHtml(month)}" aria-label="Pick month">
  </form>
  <div class="budget-plan-month-controls" role="group" aria-label="Actuals month">
    <a class="period-pill budget-plan-month-step" href="/transactions?month=${encodeURIComponent(previousMonth(month))}" aria-label="Previous month">
      <span aria-hidden="true">&lsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-current-month-button" data-open-month-picker="${inputId}" aria-label="Pick month" title="Pick month">
      ${escapeHtml(monthLabel(month))}
    </button>
    <a class="period-pill budget-plan-month-step" href="/transactions?month=${encodeURIComponent(nextMonth(month))}" aria-label="Next month">
      <span aria-hidden="true">&rsaquo;</span>
    </a>
    <button type="button" class="period-pill budget-plan-month-step" data-open-month-picker="${inputId}" aria-label="Open month picker" title="Open month picker">
      ${calendarIcon()}
    </button>
  </div>`;
}

function previousMonth(month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, (monthNumber || 1) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber || 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function calendarIcon() {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
    <rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 3.8v3.4M16 3.8v3.4M4 9.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8.2 13h2.6M13.2 13h2.6M8.2 16.5h2.6M13.2 16.5h2.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function transactionForm(ctx, categories, members, month) {
  return `<form method="post" action="/transactions" class="stack modal-form" data-stepped-form>
    ${csrfField(ctx)}
    <input type="hidden" name="id" value="" data-modal-field="id">
    <input type="hidden" name="return_to" value="/transactions?month=${escapeHtml(month)}">
    <div class="modal-stepper">
      <div class="modal-stepper-meta">
        <span class="modal-stepper-count">Step <strong data-step-current>1</strong> of <span data-step-total>3</span></span>
        <strong class="modal-stepper-title" data-step-title>Transaction details</strong>
      </div>
      <div class="modal-stepper-track"><div class="modal-stepper-bar" data-step-progress-bar></div></div>
    </div>
    <section class="form-section" data-form-step data-step-title="Transaction details">
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
    <section class="form-section" data-form-step data-step-title="Classification">
      <h3>Classification</h3>
      <label>Category
        <select name="category_name" data-modal-field="categoryName" data-transaction-category-select>
          <option value="">Choose a category</option>
          ${categories.map((category) => `<option value="${escapeHtml(category.name)}" data-kind="${escapeHtml(category.kind)}">${escapeHtml(category.name)}</option>`).join('')}
        </select>
      </label>
      <label>Owner <select name="owner_type" data-modal-field="ownerType">${ownerOptions('shared', members)}</select></label>
    </section>
    <section class="form-section" data-form-step data-step-title="Notes">
      <h3>Notes</h3>
      <label>Notes <textarea name="notes" rows="5" data-modal-field="notes"></textarea></label>
    </section>
    <div class="modal-footer modal-footer-split">
      <div class="modal-footer-start">
        <button type="button" class="secondary" data-close-modal>Cancel</button>
      </div>
      <div class="modal-footer-actions">
        <button type="button" class="secondary" data-step-back hidden>Back</button>
        <button type="button" data-step-next data-hide-on-final-step>Next</button>
        <button data-show-on-final-step hidden>Save transaction</button>
      </div>
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
  const desktopTable = `<table class="data-table">
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
  const mobileCardsId = 'transactions-mobile-cards';
  return responsiveFinanceTable(desktopTable, `
    ${mobileSortControl(mobileCardsId, transactions.length, [
      ['date:desc', 'Date, newest first'],
      ['amount:desc', 'Amount, high to low'],
      ['description:asc', 'Description, A to Z'],
      ['category:asc', 'Category, A to Z'],
      ['owner:asc', 'Owner, A to Z']
    ])}
    <div id="${mobileCardsId}" class="mobile-finance-card-list">
      ${transactions.map((transaction) => transactionMobileCard(ctx, transaction, members, month)).join('')}
    </div>
  `);
}

function transactionMobileCard(ctx, transaction, members, month) {
  return `<article class="mobile-finance-card" data-mobile-sort-card
    data-sort-date="${escapeHtml(transaction.transaction_date)}"
    data-sort-description="${escapeHtml(String(transaction.description || '').toLowerCase())}"
    data-sort-category="${escapeHtml(String(transaction.category_name || '').toLowerCase())}"
    data-sort-owner="${escapeHtml(ownerLabel(transaction.owner_type, members).toLowerCase())}"
    data-sort-amount="${Number(transaction.amount_pence || 0)}">
    <div class="mobile-card-head">
      <div>
        <h3>${escapeHtml(transaction.description)}</h3>
        <p>${escapeHtml(transaction.transaction_date)} · ${typeLabel(transaction.type)}</p>
      </div>
      <span class="mobile-card-status">${escapeHtml(typeLabel(transaction.type))}</span>
    </div>
    <div class="mobile-card-amount">
      <strong>${formatCurrency(transaction.amount_pence)}</strong>
      <span>${escapeHtml(ownerLabel(transaction.owner_type, members))}</span>
    </div>
    <dl class="mobile-card-meta">
      <div><dt>Owner</dt><dd>${escapeHtml(ownerLabel(transaction.owner_type, members))}</dd></div>
      <div><dt>Category</dt><dd>${escapeHtml(transaction.category_name || 'Uncategorised')}</dd></div>
    </dl>
    <div class="mobile-card-actions">
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
    </div>
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
