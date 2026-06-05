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
  saveCategoryBudgetDefault,
  setCategoryBudgetDefaultActive
} from '../repositories/categoryBudgetRepository.js';
import { categoryBudgetComparison, effectiveCategoryBudgets, mergeCategoryExpenseTracking } from '../services/categoryBudgetService.js';
import { plannedSpendingSummary } from '../services/spendingBudgetService.js';

test('month override budgets can be saved, updated, listed, and deleted', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const categoryId = createCategory(db, 'Pet care');

  const created = saveCategoryBudget(db, {
    householdId,
    categoryId,
    name: 'Vet and food',
    budgetMonth: '2026-05',
    ownerType: 'person_a',
    amountPence: 40000,
    notes: 'Monthly grocery target'
  });

  assert.equal(created.amount_pence, 40000);
  assert.equal(created.name, 'Vet and food');
  assert.equal(created.owner_type, 'person_a');
  assert.equal(created.notes, 'Monthly grocery target');

  const updated = saveCategoryBudget(db, {
    id: created.id,
    householdId,
    categoryId,
    name: 'Pet supplies',
    budgetMonth: '2026-05',
    ownerType: 'shared',
    splitType: 'manual_percentage',
    personAPercentage: 60,
    personBPercentage: 40,
    amountPence: 45000,
    notes: 'Updated target'
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.name, 'Pet supplies');
  assert.equal(updated.owner_type, 'shared');
  assert.equal(updated.split_type, 'manual_percentage');
  assert.equal(updated.person_a_percentage, 60);
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
    name: 'Commuting',
    ownerType: 'person_b',
    amountPence: 12000,
    notes: 'Usual travel budget',
    isActive: true
  });

  assert.equal(created.amount_pence, 12000);
  assert.equal(created.name, 'Commuting');
  assert.equal(created.owner_type, 'person_b');

  const updated = saveCategoryBudgetDefault(db, {
    id: created.id,
    householdId,
    categoryId,
    name: 'Train and bus',
    ownerType: 'shared',
    splitType: 'manual_percentage',
    personAPercentage: 70,
    personBPercentage: 30,
    amountPence: 15000,
    notes: 'Updated travel budget',
    isActive: true
  });

  assert.equal(updated.id, created.id);
  assert.equal(updated.name, 'Train and bus');
  assert.equal(updated.owner_type, 'shared');
  assert.equal(updated.split_type, 'manual_percentage');
  assert.equal(updated.person_a_percentage, 70);
  assert.equal(updated.amount_pence, 15000);
  assert.equal(updated.is_active, 1);
  assert.equal(listCategoryBudgetDefaults(db, householdId).length, 1);

  const paused = setCategoryBudgetDefaultActive(db, householdId, created.id, false);
  assert.equal(paused.is_active, 0);

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
      name: 'Groceries',
      category_name: 'Groceries',
      budget_month: '2026-06',
      owner_type: 'shared',
      split_type: 'equal',
      person_a_percentage: 50,
      person_b_percentage: 50,
      amount_pence: 50000,
      is_active: 1,
      notes: 'June override',
      budget_scope: 'month_override'
    },
      {
        id: 2,
        category_id: 11,
        name: 'Transport',
        category_name: 'Transport',
        budget_month: '2026-06',
        owner_type: 'shared',
        split_type: 'equal',
        person_a_percentage: 50,
        person_b_percentage: 50,
        amount_pence: 10000,
        is_active: 1,
        notes: 'Default transport',
        budget_scope: 'default_monthly'
      }
    ]);
});

test('default category budgets can have multiple owners for the same category', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const categoryId = createCategory(db, 'Personal transport');

  const first = saveCategoryBudgetDefault(db, {
    householdId,
    categoryId,
    name: 'Bus tickets',
    ownerType: 'person_a',
    amountPence: 8000,
    isActive: true
  });
  const second = saveCategoryBudgetDefault(db, {
    householdId,
    categoryId,
    name: 'Train fares',
    ownerType: 'person_b',
    amountPence: 12000,
    isActive: true
  });

  assert.notEqual(first.id, second.id);
  const rows = listCategoryBudgetDefaults(db, householdId);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.owner_type).sort(), ['person_a', 'person_b']);
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

test('planned spending summary does not double-count overlapping flexible targets', () => {
  const summary = plannedSpendingSummary({
    expenseItems: [
      {
        item_type: 'expense',
        is_active: 1,
        category_id: 10,
        category_name: 'Groceries',
        monthly_equivalent_pence: 30000,
        start_date: '2026-01-01',
        end_date: null
      }
    ],
    defaultBudgets: [
      { id: 1, category_id: 10, category_name: 'Groceries', amount_pence: 30000, is_active: 1, notes: '' },
      { id: 2, category_id: 11, category_name: 'Transport', amount_pence: 12000, is_active: 1, notes: '' }
    ],
    monthBudgets: [],
    month: '2026-05'
  });

  assert.equal(summary.committedTotalPence, 30000);
  assert.equal(summary.flexibleTotalPence, 12000);
  assert.equal(summary.overlappingFlexibleTotalPence, 30000);
  assert.equal(summary.totalPlannedSpendingPence, 42000);
  assert.deepEqual(summary.overlaps.map((row) => row.category_name), ['Groceries']);
});

test('inactive default category budgets do not affect planned spending totals', () => {
  const summary = plannedSpendingSummary({
    expenseItems: [],
    defaultBudgets: [
      { id: 1, category_id: 10, category_name: 'Groceries', amount_pence: 30000, is_active: 0, notes: '' },
      { id: 2, category_id: 11, category_name: 'Transport', amount_pence: 12000, is_active: 1, notes: '' }
    ],
    monthBudgets: [],
    month: '2026-05'
  });

  assert.equal(summary.flexibleTotalPence, 12000);
  assert.equal(summary.totalPlannedSpendingPence, 12000);
  assert.deepEqual(summary.effectiveBudgets.map((row) => row.category_name), ['Transport']);
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
