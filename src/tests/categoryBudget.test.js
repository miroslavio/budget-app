import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/database.js';
import {
  deleteCategoryBudget,
  deleteCategoryBudgetDefault,
  listCategoryBudgetDefaults,
  listCategoryBudgets,
  saveCategoryBudget,
  saveCategoryBudgetDefault
} from '../repositories/categoryBudgetRepository.js';
import { categoryBudgetComparison, effectiveCategoryBudgets, mergeCategoryExpenseTracking } from '../services/categoryBudgetService.js';

test('month override budgets can be saved, updated, listed, and deleted', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const categoryId = createCategory(db, 'Pet care');

  const created = saveCategoryBudget(db, {
    householdId,
    categoryId,
    budgetMonth: '2026-05',
    amountPence: 40000,
    notes: 'Monthly grocery target'
  });

  assert.equal(created.amount_pence, 40000);
  assert.equal(created.notes, 'Monthly grocery target');

  const updated = saveCategoryBudget(db, {
    householdId,
    categoryId,
    budgetMonth: '2026-05',
    amountPence: 45000,
    notes: 'Updated target'
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.amount_pence, 45000);

  const budgets = listCategoryBudgets(db, householdId, { startMonth: '2026-05', endMonth: '2026-05' });
  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].category_name, 'Pet care');

  deleteCategoryBudget(db, householdId, created.id);
  assert.equal(listCategoryBudgets(db, householdId, { startMonth: '2026-05', endMonth: '2026-05' }).length, 0);
});

test('default category budgets can be saved, updated, listed, and deleted', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const categoryId = createCategory(db, 'Travel');

  const created = saveCategoryBudgetDefault(db, {
    householdId,
    categoryId,
    amountPence: 12000,
    notes: 'Usual travel budget'
  });

  assert.equal(created.amount_pence, 12000);

  const updated = saveCategoryBudgetDefault(db, {
    householdId,
    categoryId,
    amountPence: 15000,
    notes: 'Updated travel budget'
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.amount_pence, 15000);
  assert.equal(listCategoryBudgetDefaults(db, householdId).length, 1);

  deleteCategoryBudgetDefault(db, householdId, created.id);
  assert.equal(listCategoryBudgetDefaults(db, householdId).length, 0);
});

test('effective budgets use defaults until a month override replaces them', () => {
  const effectiveRows = effectiveCategoryBudgets(
    [
      { id: 1, category_id: 10, category_name: 'Groceries', amount_pence: 40000, notes: 'Default groceries' },
      { id: 2, category_id: 11, category_name: 'Transport', amount_pence: 10000, notes: 'Default transport' }
    ],
    [{ id: 3, category_id: 10, category_name: 'Groceries', budget_month: '2026-06', amount_pence: 50000, notes: 'June override' }],
    '2026-06'
  );

  assert.deepEqual(effectiveRows, [
    {
      id: 3,
      category_id: 10,
      category_name: 'Groceries',
      budget_month: '2026-06',
      amount_pence: 50000,
      notes: 'June override',
      budget_scope: 'month_override'
    },
    {
      id: 2,
      category_id: 11,
      category_name: 'Transport',
      budget_month: '2026-06',
      amount_pence: 10000,
      notes: 'Default transport',
      budget_scope: 'default_monthly'
    }
  ]);
});

test('category budget comparison and merged tracking include defaults, overrides, and actual expenses', () => {
  const budgetRows = categoryBudgetComparison(
    effectiveCategoryBudgets(
      [{ id: 1, category_id: 10, category_name: 'Groceries', amount_pence: 40000, notes: 'Food' }],
      [{ id: 2, category_id: 11, category_name: 'Transport', budget_month: '2026-05', amount_pence: 12000, notes: 'May transport' }],
      '2026-05'
    ),
    [
      { type: 'expense', category_id: 10, category_name: 'Groceries', amount_pence: 46500 },
      { type: 'expense', category_id: 11, category_name: 'Transport', amount_pence: 8000 }
    ]
  );

  assert.equal(budgetRows.length, 2);
  assert.deepEqual(
    budgetRows.find((row) => row.category === 'Groceries'),
    {
      categoryId: 10,
      category: 'Groceries',
      budgetId: 1,
      budgetScope: 'default_monthly',
      budgetMonth: '2026-05',
      notes: 'Food',
      budgetPence: 40000,
      actualExpensePence: 46500,
      variancePence: 6500
    }
  );

  assert.equal(budgetRows.find((row) => row.category === 'Transport').budgetScope, 'month_override');
  assert.equal(budgetRows.find((row) => row.category === 'Transport').budgetPence, 12000);

  const merged = mergeCategoryExpenseTracking(
    [
      { category: 'Groceries', plannedExpensePence: 0, actualExpensePence: 46500 },
      { category: 'Transport', plannedExpensePence: 0, actualExpensePence: 8000 }
    ],
    budgetRows
  );

  assert.equal(merged.find((row) => row.category === 'Groceries').budgetPence, 40000);
  assert.equal(merged.find((row) => row.category === 'Groceries').budgetVariancePence, 6500);
  assert.equal(merged.find((row) => row.category === 'Transport').budgetPence, 12000);
});

function openTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-category-budgets-'));
  const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  runMigrations(db);
  return db;
}

function createHousehold(db) {
  const result = db.prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)').run('Household', 'invite-code');
  return result.lastInsertRowid;
}

function createCategory(db, name) {
  const result = db.prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 0)').run(name, 'expense');
  return result.lastInsertRowid;
}
