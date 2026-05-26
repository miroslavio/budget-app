import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/database.js';
import { parseCsv, parseImportedDate, buildCsvImportReview } from '../services/csvImportService.js';
import { generateCsv } from '../services/csvExportService.js';

test('CSV parser handles quoted commas and headers', () => {
  const parsed = parseCsv('Date,Description,Amount\n2026-05-01,"Groceries, weekly",45.20\n');

  assert.deepEqual(parsed.headers, ['Date', 'Description', 'Amount']);
  assert.equal(parsed.rows[0].raw.Description, 'Groceries, weekly');
});

test('CSV export quotes cells when needed', () => {
  const output = generateCsv(['Description', 'Amount'], [{ Description: 'Groceries, weekly', Amount: '45.20' }]);

  assert.equal(output, 'Description,Amount\n"Groceries, weekly",45.20');
});

test('statement import accepts UK style dates', () => {
  assert.equal(parseImportedDate('26/05/2026'), '2026-05-26');
  assert.equal(parseImportedDate('2026-05-26'), '2026-05-26');
});

test('statement import review infers spending from money out and reuses past category', () => {
  const { db, tempDir } = createTestDatabase();

  db.prepare('INSERT INTO households (id, name, invite_code) VALUES (1, ?, ?)').run('Test household', 'invite-code-1234');
  const groceries = db.prepare("SELECT id FROM categories WHERE name = 'Groceries' AND kind = 'expense'").get();
  db.prepare(
    `INSERT INTO transactions (
      household_id, transaction_date, description, amount_pence, type, category_id,
      owner_type, source, notes, duplicate_key
    ) VALUES (1, '2026-05-01', 'TESCO STORES', 4520, 'expense', ?, 'shared', 'csv_import', NULL, 'dup-1')`
  ).run(groceries.id);

  const reviewRows = buildCsvImportReview(
    db,
    1,
    [{ id: 1, rowNumber: 2, raw: { Date: '26/05/2026', Description: 'TESCO STORES', Debit: '54.30', Credit: '' } }],
    { date: 'Date', description: 'Description', moneyIn: 'Credit', moneyOut: 'Debit', amount: '', category: '', owner: '', type: '' },
    { defaultOwnerType: 'shared' },
    []
  );

  assert.equal(reviewRows[0].status, 'ready');
  assert.equal(reviewRows[0].transactionDate, '2026-05-26');
  assert.equal(reviewRows[0].type, 'expense');
  assert.equal(reviewRows[0].categoryName, 'Groceries');
  assert.equal(reviewRows[0].amountPence, 5430);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createTestDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-csv-test-'));
  const db = new DatabaseSync(path.join(tempDir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  runMigrations(db);
  return { db, tempDir };
}
