import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMonthlyEquivalent, calculateSharedSplit, plannedMonthlySummary, actualMonthlySummary, varianceSummary } from '../services/budgetService.js';
import { plannedExpenseCategorySeries } from '../services/chartService.js';
import { buildMonthlyForecast } from '../services/forecastService.js';
import { buildSavingsProjection } from '../services/savingsAccountService.js';
import { plannedSavingsBudgetItems, savingsGoalMetrics, savingsGoalProgress } from '../services/savingsService.js';

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

test('planned savings prefer tracked account contributions over goal contributions', () => {
  const items = plannedSavingsBudgetItems({
    goals: [
      {
        id: 1,
        name: 'Emergency fund',
        status: 'active',
        tracking_mode: 'manual',
        owner_type: 'shared',
        monthly_contribution_pence: 20000
      }
    ],
    accounts: [
      {
        id: 7,
        name: 'Cash ISA',
        is_active: 1,
        owner_type: 'person_a',
        monthly_contribution_pence: 15000
      }
    ]
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].name, 'Cash ISA');
  assert.equal(items[0].monthly_equivalent_pence, 15000);
  assert.equal(items[1].name, 'Emergency fund');
  assert.equal(items[1].monthly_equivalent_pence, 20000);
});

test('linked-pot savings goals derive balances, additions, and projected shortfall from linked pots', () => {
  const linkedAccounts = [
    {
      id: 1,
      name: 'Workplace pension',
      account_type: 'pension',
      owner_type: 'person_a',
      current_balance_pence: 2_000_000,
      monthly_contribution_pence: 50_000,
      employer_monthly_contribution_pence: 25_000,
      projected_annual_rate: 4,
      projected_rate_type: 'growth',
      include_lisa_bonus: 0,
      is_active: 1
    },
    {
      id: 2,
      name: 'Lifetime ISA',
      account_type: 'lifetime_isa',
      owner_type: 'person_a',
      current_balance_pence: 400_000,
      monthly_contribution_pence: 25_000,
      employer_monthly_contribution_pence: 0,
      projected_annual_rate: 4,
      projected_rate_type: 'growth',
      include_lisa_bonus: 1,
      is_active: 1
    }
  ];

  const metrics = savingsGoalMetrics(
    {
      tracking_mode: 'linked_pots',
      target_amount_pence: 5_000_000,
      target_date: '2027-05-31'
    },
    { linkedAccounts, startMonth: '2026-05' }
  );

  assert.equal(metrics.currentSavedPence, 2_400_000);
  assert.equal(metrics.monthlyPersonalContributionPence, 75_000);
  assert.equal(metrics.monthlyEmployerTopUpsPence > 25_000, true);
  assert.equal(metrics.projectedValueAtTargetDatePence > metrics.currentSavedPence, true);
  assert.equal(metrics.projectedShortfallSurplusPence < 0, true);
  assert.equal(metrics.statusLabel, 'Behind target');
});

test('manual savings goals keep manual contributions and ignore linked-pot top-ups', () => {
  const metrics = savingsGoalMetrics(
    {
      tracking_mode: 'manual',
      current_saved_amount_pence: 300_000,
      monthly_contribution_pence: 25_000,
      target_amount_pence: 500_000,
      target_date: '2026-09-30'
    },
    {
      linkedAccounts: [
        {
          id: 9,
          name: 'Ignored pension',
          account_type: 'pension',
          current_balance_pence: 9_999_999,
          monthly_contribution_pence: 99_999,
          employer_monthly_contribution_pence: 99_999,
          is_active: 1
        }
      ],
      startMonth: '2026-05'
    }
  );

  assert.equal(metrics.currentSavedPence, 300_000);
  assert.equal(metrics.monthlyPersonalContributionPence, 25_000);
  assert.equal(metrics.monthlyEmployerTopUpsPence, 0);
  assert.equal(metrics.projectedValueAtTargetDatePence, 425_000);
  assert.equal(metrics.statusLabel, 'Behind target');
});

test('linked-pot savings goals report missing linked pots clearly', () => {
  const metrics = savingsGoalMetrics(
    {
      tracking_mode: 'linked_pots',
      target_amount_pence: 500_000,
      target_date: '2027-05-31'
    },
    { linkedAccounts: [], startMonth: '2026-05' }
  );

  assert.equal(metrics.currentSavedPence, 0);
  assert.equal(metrics.monthlyAdditionsPence, 0);
  assert.equal(metrics.projectedValueAtTargetDatePence, null);
  assert.equal(metrics.statusLabel, 'No linked pots');
});

test('savings projection compounds balances with monthly contributions', () => {
  const projection = buildSavingsProjection(
    [
      {
        id: 1,
        name: 'Cash ISA',
        owner_type: 'person_a',
        account_type: 'cash_isa',
        projected_rate_type: 'interest',
        current_balance_pence: 100000,
        monthly_contribution_pence: 10000,
        projected_annual_rate: 12,
        is_active: 1
      }
    ],
    { startMonth: '2026-05', months: 2 }
  );

  assert.equal(projection.months.length, 2);
  assert.equal(projection.months[0].contributionPence, 10000);
  assert.equal(projection.months[0].closingBalancePence > 110000, true);
  assert.equal(projection.accounts[0].projectedBalancePence, projection.months[1].closingBalancePence);
});

test('savings projection separates personal pension contributions from employer top-ups', () => {
  const projection = buildSavingsProjection(
    [
      {
        id: 2,
        name: 'Workplace pension',
        owner_type: 'person_a',
        account_type: 'pension',
        projected_rate_type: 'growth',
        current_balance_pence: 0,
        monthly_contribution_pence: 10000,
        employer_monthly_contribution_pence: 5000,
        projected_annual_rate: 0,
        include_lisa_bonus: 0,
        is_active: 1
      }
    ],
    { startMonth: '2026-05', months: 2 }
  );

  assert.equal(projection.months[0].personalContributionPence, 10000);
  assert.equal(projection.months[0].employerContributionPence, 5000);
  assert.equal(projection.months[0].bonusPence, 0);
  assert.equal(projection.accounts[0].totalPersonalContributionPence, 20000);
  assert.equal(projection.accounts[0].totalEmployerContributionPence, 10000);
  assert.equal(projection.accounts[0].projectedBalancePence, 30000);
});

test('lifetime ISA bonus respects the annual allowance and resets for a new April planning month', () => {
  const projection = buildSavingsProjection(
    [
      {
        id: 3,
        name: 'Lifetime ISA',
        owner_type: 'person_a',
        account_type: 'lifetime_isa',
        projected_rate_type: 'growth',
        current_balance_pence: 0,
        monthly_contribution_pence: 200000,
        employer_monthly_contribution_pence: 0,
        projected_annual_rate: 0,
        include_lisa_bonus: 1,
        is_active: 1
      }
    ],
    { startMonth: '2026-01', months: 4 }
  );

  assert.deepEqual(
    projection.months.map((row) => row.bonusPence),
    [50000, 50000, 0, 50000]
  );
  assert.equal(projection.accounts[0].totalBonusPence, 150000);
  assert.equal(projection.accounts[0].projectedBalancePence, 950000);
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
