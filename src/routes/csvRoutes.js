import { listBudgetItems } from '../repositories/budgetItemRepository.js';
import { findOrCreateCategory } from '../repositories/categoryRepository.js';
import { createImportBatch, addImportRows, findImportBatch, listImportRows, updateImportBatchStatus, updateImportRowStatus } from '../repositories/csvImportRepository.js';
import { createTransaction } from '../repositories/transactionRepository.js';
import { listTransactions } from '../repositories/transactionRepository.js';
import { listSavingsGoals } from '../repositories/savingsGoalRepository.js';
import { actualMonthlySummary, plannedMonthlySummary, varianceSummary } from '../services/budgetService.js';
import { budgetItemsCsv, generateCsv, savingsGoalsCsv, summaryCsv, transactionsCsv } from '../services/csvExportService.js';
import { parseCsv, validateCsvTransactionRow } from '../services/csvImportService.js';
import { savingsGoalsAsBudgetItems } from '../services/savingsService.js';
import { currentMonth, monthRange } from '../utils/dates.js';
import { csrfField, escapeHtml, page } from '../views/html.js';
import { html, csv } from '../http/response.js';
import { ensureAuthenticated, redirectWithError, redirectWithSuccess } from './helpers.js';

export function registerCsvRoutes(router, db) {
  router.get('/csv', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    html(
      ctx.res,
      page(ctx, {
        title: 'CSV import and export',
        wide: true,
        body: `<section class="page-title">
          <div>
            <p class="eyebrow">Manual import/export</p>
            <h1>CSV import and export</h1>
            <p>Upload transaction CSV files, preview rows, map columns, and export household data.</p>
          </div>
        </section>
        <section class="action-row">
          <button type="button" data-open-modal="csv-import-modal">Import transactions</button>
          <dialog id="csv-import-modal" class="modal" data-modal>
            <div class="modal-panel">
              <div class="modal-heading">
                <div>
                  <p class="eyebrow">CSV upload</p>
                  <h2>Import transactions</h2>
                  <p class="hint">Upload a CSV, then map the required columns before saving transactions.</p>
                </div>
                <button type="button" class="secondary icon-button" data-close-modal aria-label="Close">Close</button>
              </div>
              <form method="post" action="/csv/preview" enctype="multipart/form-data" class="stack">
                ${csrfField(ctx)}
                <label>CSV file <input type="file" name="csv_file" accept=".csv,text/csv" required></label>
                <p class="hint">Required values after mapping: Date, Description, Amount, Category, Owner, Type. Dates should use YYYY-MM-DD.</p>
                <button>Preview CSV</button>
              </form>
            </div>
          </dialog>
        </section>
        <section class="grid one">
          <div class="card">
            <h2>Export CSV</h2>
            <div class="button-list">
              <a class="button" href="/export?type=income">Income items</a>
              <a class="button" href="/export?type=expenses">Expense items</a>
              <a class="button" href="/export?type=transactions">Transactions</a>
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
      redirectWithSuccess(ctx.res, `/csv/preview?batch=${batchId}`, `${parsed.rows.length} rows parsed for preview.`);
    } catch (error) {
      redirectWithError(ctx.res, '/csv', error);
    }
  }, { fileField: 'csv_file' });

  router.get('/csv/preview', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    const batchId = Number(ctx.query.get('batch'));
    const batch = findImportBatch(db, ctx.user.household_id, batchId);
    if (!batch) return redirectWithError(ctx.res, '/csv', 'Import batch was not found.');
    const rows = listImportRows(db, batch.id);
    const rawRows = rows.map((row) => JSON.parse(row.raw_json));
    const headers = Object.keys(rawRows[0] || {});
    html(
      ctx.res,
      page(ctx, {
        title: 'Preview CSV',
        wide: true,
        body: `<section class="hero compact">
          <div>
            <p class="eyebrow">CSV preview</p>
            <h1>Preview and map columns</h1>
            <p>Review the first rows before saving valid rows as actual transactions.</p>
          </div>
        </section>
        <section class="card">
          <form method="post" action="/csv/import" class="stack">
            ${csrfField(ctx)}
            <input type="hidden" name="batch_id" value="${batch.id}">
            <div class="mapping-grid">
              ${mappingSelect('date', 'Date', headers)}
              ${mappingSelect('description', 'Description', headers)}
              ${mappingSelect('amount', 'Amount', headers)}
              ${mappingSelect('category', 'Category', headers)}
              ${mappingSelect('owner', 'Owner', headers)}
              ${mappingSelect('type', 'Type', headers)}
            </div>
            <button>Save valid rows</button>
          </form>
        </section>
        <section class="card">
          <h2>Parsed rows</h2>
          ${previewTable(headers, rawRows.slice(0, 25))}
        </section>`
      })
    );
  });

  router.post('/csv/import', (ctx) => {
    if (!ensureAuthenticated(ctx)) return;
    try {
      const batchId = Number(ctx.body.batch_id);
      const batch = findImportBatch(db, ctx.user.household_id, batchId);
      if (!batch) throw new Error('Import batch was not found.');
      const rows = listImportRows(db, batch.id);
      const mapping = {
        date: ctx.body.map_date,
        description: ctx.body.map_description,
        amount: ctx.body.map_amount,
        category: ctx.body.map_category,
        owner: ctx.body.map_owner,
        type: ctx.body.map_type
      };
      let importedCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        const raw = JSON.parse(row.raw_json);
        try {
          const validated = validateCsvTransactionRow(db, ctx.user.household_id, raw, mapping);
          if (validated.duplicate) {
            updateImportRowStatus(db, row.id, 'duplicate', 'Possible duplicate: same date, amount, and description.');
            errorCount += 1;
            continue;
          }
          const category = findOrCreateCategory(
            db,
            validated.categoryName,
            validated.type === 'income' ? 'income' : validated.type === 'savings' ? 'savings' : 'expense',
            ctx.user.household_id
          );
          const transaction = createTransaction(db, {
            householdId: ctx.user.household_id,
            transactionDate: validated.transactionDate,
            description: validated.description,
            amountPence: validated.amountPence,
            type: validated.type,
            categoryId: category?.id || null,
            ownerType: validated.ownerType,
            source: 'csv_import',
            notes: `CSV import batch ${batch.id}`,
            duplicateKey: validated.duplicateKey,
            csvImportBatchId: batch.id,
            createdBy: ctx.user.id
          });
          updateImportRowStatus(db, row.id, 'imported', null, transaction.id);
          importedCount += 1;
        } catch (error) {
          updateImportRowStatus(db, row.id, 'invalid', error.message);
          errorCount += 1;
        }
      }

      updateImportBatchStatus(db, batch.id, 'imported', { errorCount, importedCount });
      redirectWithSuccess(ctx.res, '/csv', `${importedCount} rows imported. ${errorCount} rows skipped.`);
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
      return csv(ctx.res, 'expense-items.csv', budgetItemsCsv(listBudgetItems(db, householdId, 'expense')));
    }
    if (type === 'transactions') {
      return csv(ctx.res, 'transactions.csv', transactionsCsv(listTransactions(db, householdId)));
    }
    if (type === 'savings') {
      return csv(ctx.res, 'savings-goals.csv', savingsGoalsCsv(listSavingsGoals(db, householdId)));
    }
    if (type === 'monthly-summary') {
      const items = [...listBudgetItems(db, householdId), ...savingsGoalsAsBudgetItems(listSavingsGoals(db, householdId))];
      return csv(ctx.res, 'monthly-budget-summary.csv', summaryCsv(plannedMonthlySummary(items, month)));
    }
    if (type === 'variance') {
      const items = [...listBudgetItems(db, householdId), ...savingsGoalsAsBudgetItems(listSavingsGoals(db, householdId))];
      const planned = plannedMonthlySummary(items, month);
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

function mappingSelect(key, label, headers) {
  return `<label>${label}
    <select name="map_${key}">
      ${headers
        .map((header) => `<option value="${escapeHtml(header)}" ${normalise(header) === normalise(label) ? 'selected' : ''}>${escapeHtml(header)}</option>`)
        .join('')}
    </select>
  </label>`;
}

function previewTable(headers, rows) {
  if (!rows.length) return '<p class="empty">No rows found.</p>';
  return `<table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`;
}

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
}
