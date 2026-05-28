import { calculateSharedSplit } from './budgetService.js';
import { effectiveCategoryBudgets } from './categoryBudgetService.js';
import { isItemActiveInMonth } from '../utils/dates.js';

export function spendingCategoryKey(categoryId, categoryName = 'Uncategorised') {
  if (categoryId) return `id:${categoryId}`;
  const name = String(categoryName || 'Uncategorised').trim().toLowerCase() || 'uncategorised';
  return `name:${name}`;
}

export function plannedSpendingSummary({ expenseItems = [], defaultBudgets = [], monthBudgets = [], month }) {
  const committedItems = activeCommittedExpenseItems(expenseItems, month);
  const committedCategoryKeys = new Set(committedItems.map((item) => spendingCategoryKey(item.category_id, item.category_name)));
  const effectiveBudgets = effectiveCategoryBudgets(defaultBudgets, monthBudgets, month).map((budget) => {
    const categoryKey = spendingCategoryKey(budget.category_id, budget.category_name);
    const overlap = committedCategoryKeys.has(categoryKey);
    return {
      ...budget,
      categoryKey,
      overlap,
      countedInPlan: !overlap
    };
  });

  const committedTotalPence = committedItems.reduce((total, item) => total + Number(item.monthly_equivalent_pence || 0), 0);
  const flexibleTotalPence = effectiveBudgets
    .filter((budget) => budget.countedInPlan)
    .reduce((total, budget) => total + Number(budget.amount_pence || 0), 0);
  const overlappingFlexibleTotalPence = effectiveBudgets
    .filter((budget) => budget.overlap)
    .reduce((total, budget) => total + Number(budget.amount_pence || 0), 0);

  return {
    committedItems,
    effectiveBudgets,
    committedTotalPence,
    flexibleTotalPence,
    overlappingFlexibleTotalPence,
    totalPlannedSpendingPence: committedTotalPence + flexibleTotalPence,
    overlaps: effectiveBudgets.filter((budget) => budget.overlap)
  };
}

export function buildFlexibleSpendingByMonth(months, defaultBudgets = [], monthBudgets = [], expenseItems = []) {
  return new Map(
    months.map((month) => [
      month,
      plannedSpendingSummary({
        expenseItems,
        defaultBudgets,
        monthBudgets: monthBudgets.filter((budget) => budget.budget_month === month),
        month
      }).flexibleTotalPence
    ])
  );
}

export function plannedSpendingCategorySeries({ expenseItems = [], defaultBudgets = [], monthBudgets = [], months = [], owner = 'household' }) {
  const periodMonths = months.length ? months : [null];
  const totals = new Map();

  for (const month of periodMonths) {
    const committedItems = activeCommittedExpenseItems(expenseItems, month);
    const committedCategoryKeys = new Set(committedItems.map((item) => spendingCategoryKey(item.category_id, item.category_name)));

    for (const item of committedItems) {
      const amount = amountForOwner(Number(item.monthly_equivalent_pence || 0), item, owner);
      if (amount <= 0) continue;
      const label = item.category_name || item.name || 'Uncategorised';
      totals.set(label, (totals.get(label) || 0) + amount);
    }

    if (owner !== 'household') continue;
    const monthRows = month
      ? monthBudgets.filter((budget) => budget.budget_month === month)
      : monthBudgets;
    for (const budget of effectiveCategoryBudgets(defaultBudgets, monthRows, month || monthRows[0]?.budget_month || '')) {
      if (committedCategoryKeys.has(spendingCategoryKey(budget.category_id, budget.category_name))) continue;
      const label = budget.category_name || 'Uncategorised';
      totals.set(label, (totals.get(label) || 0) + Number(budget.amount_pence || 0));
    }
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildUnifiedSpendingBudgetRows({
  expenseItems = [],
  defaultBudgets = [],
  monthBudgets = [],
  transactions = [],
  month
}) {
  const summary = plannedSpendingSummary({ expenseItems, defaultBudgets, monthBudgets, month });
  const actualByCategory = buildActualByCategoryMap(transactions);
  const allCommittedItems = expenseItems.filter((item) => item.item_type === 'expense');

  const committedRows = allCommittedItems.map((item) => {
    const categoryKey = spendingCategoryKey(item.category_id, item.category_name);
    const actualSpentPence = actualByCategory.get(categoryKey) || 0;
    const plannedMonthlyPence = Number(item.monthly_equivalent_pence || 0);
    return {
      rowType: 'committed_cost',
      id: item.id,
      categoryKey,
      categoryId: item.category_id,
      name: item.name,
      categoryName: item.category_name || 'Uncategorised',
      ownerType: item.owner_type,
      isActive: Number(item.is_active) === 1,
      splitType: item.split_type,
      personAPercentage: item.person_a_percentage,
      personBPercentage: item.person_b_percentage,
      frequency: item.frequency,
      plannedMonthlyPence,
      sourceAmountPence: Number(item.amount_pence || 0),
      notes: item.notes || '',
      startDate: item.start_date || '',
      endDate: item.end_date || '',
      actualSpentPence,
      remainingPence: plannedMonthlyPence - actualSpentPence,
      status: itemStatus(item),
      countedInPlan: true,
      overlap: false
    };
  });

  const flexibleRows = summary.effectiveBudgets.map((budget) => {
    const actualSpentPence = actualByCategory.get(budget.categoryKey) || 0;
    const plannedMonthlyPence = Number(budget.amount_pence || 0);
    return {
      rowType: 'flexible_target',
      id: budget.id,
      categoryKey: budget.categoryKey,
      categoryId: budget.category_id,
      name: budget.category_name || 'Uncategorised',
      categoryName: budget.category_name || 'Uncategorised',
      ownerType: 'shared',
      splitType: 'equal',
      personAPercentage: 50,
      personBPercentage: 50,
      frequency: budget.budget_scope === 'month_override' ? 'month_override' : 'default_monthly',
      plannedMonthlyPence,
      sourceAmountPence: plannedMonthlyPence,
      actualSpentPence,
      remainingPence: plannedMonthlyPence - actualSpentPence,
      status: budget.overlap ? 'Overlap warning' : 'Active',
      countedInPlan: budget.countedInPlan,
      overlap: budget.overlap,
      budgetScope: budget.budget_scope,
      budgetMonth: budget.budget_month,
      notes: budget.notes || ''
    };
  });

  const inactiveFlexibleRows = defaultBudgets
    .filter((budget) => Number(budget.is_active ?? 1) !== 1)
    .map((budget) => ({
      rowType: 'flexible_target',
      id: budget.id,
      categoryKey: spendingCategoryKey(budget.category_id, budget.category_name),
      categoryId: budget.category_id,
      name: budget.category_name || 'Uncategorised',
      categoryName: budget.category_name || 'Uncategorised',
      ownerType: 'shared',
      splitType: 'equal',
      personAPercentage: 50,
      personBPercentage: 50,
      frequency: 'default_monthly',
      plannedMonthlyPence: Number(budget.amount_pence || 0),
      sourceAmountPence: Number(budget.amount_pence || 0),
      actualSpentPence: 0,
      remainingPence: Number(budget.amount_pence || 0),
      status: 'Paused',
      countedInPlan: false,
      overlap: false,
      budgetScope: 'default_monthly',
      budgetMonth: month,
      notes: budget.notes || '',
      isActive: false
    }));

  return {
    ...summary,
    rows: [...committedRows, ...flexibleRows, ...inactiveFlexibleRows].sort((a, b) => {
      if (Number(b.isActive ?? 1) !== Number(a.isActive ?? 1)) return Number(b.isActive ?? 1) - Number(a.isActive ?? 1);
      if (a.rowType !== b.rowType) return a.rowType.localeCompare(b.rowType);
      return (a.categoryName || a.name).localeCompare(b.categoryName || b.name);
    })
  };
}

function activeCommittedExpenseItems(expenseItems, month) {
  return expenseItems.filter(
    (item) => item.item_type === 'expense' && Number(item.is_active) === 1 && (!month || isItemActiveInMonth(item, month))
  );
}

function buildActualByCategoryMap(transactions = []) {
  const rows = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const key = spendingCategoryKey(transaction.category_id, transaction.category_name);
    rows.set(key, (rows.get(key) || 0) + Number(transaction.amount_pence || 0));
  }
  return rows;
}

function amountForOwner(amount, item, owner) {
  if (owner === 'household') return amount;
  const split = calculateSharedSplit(amount, item);
  if (owner === 'person_a') return split.personA;
  if (owner === 'person_b') return split.personB;
  return amount;
}

function itemStatus(item) {
  if (item.end_date && item.end_date < new Date().toISOString().slice(0, 10)) return 'Ended';
  return Number(item.is_active) === 1 ? 'Active' : 'Paused';
}
