import { isItemActiveInMonth } from '../utils/dates.js';

export function calculateMonthlyEquivalent(amountPence, frequency) {
  if (frequency === 'monthly') return Math.round(amountPence);
  if (frequency === 'yearly') return Math.round(amountPence / 12);
  throw new Error('Frequency must be monthly or yearly.');
}

export function calculateSharedSplit(amountPence, item) {
  if (item.owner_type === 'person_a') return { personA: amountPence, personB: 0 };
  if (item.owner_type === 'person_b') return { personA: 0, personB: amountPence };
  if (item.split_type === 'manual_percentage') {
    return {
      personA: Math.round(amountPence * (Number(item.person_a_percentage) / 100)),
      personB: Math.round(amountPence * (Number(item.person_b_percentage) / 100))
    };
  }
  return {
    personA: Math.round(amountPence / 2),
    personB: amountPence - Math.round(amountPence / 2)
  };
}

export function plannedMonthlySummary(items, month) {
  const activeItems = items.filter((item) => isItemActiveInMonth(item, month));
  const summary = {
    month,
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
    activeItems
  };

  for (const item of activeItems) {
    const amount = Number(item.monthly_equivalent_pence || 0);
    if (item.item_type === 'income') summary.plannedIncomePence += amount;
    if (item.item_type === 'expense') summary.plannedExpensePence += amount;
    if (item.item_type === 'savings') summary.plannedSavingsPence += amount;
    summary.byOwner[item.owner_type][item.item_type] += amount;

    const categoryName = item.category_name || 'Uncategorised';
    const existing = summary.byCategory.get(categoryName) || { income: 0, expense: 0, savings: 0 };
    existing[item.item_type] += amount;
    summary.byCategory.set(categoryName, existing);
  }

  summary.plannedSurplusPence = summary.plannedIncomePence - summary.plannedExpensePence - summary.plannedSavingsPence;
  summary.byCategory = [...summary.byCategory.entries()].map(([category, totals]) => ({ category, ...totals }));
  return summary;
}

export function actualMonthlySummary(transactions) {
  const summary = {
    actualIncomePence: 0,
    actualExpensePence: 0,
    actualSavingsPence: 0,
    actualSurplusPence: 0,
    byCategory: new Map(),
    byOwner: {
      person_a: { income: 0, expense: 0, savings: 0 },
      person_b: { income: 0, expense: 0, savings: 0 },
      shared: { income: 0, expense: 0, savings: 0 }
    }
  };

  for (const transaction of transactions) {
    const amount = Number(transaction.amount_pence || 0);
    if (transaction.type === 'income') summary.actualIncomePence += amount;
    if (transaction.type === 'expense') summary.actualExpensePence += amount;
    if (transaction.type === 'savings') summary.actualSavingsPence += amount;
    summary.byOwner[transaction.owner_type][transaction.type] += amount;

    const categoryName = transaction.category_name || 'Uncategorised';
    const existing = summary.byCategory.get(categoryName) || { income: 0, expense: 0, savings: 0 };
    existing[transaction.type] += amount;
    summary.byCategory.set(categoryName, existing);
  }

  summary.actualSurplusPence = summary.actualIncomePence - summary.actualExpensePence - summary.actualSavingsPence;
  summary.byCategory = [...summary.byCategory.entries()].map(([category, totals]) => ({ category, ...totals }));
  return summary;
}

export function varianceSummary(planned, actual) {
  return {
    incomeVariancePence: actual.actualIncomePence - planned.plannedIncomePence,
    expenseVariancePence: actual.actualExpensePence - planned.plannedExpensePence,
    savingsVariancePence: actual.actualSavingsPence - planned.plannedSavingsPence,
    surplusVariancePence: actual.actualSurplusPence - planned.plannedSurplusPence
  };
}

export function yearlyItems(items) {
  return items.filter((item) => item.frequency === 'yearly' && Number(item.is_active) === 1);
}
