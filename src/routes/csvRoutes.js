import { listBudgetItems } from '../repositories/budgetItemRepository.js';
import { listCategoryBudgetDefaults } from '../repositories/categoryBudgetRepository.js';
import { findOrCreateCategory, listCategories } from '../repositories/categoryRepository.js';
import { createImportBatch, addImportRows, findImportBatch, listImportRows, updateImportBatchStatus, updateImportRowStatus } from '../repositories/csvImportRepository.js';
import { listSavingsAccounts } from '../repositories/savingsAccountRepository.js';
import { createTransaction, listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { listSavingsGoalAccountLinks } from '../repositories/savingsGoalAccountRepository.js';
import { listHouseholdMembers } from '../repositories/userRepository.js';
import { actualMonthlySummary, plannedMonthlySummary, varianceSummary } from '../services/budgetService.js';
import { budgetItemsCsv, generateCsv, plannedSpendingCsv, savingsGoalsCsv, summaryCsv, transactionsCsv } from '../services/csvExportService.js';
import { buildCsvImportReview, parseCsv } from '../services/csvImportService.js';
import { plannedSavingsBudgetItems, savingsGoalMetrics } from '../services/savingsService.js';
import { buildUnifiedSpendingBudgetRows, plannedSpendingSummary } from '../services/spendingBudgetService.js';
import { currentMonth, monthRange } from '../utils/dates.js';
import { requireChoice, requireMoney, requireString } from '../utils/validation.js';
import { csrfField, escapeHtml, formatCurrency, ownerLabel, page, typeLabel } from '../views/html.js';
import { ownerOptions } from '../views/forms.js';
import { html, csv } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerCsvRoutes(router, db) {
  router.get('/csv', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    html(
      ctx.res,
      page(ctx, {
        title: 'Import/Export',
        wide: true,
        body: `<section class="page-title">
          <div>
            <h1>Import/Export</h1>
            <p class="page-context">Import actuals from a bank statement CSV, then review and categorise the transactions before saving them.</p>
          </div>
        </section>
        <section class="action-row">
          <button type="button" data-open-modal="csv-import-modal">Import bank statement</button>
          <dialog id="csv-import-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <h2>Import bank statement</h2>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              <form method="post" action="/csv/preview" enctype="multipart/form-data" class="stack">
                ${csrfField(ctx)}
                <label>CSV file <input type="file" name="csv_file" accept=".csv,text/csv" required></label>
                <p class="hint">Upload the CSV exported by your bank. You can map statement columns first, then review categories before anything is imported.</p>
                <button>Map statement</button>
              </form>
            </div>
          </dialog>
        </section>
        <section class="grid one">
          <div class="card">
            <h2>Export data</h2>
            <div class="button-list">
              <a class="button" href="/export?type=income">Budget Plan income</a>
              <a class="button" href="/export?type=expenses">Budget Plan costs</a>
              <a class="button" href="/export?type=transactions">Actual transactions</a>
              <a class="button" href="/export?type=monthly-summary">Monthly budget summary</a>
              <a class="button" href="/export?type=variance">Monthly variance report</a>
              <a class="button" href="/export?type=savings">Savings goals</a>
            </div>
          </div>
        </section>`
      })
    );
  });

  router.post('/csv/preview', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const upload = ctx.files.csv_file;
      if (!upload || !upload.content.trim()) throw new Error('Choose a CSV file to upload.');
      if (upload.content.length > 1_000_000) throw new Error('CSV file is too large. Maximum size is 1MB.');
      const parsed = parseCsv(upload.content);
      if (!parsed.headers.length) throw new Error('CSV file has no header row.');
      const batchId = createImportBatch(db, {
        householdId: ctx.user.household_id,
        originalFilename: upload.filename,
        createdBy: ctx.user.id
      });
      addImportRows(db, batchId, parsed.rows);
      redirectWithSuccess(ctx.res, `/csv/preview?batch=${batchId}`, `${parsed.rows.length} rows parsed for review.`);
    } catch (error) {
      redirectWithError(ctx.res, '/csv', error);
    }
  }, { fileField: 'csv_file' });

  router.get('/csv/preview', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const batchId = Number(ctx.query.get('batch'));
    const batch = findImportBatch(db, ctx.user.household_id, batchId);
    if (!batch) return redirectWithError(ctx.res, '/csv', 'Import batch was not found.');
    const rows = listImportRows(db, ctx.user.household_id, batch.id);
    const rawRows = rows.map((row) => JSON.parse(row.raw_json));
    const headers = Object.keys(rawRows[0] || {});
    const members = listHouseholdMembers(db, ctx.user.household_id);

    html(
      ctx.res,
      page(ctx, {
        title: 'Import/Export · Map statement',
        wide: true,
        body: `<section class="hero compact">
          <div>
            <h1>Map statement columns</h1>
            <p class="page-context">Match the bank statement columns once. You can review transaction categories and owners on the next step.</p>
          </div>
        </section>
        <section class="card">
          <form method="post" action="/csv/review" class="stack">
            ${csrfField(ctx)}
            <input type="hidden" name="batch_id" value="${batch.id}">
            <div class="mapping-grid">
              ${mappingSelect('date', 'Date', headers, { required: true, aliases: ['date', 'transaction date', 'posted date'] })}
              ${mappingSelect('description', 'Description', headers, { required: true, aliases: ['description', 'details', 'narrative', 'merchant'] })}
              ${mappingSelect('amount', 'Amount', headers, { aliases: ['amount', 'value', 'transaction amount'] })}
              ${mappingSelect('money_in', 'Money in', headers, { aliases: ['money in', 'credit', 'paid in', 'deposit'] })}
              ${mappingSelect('money_out', 'Money out', headers, { aliases: ['money out', 'debit', 'paid out', 'withdrawal'] })}
              ${mappingSelect('category', 'Category', headers, { optional: true, aliases: ['category', 'spend category', 'merchant category'] })}
              ${mappingSelect('owner', 'Owner', headers, { optional: true, aliases: ['owner', 'person', 'member'] })}
              ${mappingSelect('type', 'Type', headers, { optional: true, aliases: ['type', 'transaction type'] })}
              <label>Default owner
                <select name="default_owner_type" required>
                  ${ownerOptions('shared', members)}
                </select>
              </label>
            </div>
            <p class="hint">Use either a single signed Amount column, or separate Money in and Money out columns. Supported date formats: YYYY-MM-DD and DD/MM/YYYY.</p>
            <button>Review imported actuals</button>
          </form>
        </section>
        <section class="card">
          <h2>Statement preview</h2>
          ${previewTable(headers, rawRows.slice(0, 25))}
        </section>`
      })
    );
  });

  router.post('/csv/review', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const batchId = Number(ctx.body.batch_id);
      const batch = findImportBatch(db, ctx.user.household_id, batchId);
      if (!batch) throw new Error('Import batch was not found.');

      const rows = listImportRows(db, ctx.user.household_id, batch.id);
      const members = listHouseholdMembers(db, ctx.user.household_id);
      const categories = listCategories(db, ctx.user.household_id);
      const mapping = {
        date: requireString(ctx.body.map_date, 'Date column', 120),
        description: requireString(ctx.body.map_description, 'Description column', 120),
        amount: String(ctx.body.map_amount || ''),
        moneyIn: String(ctx.body.map_money_in || ''),
        moneyOut: String(ctx.body.map_money_out || ''),
        category: String(ctx.body.map_category || ''),
        owner: String(ctx.body.map_owner || ''),
        type: String(ctx.body.map_type || '')
      };

      if (!mapping.amount && !mapping.moneyIn && !mapping.moneyOut) {
        throw new Error('Choose either an Amount column or Money in / Money out columns.');
      }

      const reviewRows = buildCsvImportReview(
        db,
        ctx.user.household_id,
        rows,
        mapping,
        { defaultOwnerType: requireChoice(ctx.body.default_owner_type, ['person_a', 'person_b', 'shared'], 'Default owner') },
        members
      );

      const reviewStatuses = reviewRows.map((row) => reviewStatusMeta(row));
      const readyCount = reviewStatuses.filter((status) => status.key === 'ready').length;
      const duplicateCount = reviewStatuses.filter((status) => status.key === 'duplicate').length;
      const attentionCount = reviewStatuses.filter((status) => ['needs_category', 'needs_owner', 'invalid'].includes(status.key)).length;

      html(
        ctx.res,
        page(ctx, {
          title: 'Import/Export · Review actuals',
          wide: true,
          body: `<section class="hero compact">
            <div>
              <h1>Review imported actuals</h1>
              <p class="page-context">${readyCount} ready to import · ${duplicateCount} possible duplicates · ${attentionCount} need attention</p>
            </div>
          </section>
          <section class="grid four compact">
            <div class="stat"><span>Ready to import</span><strong>${readyCount}</strong></div>
            <div class="stat"><span>Possible duplicates</span><strong>${duplicateCount}</strong></div>
            <div class="stat"><span>Need attention</span><strong>${attentionCount}</strong></div>
            <div class="stat text-stat"><span>What happens next</span><strong>Only ready rows are saved</strong></div>
          </section>
          <section class="card">
            <form method="post" action="/csv/import" class="stack">
              ${csrfField(ctx)}
              <input type="hidden" name="batch_id" value="${batch.id}">
              ${reviewTable(reviewRows, categories, members)}
              <div class="button-list">
                <button>Import reviewed actuals</button>
                <a class="button secondary" href="/csv/preview?batch=${batch.id}">Back to mapping</a>
              </div>
            </form>
          </section>`
        })
      );
    } catch (error) {
      redirectWithError(ctx.res, `/csv/preview?batch=${Number(ctx.body.batch_id || 0) || ''}`.replace(/\?batch=$/, ''), error);
    }
  });

  router.post('/csv/import', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const batchId = Number(ctx.body.batch_id);
      const batch = findImportBatch(db, ctx.user.household_id, batchId);
      if (!batch) throw new Error('Import batch was not found.');

      const reviewRows = readReviewRows(ctx.body);
      let importedCount = 0;
      let errorCount = 0;

      for (const row of reviewRows) {
        if (row.status === 'duplicate') {
          updateImportRowStatus(db, ctx.user.household_id, row.id, 'duplicate', row.errorMessage || 'Possible duplicate: same date, amount, and description.');
          errorCount += 1;
          continue;
        }

        if (row.status === 'invalid') {
          updateImportRowStatus(db, ctx.user.household_id, row.id, 'invalid', row.errorMessage || 'Row needs attention before import.');
          errorCount += 1;
          continue;
        }

        const reviewStatus = reviewStatusMeta(row);
        if (reviewStatus.key !== 'ready') {
          updateImportRowStatus(db, ctx.user.household_id, row.id, 'invalid', reviewStatus.nextAction);
          errorCount += 1;
          continue;
        }

        try {
          const type = requireChoice(row.type, ['income', 'expense', 'savings'], 'Type');
          const category = findOrCreateCategory(
            db,
            requireString(row.categoryName, 'Category', 120),
            type === 'income' ? 'income' : type === 'savings' ? 'savings' : 'expense',
            ctx.user.household_id
          );
          const transaction = createTransaction(db, {
            householdId: ctx.user.household_id,
            transactionDate: requireString(row.transactionDate, 'Date', 10),
            description: requireString(row.description, 'Description', 255),
            amountPence: requireMoney(row.amount, 'Amount'),
            type,
            categoryId: category?.id || null,
            ownerType: requireChoice(row.ownerType, ['person_a', 'person_b', 'shared'], 'Owner'),
            source: 'csv_import',
            notes: `CSV import batch ${batch.id}`,
            csvImportBatchId: batch.id,
            createdBy: ctx.user.id
          });
          updateImportRowStatus(db, ctx.user.household_id, row.id, 'imported', null, transaction.id);
          importedCount += 1;
        } catch (error) {
          updateImportRowStatus(db, ctx.user.household_id, row.id, 'invalid', error.message);
          errorCount += 1;
        }
      }

      updateImportBatchStatus(db, ctx.user.household_id, batch.id, 'imported', { errorCount, importedCount });
      redirectWithSuccess(ctx.res, '/transactions', `${importedCount} transactions imported. ${errorCount} rows skipped.`);
    } catch (error) {
      redirectWithError(ctx.res, '/csv', error);
    }
  });

  router.get('/export', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const type = ctx.query.get('type') || 'transactions';
    const householdId = ctx.user.household_id;
    const month = currentMonth();
    const range = monthRange(month);

    if (type === 'income') {
      return csv(ctx.res, 'income-items.csv', budgetItemsCsv(listBudgetItems(db, householdId, 'income')));
    }
    if (type === 'expenses') {
      const members = listHouseholdMembers(db, householdId);
      const month = currentMonth();
      const rows = buildUnifiedSpendingBudgetRows({
        expenseItems: listBudgetItems(db, householdId, 'expense'),
        defaultBudgets: listCategoryBudgetDefaults(db, householdId),
        monthBudgets: [],
        transactions: [],
        month
      }).rows.map((row) => ({
        ...row,
        typeLabel: row.rowType === 'committed_cost' ? 'Regular' : 'Variable estimate',
        ownerLabel: exportOwnerLabel(row, members),
        frequencyLabel: exportSpendingFrequencyLabel(row)
      }));
      return csv(ctx.res, 'planned-spending.csv', plannedSpendingCsv(rows));
    }
    if (type === 'transactions') {
      return csv(ctx.res, 'transactions.csv', transactionsCsv(listTransactions(db, householdId)));
    }
    if (type === 'savings') {
      const accounts = listSavingsAccounts(db, householdId);
      const goalLinks = listSavingsGoalAccountLinks(db, householdId);
      const accountsById = new Map(accounts.map((account) => [String(account.id), account]));
      const linkedAccountsByGoalId = new Map();
      for (const row of goalLinks) {
        const current = linkedAccountsByGoalId.get(String(row.goal_id)) || [];
        const account = accountsById.get(String(row.savings_account_id));
        if (account) current.push(account);
        linkedAccountsByGoalId.set(String(row.goal_id), current);
      }
      const goals = listSavingsGoals(db, householdId).map((goal) => {
        const linkedAccounts = linkedAccountsByGoalId.get(String(goal.id)) || [];
        return {
          ...goal,
          linkedAccounts,
          metrics: savingsGoalMetrics(goal, {
            linkedAccounts,
            startMonth: currentMonth()
          })
        };
      });
      return csv(ctx.res, 'savings-goals.csv', savingsGoalsCsv(goals));
    }
    if (type === 'monthly-summary') {
      const budgetItems = listBudgetItems(db, householdId);
      const savingsAccounts = listSavingsAccounts(db, householdId, { activeOnly: true });
      const goals = listSavingsGoals(db, householdId);
      const items = [
        ...budgetItems,
        ...plannedSavingsBudgetItems({
          goals,
          accounts: savingsAccounts
        })
      ];
      const baseSummary = plannedMonthlySummary(items, month);
      const spendingSummary = plannedSpendingSummary({
        expenseItems: budgetItems.filter((item) => item.item_type === 'expense'),
        defaultBudgets: listCategoryBudgetDefaults(db, householdId),
        monthBudgets: [],
        month
      });
      return csv(ctx.res, 'monthly-budget-summary.csv', summaryCsv({
        ...baseSummary,
        plannedExpensePence: spendingSummary.totalPlannedSpendingPence,
        plannedSurplusPence: baseSummary.plannedIncomePence - spendingSummary.totalPlannedSpendingPence - baseSummary.plannedSavingsPence
      }));
    }
    if (type === 'variance') {
      const budgetItems = listBudgetItems(db, householdId);
      const savingsAccounts = listSavingsAccounts(db, householdId, { activeOnly: true });
      const goals = listSavingsGoals(db, householdId);
      const items = [
        ...budgetItems,
        ...plannedSavingsBudgetItems({
          goals,
          accounts: savingsAccounts
        })
      ];
      const basePlanned = plannedMonthlySummary(items, month);
      const spendingSummary = plannedSpendingSummary({
        expenseItems: budgetItems.filter((item) => item.item_type === 'expense'),
        defaultBudgets: listCategoryBudgetDefaults(db, householdId),
        monthBudgets: [],
        month
      });
      const planned = {
        ...basePlanned,
        plannedExpensePence: spendingSummary.totalPlannedSpendingPence,
        plannedSurplusPence: basePlanned.plannedIncomePence - spendingSummary.totalPlannedSpendingPence - basePlanned.plannedSavingsPence
      };
      const actual = actualMonthlySummary(listTransactions(db, householdId, { startDate: range.start, endDate: range.end }));
      const variance = varianceSummary(planned, actual);
      return csv(
        ctx.res,
        'monthly-variance-report.csv',
        generateCsv(
          ['Metric', 'Variance'],
          [
            { Metric: 'Income variance', Variance: variance.incomeVariancePence / 100 },
            { Metric: 'Expense variance', Variance: variance.expenseVariancePence / 100 },
            { Metric: 'Savings variance', Variance: variance.savingsVariancePence / 100 },
            { Metric: 'Surplus variance', Variance: variance.surplusVariancePence / 100 }
          ]
        )
      );
    }

    return redirectWithError(ctx.res, '/csv', 'Unknown export type.');
  });
}

function exportOwnerLabel(row, members) {
  if (row.ownerType !== 'shared') return ownerLabel(row.ownerType, members);
  if (row.splitType === 'manual_percentage') {
    return `Shared household (${Number(row.personAPercentage || 50)}% / ${Number(row.personBPercentage || 50)}%)`;
  }
  return 'Shared household';
}

function exportSpendingFrequencyLabel(row) {
  if (row.rowType === 'committed_cost') {
    if (row.frequency === 'yearly') return `${formatCurrency(row.sourceAmountPence)}/year`;
    return `${formatCurrency(row.sourceAmountPence)}/month`;
  }
  return 'Monthly estimate';
}

function mappingSelect(key, label, headers, { required = false, optional = false, aliases = [] } = {}) {
  const selectName = key === 'money_in' ? 'map_money_in' : key === 'money_out' ? 'map_money_out' : `map_${key}`;
  const bestMatch = findBestHeader(headers, aliases.length ? aliases : [label]);
  const options = [
    optional || !required ? '<option value="">Not in this file</option>' : '',
    ...headers.map((header) => `<option value="${escapeHtml(header)}" ${header === bestMatch ? 'selected' : ''}>${escapeHtml(header)}</option>`)
  ].join('');

  return `<label>${label}
    <select name="${selectName}" ${required ? 'required' : ''}>
      ${options}
    </select>
  </label>`;
}

function previewTable(headers, rows) {
  if (!rows.length) return '<p class="empty">No rows found.</p>';
  return `<table class="data-table">
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`;
}

function reviewTable(rows, categories, members) {
  if (!rows.length) return '<p class="empty">No rows found.</p>';

  return `<table class="data-table import-review-table">
    <thead>
      <tr>
        <th>Row</th>
        <th>Date</th>
        <th>Description</th>
        <th>Amount</th>
        <th>Type</th>
        <th>Category</th>
        <th>Owner</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${rows.map((row) => reviewRow(row, categories, members)).join('')}</tbody>
  </table>`;
}

function reviewRow(row, categories, members) {
  const disabled = row.status !== 'ready';
  const status = reviewStatusMeta(row);
  return `<tr data-transaction-category-group>
    <td>
      ${row.rowNumber}
      <input type="hidden" name="row_${row.id}_id" value="${row.id}">
      <input type="hidden" name="row_${row.id}_row_number" value="${row.rowNumber}">
      <input type="hidden" name="row_${row.id}_status" value="${escapeHtml(row.status)}">
      <input type="hidden" name="row_${row.id}_error_message" value="${escapeHtml(row.errorMessage || '')}">
      <input type="hidden" name="row_${row.id}_transaction_date" value="${escapeHtml(row.transactionDate)}">
      <input type="hidden" name="row_${row.id}_description" value="${escapeHtml(row.description)}">
      <input type="hidden" name="row_${row.id}_amount" value="${escapeHtml((Number(row.amountPence || 0) / 100).toFixed(2))}">
    </td>
    <td>${escapeHtml(row.transactionDate || '—')}</td>
    <td>${escapeHtml(row.description || '—')}</td>
    <td>${row.amountPence ? formatCurrency(row.amountPence) : '—'}</td>
    <td>
      <select name="row_${row.id}_type" ${disabled ? 'disabled' : ''} data-transaction-type-select>
        ${typeOptions(row.type)}
      </select>
    </td>
    <td>
      <select name="row_${row.id}_category_name" ${disabled ? 'disabled' : 'required'} ${status.key === 'needs_category' ? 'aria-invalid="true"' : ''} data-transaction-category-select>
        ${categoryNameOptions(categories, row.type, row.categoryName)}
      </select>
    </td>
    <td>
      <select name="row_${row.id}_owner_type" ${disabled ? 'disabled' : ''} ${status.key === 'needs_owner' ? 'aria-invalid="true"' : ''}>
        ${ownerOptions(row.ownerType || 'shared', members)}
      </select>
    </td>
    <td>${reviewStatus(row)}</td>
  </tr>`;
}

function reviewStatus(row) {
  const status = reviewStatusMeta(row);
  return `<span class="import-status ${escapeHtml(status.key)}">${escapeHtml(status.label)}</span><div class="hint inline-hint">${escapeHtml(status.nextAction)}</div>`;
}

function reviewStatusMeta(row) {
  if (row.status === 'duplicate') {
    return {
      key: 'duplicate',
      label: 'Possible duplicate',
      nextAction: row.errorMessage || 'A similar transaction already exists. Review before importing.'
    };
  }

  if (row.status === 'invalid') {
    return {
      key: 'invalid',
      label: 'Invalid',
      nextAction: row.errorMessage || 'This row cannot be imported until the highlighted issue is fixed.'
    };
  }

  if (!String(row.categoryName || '').trim()) {
    return {
      key: 'needs_category',
      label: 'Needs category',
      nextAction: 'Choose a category before importing this row.'
    };
  }

  if (!String(row.ownerType || '').trim()) {
    return {
      key: 'needs_owner',
      label: 'Needs owner',
      nextAction: 'Choose an owner before importing this row.'
    };
  }

  return {
    key: 'ready',
    label: 'Ready',
    nextAction: 'This row is valid and ready to import.'
  };
}

function typeOptions(selectedType) {
  return [
    ['expense', 'Spending'],
    ['income', 'Income'],
    ['savings', 'Savings']
  ]
    .map(([value, label]) => `<option value="${value}" ${value === selectedType ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function categoryNameOptions(categories, type, selectedCategoryName = '') {
  const allowedKinds = allowedCategoryKinds(type);
  const filtered = categories.filter((category) => allowedKinds.includes(category.kind));
  const options = ['<option value="">Choose a category</option>'];
  const hasSelected = filtered.some((category) => category.name === selectedCategoryName);

  if (selectedCategoryName && !hasSelected) {
    options.push(
      `<option value="${escapeHtml(selectedCategoryName)}" selected data-kind="${escapeHtml(allowedKinds[0] || 'expense')}">${escapeHtml(selectedCategoryName)}</option>`
    );
  }

  for (const category of filtered) {
    options.push(
      `<option value="${escapeHtml(category.name)}" data-kind="${escapeHtml(category.kind)}" ${category.name === selectedCategoryName ? 'selected' : ''}>${escapeHtml(category.name)}</option>`
    );
  }

  return options.join('');
}

function allowedCategoryKinds(type) {
  if (type === 'income') return ['income'];
  if (type === 'savings') return ['savings'];
  return ['expense', 'debt'];
}

function readReviewRows(body) {
  const rows = new Map();

  for (const [key, value] of Object.entries(body)) {
    const match = key.match(/^row_(\d+)_(.+)$/);
    if (!match) continue;

    const [, rowId, field] = match;
    const row = rows.get(rowId) || { id: Number(rowId) };
    row[fieldToCamelCase(field)] = value;
    rows.set(rowId, row);
  }

  return [...rows.values()].sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
}

function fieldToCamelCase(field) {
  return field.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
}

function findBestHeader(headers, aliases) {
  const normalisedAliases = aliases.map(normalise);
  return headers.find((header) => normalisedAliases.includes(normalise(header))) || '';
}

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
