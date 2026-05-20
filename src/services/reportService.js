import { addMonths, monthRange } from '../utils/dates.js';
import { taxYearRange } from './taxYearService.js';
import { actualMonthlySummary, plannedMonthlySummary, varianceSummary } from './budgetService.js';

export function reportingRange(filters) {
  if (filters.month) return { ...monthRange(filters.month), label: filters.month, periodType: 'month' };
  if (filters.calendarYear) {
    return {
      start: `${filters.calendarYear}-01-01`,
      end: `${filters.calendarYear}-12-31`,
      label: filters.calendarYear,
      periodType: 'calendar_year'
    };
  }
  if (filters.taxYear) {
    return {
      ...taxYearRange(filters.taxYear),
      label: `Tax year ${filters.taxYear.replace('-', ' to ')}`,
      periodType: 'tax_year'
    };
  }
  return { ...monthRange(filters.defaultMonth), label: filters.defaultMonth, periodType: 'month' };
}

export function buildMonthlyReport({ items, transactions, month }) {
  const planned = plannedMonthlySummary(items, month);
  const actual = actualMonthlySummary(transactions);
  return {
    planned,
    actual,
    variance: varianceSummary(planned, actual)
  };
}

export function buildPeriodReport({ items, transactions, range }) {
  const months = reportingMonths(range);
  const planned = aggregatePlannedSummaries(months.map((month) => plannedMonthlySummary(items, month)));
  const actual = actualMonthlySummary(filterTransactionsForRange(transactions, range));

  return {
    range,
    months,
    planned,
    actual,
    variance: varianceSummary(planned, actual)
  };
}

export function reportingMonths(range) {
  if (range.periodType === 'tax_year') {
    return buildMonths(range.start.slice(0, 7), 12);
  }

  const startMonth = range.start.slice(0, 7);
  const endMonth = range.end.slice(0, 7);
  const months = [];
  for (let month = startMonth; month <= endMonth; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

export function categoryBreakdown(planned, actual) {
  const categories = new Map();
  for (const row of planned.byCategory) {
    categories.set(row.category, {
      category: row.category,
      plannedIncomePence: row.income,
      plannedExpensePence: row.expense,
      plannedSavingsPence: row.savings,
      actualIncomePence: 0,
      actualExpensePence: 0,
      actualSavingsPence: 0
    });
  }
  for (const row of actual.byCategory) {
    const existing =
      categories.get(row.category) ||
      {
        category: row.category,
        plannedIncomePence: 0,
        plannedExpensePence: 0,
        plannedSavingsPence: 0,
        actualIncomePence: 0,
        actualExpensePence: 0,
        actualSavingsPence: 0
      };
    existing.actualIncomePence = row.income;
    existing.actualExpensePence = row.expense;
    existing.actualSavingsPence = row.savings;
    categories.set(row.category, existing);
  }
  return [...categories.values()].sort((a, b) => a.category.localeCompare(b.category));
}

function aggregatePlannedSummaries(summaries) {
  const aggregate = {
    month: null,
    plannedIncomePence: 0,
    plannedExpensePence: 0,
    plannedSavingsPence: 0,
    plannedSurplusPence: 0,
    byCategory: new Map(),
    byOwner: {
      person_a: { income: 0, expense: 0, savings: 0 },
      person_b: { income: 0, expense: 0, savings: 0 },
      shared: { income: 0, expense: 0, savings: 0 }
    },
    activeItems: []
  };

  for (const summary of summaries) {
    aggregate.plannedIncomePence += summary.plannedIncomePence;
    aggregate.plannedExpensePence += summary.plannedExpensePence;
    aggregate.plannedSavingsPence += summary.plannedSavingsPence;

    for (const owner of Object.keys(aggregate.byOwner)) {
      aggregate.byOwner[owner].income += summary.byOwner[owner].income;
      aggregate.byOwner[owner].expense += summary.byOwner[owner].expense;
      aggregate.byOwner[owner].savings += summary.byOwner[owner].savings;
    }

    for (const row of summary.byCategory) {
      const existing = aggregate.byCategory.get(row.category) || { income: 0, expense: 0, savings: 0 };
      existing.income += row.income;
      existing.expense += row.expense;
      existing.savings += row.savings;
      aggregate.byCategory.set(row.category, existing);
    }
  }

  aggregate.plannedSurplusPence = aggregate.plannedIncomePence - aggregate.plannedExpensePence - aggregate.plannedSavingsPence;
  aggregate.byCategory = [...aggregate.byCategory.entries()].map(([category, totals]) => ({ category, ...totals }));
  return aggregate;
}

function filterTransactionsForRange(transactions, range) {
  return transactions.filter((transaction) => transaction.transaction_date >= range.start && transaction.transaction_date <= range.end);
}

function buildMonths(startMonth, count) {
  return Array.from({ length: count }, (_, index) => addMonths(startMonth, index));
}
