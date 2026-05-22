import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMonthlyEquivalent, calculateSharedSplit, plannedMonthlySummary, actualMonthlySummary, varianceSummary } from '../services/budgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { buildMonthlyForecast } from '../services/forecastService.js';
import { savingsGoalProgress } from '../services/savingsService.js';

test('monthly equivalent keeps monthly amounts and spreads yearly amounts', () => {
  assert.equal(calculateMonthlyEquivalent(120000, 'yearly'), 10000);
  assert.equal(calculateMonthlyEquivalent(40000, 'monthly'), 40000);
});

test('shared split supports equal and manual percentage splits', () => {
  assert.deepEqual(calculateSharedSplit(150000, { owner_type: 'shared', split_type: 'equal' }), {
    personA: 75000,
    personB: 75000
  });
  assert.deepEqual(
    calculateSharedSplit(40000, {
      owner_type: 'shared',
      split_type: 'manual_percentage',
      person_a_percentage: 60,
      person_b_percentage: 40
    }),
    { personA: 24000, personB: 16000 }
  );
});

test('planned, actual and variance summaries are calculated at monthly level', () => {
  const items = [
    item('Salary', 'income', 250000),
    item('Rent', 'expense', 120000),
    item('Emergency fund', 'savings', 20000)
  ];
  const transactions = [
    transaction('Salary', 'income', 250000),
    transaction('Groceries', 'expense', 46500),
    transaction('Rent', 'expense', 120000),
    transaction('Emergency fund', 'savings', 20000)
  ];
  const planned = plannedMonthlySummary(items, '2026-05');
  const actual = actualMonthlySummary(transactions);
  const variance = varianceSummary(planned, actual);

  assert.equal(planned.plannedSurplusPence, 110000);
  assert.equal(actual.actualExpensePence, 166500);
  assert.equal(variance.expenseVariancePence, 46500);
});

test('forecast rolls opening and closing balances month by month', () => {
  const rows = buildMonthlyForecast({
    items: [item('Salary', 'income', 300000), item('Rent', 'expense', 100000)],
    startMonth: '2026-05',
    months: 2,
    openingBalancePence: 50000
  });

  assert.equal(rows[0].closingBalancePence, 250000);
  assert.equal(rows[1].openingBalancePence, 250000);
  assert.equal(rows[1].closingBalancePence, 450000);
});

test('planned expense chart can aggregate across multiple months and honour shared splits', () => {
  const rows = plannedExpenseCategorySeries(
    [
      {
        ...item('Groceries', 'expense', 40000),
        category_name: 'Groceries',
        owner_type: 'shared',
        split_type: 'equal'
      },
      {
        ...item('Utilities', 'expense', 12000),
        category_name: 'Utilities',
        owner_type: 'person_a',
        split_type: 'equal'
      },
      {
        ...item('Old bill', 'expense', 10000),
        category_name: 'Old bill',
        owner_type: 'shared',
        split_type: 'equal',
        end_date: '2026-04-30'
      }
    ],
    { owner: 'person_a', months: ['2026-05', '2026-06'] }
  );

  assert.deepEqual(rows, [
    { label: 'Groceries', value: 40000 },
    { label: 'Utilities', value: 24000 }
  ]);
});

test('savings goal progress reports percentage and estimated completion', () => {
  const progress = savingsGoalProgress({
    target_amount_pence: 100000,
    current_saved_amount_pence: 25000,
    monthly_contribution_pence: 25000,
    target_date: '2026-12-31'
  }, '2026-05-19');

  assert.equal(progress.progressPercentage, 25);
  assert.equal(progress.remainingPence, 75000);
  assert.equal(progress.monthsRemaining, 3);
  assert.equal(progress.onTrack, true);
});

function item(name, itemType, amountPence) {
  return {
    name,
    item_type: itemType,
    category_name: name,
    owner_type: 'shared',
    amount_pence: amountPence,
    frequency: 'monthly',
    monthly_equivalent_pence: amountPence,
    start_date: '2026-01-01',
    end_date: null,
    is_active: 1
  };
}

function transaction(description, type, amountPence) {
  return {
    transaction_date: '2026-05-01',
    description,
    type,
    category_name: description,
    owner_type: 'shared',
    amount_pence: amountPence
  };
}
