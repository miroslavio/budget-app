import { calculateSharedSplit } from './budgetService.js';
import { isItemActiveInMonth } from '../utils/dates.js';

const PALETTE = ['#2f6fed', '#ff8a00', '#2fa75a', '#f2bd16', '#e8463c', '#49b8bd', '#8c6bd1', '#c55a9b'];

export function plannedExpenseCategorySeries(items, { owner = 'household', months = [] } = {}) {
  const totals = new Map();
  const periodMonths = months.length ? months : [null];

  for (const item of items) {
    if (item.item_type !== 'expense' || Number(item.is_active) !== 1) continue;
    for (const month of periodMonths) {
      if (month && !isItemActiveInMonth(item, month)) continue;
      const amount = amountForOwner(Number(item.monthly_equivalent_pence || 0), item, owner);
      if (amount <= 0) continue;
      const category = item.category_name || 'Uncategorised';
      totals.set(category, (totals.get(category) || 0) + amount);
    }
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function actualExpenseCategorySeries(transactions, { owner = 'household' } = {}) {
  const totals = new Map();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (owner !== 'household' && transaction.owner_type !== owner) continue;
    const category = transaction.category_name || 'Uncategorised';
    totals.set(category, (totals.get(category) || 0) + Number(transaction.amount_pence || 0));
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function pieChartSegments(series) {
  const total = series.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) return { total, segments: [] };

  let cursor = 0;
  const segments = series.map((row, index) => {
    const percentage = row.value / total;
    const start = cursor;
    cursor += percentage;
    return {
      ...row,
      colour: PALETTE[index % PALETTE.length],
      percentage,
      start,
      end: cursor,
      largeArc: percentage > 0.5 ? 1 : 0
    };
  });

  return { total, segments };
}

function amountForOwner(amount, item, owner) {
  if (owner === 'household') return amount;
  const split = calculateSharedSplit(amount, item);
  if (owner === 'person_a') return split.personA;
  if (owner === 'person_b') return split.personB;
  return amount;
}
