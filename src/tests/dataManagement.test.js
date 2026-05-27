import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/database.js';
import { deleteHouseholdAndUsers, resetHouseholdData } from '../repositories/dataManagementRepository.js';

test('reset household data keeps members and clears financial records', () => {
  const { db, tempDir } = createTestDatabase();
  seedHouseholdWithData(db, 1);

  resetHouseholdData(db, 1);

  assert.equal(count(db, 'households'), 1);
  assert.equal(count(db, 'users'), 1);
  assert.equal(count(db, 'budget_items'), 0);
  assert.equal(count(db, 'transactions'), 0);
  assert.equal(count(db, 'category_budgets'), 0);
  assert.equal(count(db, 'category_budget_defaults'), 0);
  assert.equal(count(db, 'savings_goals'), 0);
  assert.equal(count(db, 'savings_accounts'), 0);
  assert.equal(count(db, 'csv_import_batches'), 0);
  assert.equal(count(db, 'csv_import_rows'), 0);
  assert.equal(db.prepare('SELECT opening_balance_pence FROM households WHERE id = 1').get().opening_balance_pence, 0);
  assert.equal(db.prepare('SELECT skip_planned_savings FROM households WHERE id = 1').get().skip_planned_savings, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM categories WHERE name = 'One-off reset category'").get().count, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('delete household removes accounts, sessions and household data', () => {
  const { db, tempDir } = createTestDatabase();
  seedHouseholdWithData(db, 1);

  deleteHouseholdAndUsers(db, 1);

  assert.equal(count(db, 'households'), 0);
  assert.equal(count(db, 'users'), 0);
  assert.equal(count(db, 'sessions'), 0);
  assert.equal(count(db, 'budget_items'), 0);
  assert.equal(count(db, 'transactions'), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM categories WHERE name = 'One-off reset category'").get().count, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

function seedHouseholdWithData(db, householdId) {
  db.prepare('INSERT INTO households (id, name, invite_code, opening_balance_pence, skip_planned_savings) VALUES (?, ?, ?, ?, ?)').run(
    householdId,
    'Delete Test',
    `invite-${householdId}`,
    12345,
    1
  );
  db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, display_name, household_id, person_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(100 + householdId, `user-${householdId}@example.com`, 'hash', 'salt', 'User', householdId, 'person_a');
  db.prepare('INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
    `session-${householdId}`,
    100 + householdId,
    'csrf',
    '2099-01-01 00:00:00'
  );

  const categoryId = db.prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 0)').run('One-off reset category', 'expense').lastInsertRowid;
  db.prepare('INSERT INTO household_categories (household_id, category_id) VALUES (?, ?)').run(householdId, categoryId);
  db.prepare(
    `INSERT INTO budget_items (
      household_id, name, item_type, category_id, owner_type, amount_pence, frequency,
      monthly_equivalent_pence, start_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(householdId, 'Test bill', 'expense', categoryId, 'shared', 10000, 'monthly', 10000, '2026-01-01');
  db.prepare(
    `INSERT INTO transactions (
      household_id, transaction_date, description, amount_pence, type, category_id,
      owner_type, source, duplicate_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(householdId, '2026-05-01', 'Test transaction', 5000, 'expense', categoryId, 'shared', 'manual', `dup-${householdId}`);
  db.prepare('INSERT INTO category_budgets (household_id, category_id, budget_month, amount_pence) VALUES (?, ?, ?, ?)').run(
    householdId,
    categoryId,
    '2026-05',
    5000
  );
  db.prepare('INSERT INTO category_budget_defaults (household_id, category_id, amount_pence) VALUES (?, ?, ?)').run(householdId, categoryId, 5000);

  const goalId = db.prepare(
    'INSERT INTO savings_goals (household_id, name, target_amount_pence, current_saved_amount_pence, monthly_contribution_pence, owner_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(householdId, 'Goal', 100000, 1000, 1000, 'shared').lastInsertRowid;
  const accountId = db.prepare(
    'INSERT INTO savings_accounts (household_id, name, account_type, owner_type) VALUES (?, ?, ?, ?)'
  ).run(householdId, 'Pot', 'easy_access_savings', 'shared').lastInsertRowid;
  db.prepare('INSERT INTO savings_goal_accounts (goal_id, savings_account_id) VALUES (?, ?)').run(goalId, accountId);

  const batchId = db.prepare('INSERT INTO csv_import_batches (household_id, original_filename, created_by) VALUES (?, ?, ?)').run(
    householdId,
    'statement.csv',
    100 + householdId
  ).lastInsertRowid;
  db.prepare('INSERT INTO csv_import_rows (batch_id, row_number, raw_json) VALUES (?, ?, ?)').run(batchId, 2, '{}');
}

function count(db, table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function createTestDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-data-management-test-'));
  const db = new DatabaseSync(path.join(tempDir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  runMigrations(db);
  return { db, tempDir };
}
