import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBudgetItem, deleteBudgetItem, updateBudgetItem } from '../repositories/budgetItemRepository.js';
import { createIncomeEstimate } from '../repositories/incomeEstimateRepository.js';
import { createSavingsAccount, findSavingsAccountById, updateSavingsAccount } from '../repositories/savingsAccountRepository.js';
import { listSavingsGoalAccountLinks, replaceSavingsGoalAccountLinks } from '../repositories/savingsGoalAccountRepository.js';
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
    estimatedNetAnnualIncomePence: 4300000,
    linkedSavingsAccountId: null,
    employerPensionContributionType: 'none',
    employerPensionContributionValue: 0
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
    trackingMode: 'manual',
    goalType: 'general',
    ownerType: 'shared',
    status: 'active',
    notes: 'Build the emergency buffer'
  });

  const updated = updateSavingsGoal(db, {
    householdId,
    id: goal.id,
    name: 'Emergency fund top-up',
    targetAmountPence: 600000,
    currentSavedAmountPence: 150000,
    monthlyContributionPence: 30000,
    targetDate: '2028-03-31',
    trackingMode: 'linked_pots',
    goalType: 'retirement',
    ownerType: 'shared',
    status: 'paused',
    notes: 'Linked to pensions and ISAs'
  });

  assert.equal(updated.name, 'Emergency fund top-up');
  assert.equal(updated.status, 'paused');
  assert.equal(updated.tracking_mode, 'linked_pots');
  assert.equal(updated.goal_type, 'retirement');
  assert.equal(updated.notes, 'Linked to pensions and ISAs');

  deleteSavingsGoal(db, householdId, goal.id);
  assert.equal(findSavingsGoalById(db, householdId, goal.id), undefined);
});

test('savings goals can be linked to tracked pots', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);
  const goal = createSavingsGoal(db, {
    householdId,
    name: 'House deposit',
    targetAmountPence: 2_000_000,
    currentSavedAmountPence: 500_000,
    monthlyContributionPence: 50_000,
    targetDate: '2030-12-31',
    trackingMode: 'linked_pots',
    goalType: 'general',
    ownerType: 'shared',
    status: 'active',
    notes: null
  });
  const cashIsa = createSavingsAccount(db, {
    householdId,
    name: 'Cash ISA',
    providerName: 'Bank',
    accountType: 'cash_isa',
    ownerType: 'person_a',
    currentBalancePence: 250_000,
    monthlyContributionPence: 20_000,
    employerMonthlyContributionPence: 0,
    availableForHouseholdCashflow: true,
    accessType: 'penalty_withdrawal',
    accessDate: null,
    accessAge: null,
    accessNotes: null,
    projectedAnnualRate: 3.5,
    projectedRateType: 'interest',
    includeLisaBonus: false,
    isActive: true,
    notes: null
  });
  const lisa = createSavingsAccount(db, {
    householdId,
    name: 'Lifetime ISA',
    providerName: 'Provider',
    accountType: 'lifetime_isa',
    ownerType: 'person_a',
    currentBalancePence: 120_000,
    monthlyContributionPence: 15_000,
    employerMonthlyContributionPence: 0,
    availableForHouseholdCashflow: false,
    accessType: 'locked_until_age',
    accessDate: null,
    accessAge: 60,
    accessNotes: null,
    projectedAnnualRate: 4,
    projectedRateType: 'growth',
    includeLisaBonus: true,
    isActive: true,
    notes: null
  });

  replaceSavingsGoalAccountLinks(db, householdId, goal.id, [cashIsa.id, lisa.id]);

  const links = listSavingsGoalAccountLinks(db, householdId);
  assert.deepEqual(
    links.map((row) => row.savings_account_name),
    ['Cash ISA', 'Lifetime ISA']
  );

  deleteSavingsGoal(db, householdId, goal.id);
  assert.equal(listSavingsGoalAccountLinks(db, householdId).length, 0);
});

test('savings accounts persist cashflow access settings', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db);

  const account = createSavingsAccount(db, {
    householdId,
    name: 'Lifetime ISA',
    providerName: 'Provider',
    accountType: 'lifetime_isa',
    ownerType: 'person_a',
    currentBalancePence: 250_000,
    monthlyContributionPence: 30_000,
    employerMonthlyContributionPence: 0,
    availableForHouseholdCashflow: false,
    accessType: 'locked_until_age',
    accessDate: null,
    accessAge: 60,
    accessNotes: 'Usually held for later life or property purchase',
    projectedAnnualRate: 6,
    projectedRateType: 'growth',
    includeLisaBonus: true,
    isActive: true,
    notes: 'Long-term savings'
  });

  assert.equal(account.available_for_household_cashflow, 0);
  assert.equal(account.access_type, 'locked_until_age');
  assert.equal(account.access_age, 60);
  assert.equal(account.access_notes, 'Usually held for later life or property purchase');

  updateSavingsAccount(db, {
    householdId,
    id: account.id,
    name: 'Lifetime ISA',
    providerName: 'Provider',
    accountType: 'lifetime_isa',
    ownerType: 'person_a',
    currentBalancePence: 250_000,
    monthlyContributionPence: 30_000,
    employerMonthlyContributionPence: 0,
    availableForHouseholdCashflow: true,
    accessType: 'penalty_withdrawal',
    accessDate: null,
    accessAge: null,
    accessNotes: 'Possible but penalised',
    projectedAnnualRate: 6,
    projectedRateType: 'growth',
    includeLisaBonus: true,
    isActive: true,
    notes: 'Long-term savings'
  });

  const updated = findSavingsAccountById(db, householdId, account.id);
  assert.equal(updated.available_for_household_cashflow, 1);
  assert.equal(updated.access_type, 'penalty_withdrawal');
  assert.equal(updated.access_age, null);
  assert.equal(updated.access_notes, 'Possible but penalised');
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
