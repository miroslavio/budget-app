import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBudgetItem, deleteBudgetItem, updateBudgetItem } from '../repositories/budgetItemRepository.js';
import { createIncomeEstimate } from '../repositories/incomeEstimateRepository.js';
import { createSavingsGoal, deleteSavingsGoal, findSavingsGoalById, updateSavingsGoal } from '../repositories/savingsGoalRepository.js';
import { createTransaction, deleteTransaction, findTransactionById, updateTransaction } from '../repositories/transactionRepository.js';

test('budget items can be updated and deleted with linked income estimates cleaned up', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const incomeCategoryId = createCategory(db, 'Salary', 'income');

  const estimate = createIncomeEstimate(db, {
    householdId,
    grossAnnualSalaryPence: 5000000,
    payFrequency: 'monthly',
    taxYear: '2026-2027',
    pensionContributionType: 'none',
    pensionContributionValue: 0,
    pensionContributionTaxTreatment: 'pre_tax',
    otherPreTaxDeductionsPence: 0,
    otherPostTaxDeductionsPence: 0,
    studentLoanPlans: [],
    hasPostgraduateLoan: false,
    estimatedIncomeTaxPence: 500000,
    estimatedNationalInsurancePence: 200000,
    estimatedStudentLoanRepaymentPence: 0,
    estimatedPostgraduateLoanRepaymentPence: 0,
    pensionContributionPence: 0,
    estimatedOtherDeductionsPence: 0,
    estimatedNetMonthlyIncomePence: 358333,
    estimatedNetAnnualIncomePence: 4300000
  });

  const item = createBudgetItem(db, {
    householdId,
    name: 'Salary',
    itemType: 'income',
    categoryId: incomeCategoryId,
    ownerType: 'person_a',
    amountPence: 358333,
    frequency: 'monthly',
    monthlyEquivalentPence: 358333,
    startDate: '2026-05-01',
    endDate: null,
    notes: null,
    isActive: true,
    splitType: 'equal',
    personAPercentage: 50,
    personBPercentage: 50,
    incomeEntryMode: 'estimated_from_gross',
    incomeEstimateId: estimate.id,
    createdBy: null
  });

  db.prepare('UPDATE income_estimates SET budget_item_id = ? WHERE id = ?').run(item.id, estimate.id);

  const updated = updateBudgetItem(db, {
    householdId,
    id: item.id,
    name: 'Main salary',
    itemType: 'income',
    categoryId: incomeCategoryId,
    ownerType: 'person_a',
    amountPence: 360000,
    frequency: 'monthly',
    monthlyEquivalentPence: 360000,
    startDate: '2026-05-01',
    endDate: null,
    notes: 'Updated',
    isActive: true,
    splitType: 'equal',
    personAPercentage: 50,
    personBPercentage: 50,
    incomeEntryMode: 'estimated_from_gross',
    incomeEstimateId: estimate.id
  });

  assert.equal(updated.name, 'Main salary');
  assert.equal(updated.amount_pence, 360000);

  deleteBudgetItem(db, householdId, item.id);
  assert.equal(db.prepare('SELECT id FROM budget_items WHERE id = ?').get(item.id), undefined);
  assert.equal(db.prepare('SELECT id FROM income_estimates WHERE id = ?').get(estimate.id), undefined);
});

test('transactions can be updated and deleted', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const expenseCategoryId = createCategory(db, 'Groceries', 'expense');

  const transaction = createTransaction(db, {
    householdId,
    transactionDate: '2026-05-20',
    description: 'Tesco',
    amountPence: 4500,
    type: 'expense',
    categoryId: expenseCategoryId,
    ownerType: 'shared',
    source: 'manual',
    notes: null
  });

  const updated = updateTransaction(db, {
    householdId,
    id: transaction.id,
    transactionDate: '2026-05-21',
    description: 'Tesco Extra',
    amountPence: 5000,
    type: 'expense',
    categoryId: expenseCategoryId,
    ownerType: 'shared',
    notes: 'Weekly shop'
  });

  assert.equal(updated.description, 'Tesco Extra');
  assert.equal(updated.amount_pence, 5000);

  deleteTransaction(db, householdId, transaction.id);
  assert.equal(findTransactionById(db, householdId, transaction.id), undefined);
});

test('savings goals can be updated and deleted', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);

  const goal = createSavingsGoal(db, {
    householdId,
    name: 'Emergency fund',
    targetAmountPence: 500000,
    currentSavedAmountPence: 100000,
    monthlyContributionPence: 25000,
    targetDate: '2027-12-31',
    ownerType: 'shared',
    status: 'active'
  });

  const updated = updateSavingsGoal(db, {
    householdId,
    id: goal.id,
    name: 'Emergency fund top-up',
    targetAmountPence: 600000,
    currentSavedAmountPence: 150000,
    monthlyContributionPence: 30000,
    targetDate: '2028-03-31',
    ownerType: 'shared',
    status: 'paused'
  });

  assert.equal(updated.name, 'Emergency fund top-up');
  assert.equal(updated.status, 'paused');

  deleteSavingsGoal(db, householdId, goal.id);
  assert.equal(findSavingsGoalById(db, householdId, goal.id), undefined);
});

function openTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-crud-'));
  const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  return db;
}

function createHousehold(db) {
  const result = db.prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)').run('Household', cryptoSafeId());
  return result.lastInsertRowid;
}

function createCategory(db, name, kind) {
  const result = db.prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 0)').run(name, kind);
  return result.lastInsertRowid;
}

function cryptoSafeId() {
  return `invite-${Math.random().toString(36).slice(2, 10)}`;
}
