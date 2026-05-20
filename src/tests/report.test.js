import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriodReport, reportingMonths, reportingRange } from '../services/reportService.js';
import { taxYearForDate, taxYearRange } from '../services/taxYearService.js';

test('UK tax year boundaries are 6 April to 5 April', () => {
  assert.equal(taxYearForDate('2026-04-05'), '2025-2026');
  assert.equal(taxYearForDate('2026-04-06'), '2026-2027');
  assert.deepEqual(taxYearRange('2026-2027'), {
    start: '2026-04-06',
    end: '2027-04-05'
  });
});

test('reporting months use a 12-month planning approximation for UK tax years', () => {
  assert.deepEqual(reportingMonths(reportingRange({ taxYear: '2026-2027' })), [
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
    '2027-03'
  ]);
});

test('period report sums planned monthly equivalents for every reporting month', () => {
  const range = reportingRange({ calendarYear: '2026' });
  const report = buildPeriodReport({
    items: [
      item('Salary', 'income', 300000),
      item('Rent', 'expense', 120000),
      item('Emergency fund', 'savings', 20000)
    ],
    transactions: [
      transaction('2026-01-31', 'Salary', 'income', 300000),
      transaction('2026-12-31', 'Salary', 'income', 300000),
      transaction('2027-01-01', 'Ignored salary', 'income', 300000),
      transaction('2026-06-01', 'Rent', 'expense', 120000)
    ],
    range
  });

  assert.equal(report.planned.plannedIncomePence, 3600000);
  assert.equal(report.planned.plannedExpensePence, 1440000);
  assert.equal(report.planned.plannedSavingsPence, 240000);
  assert.equal(report.actual.actualIncomePence, 600000);
  assert.equal(report.actual.actualExpensePence, 120000);
  assert.equal(report.variance.incomeVariancePence, -3000000);
});

function item(name, itemType, monthlyEquivalentPence) {
  return {
    name,
    item_type: itemType,
    category_name: name,
    owner_type: 'shared',
    amount_pence: monthlyEquivalentPence,
    frequency: 'monthly',
    monthly_equivalent_pence: monthlyEquivalentPence,
    start_date: '2026-01-01',
    end_date: null,
    is_active: 1
  };
}

function transaction(transactionDate, description, type, amountPence) {
  return {
    transaction_date: transactionDate,
    description,
    type,
    category_name: description,
    owner_type: 'shared',
    amount_pence: amountPence
  };
}
