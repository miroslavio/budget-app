import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../services/csvImportService.js';
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
