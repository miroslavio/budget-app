export function effectiveCategoryBudgets(defaultBudgets, monthBudgets, month) {
  const rows = new Map();

  for (const budget of defaultBudgets) {
    rows.set(String(budget.category_id), {
      id: budget.id,
      category_id: budget.category_id,
      category_name: budget.category_name || 'Uncategorised',
      budget_month: month,
      amount_pence: Number(budget.amount_pence || 0),
      notes: budget.notes || '',
      budget_scope: 'default_monthly'
    });
  }

  for (const budget of monthBudgets) {
    rows.set(String(budget.category_id), {
      id: budget.id,
      category_id: budget.category_id,
      category_name: budget.category_name || 'Uncategorised',
      budget_month: budget.budget_month || month,
      amount_pence: Number(budget.amount_pence || 0),
      notes: budget.notes || '',
      budget_scope: 'month_override'
    });
  }

  return [...rows.values()].sort((a, b) => a.category_name.localeCompare(b.category_name));
}

export function categoryBudgetComparison(budgets, transactions) {
  const rows = new Map();

  for (const budget of budgets) {
    const key = String(budget.category_id);
    const existing = rows.get(key) || createRow(budget.category_id, budget.category_name || 'Uncategorised');
    existing.budgetPence += Number(budget.amount_pence ?? budget.budgetPence ?? 0);
    if (!existing.budgetId) existing.budgetId = budget.id || null;
    if (!existing.notes) existing.notes = budget.notes || '';
    if (!existing.budgetScope) existing.budgetScope = budget.budget_scope || null;
    if (!existing.budgetMonth) existing.budgetMonth = budget.budget_month || null;
    rows.set(key, existing);
  }

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const key = String(transaction.category_id || `uncategorised:${transaction.category_name || 'Uncategorised'}`);
    const existing =
      rows.get(key) || createRow(transaction.category_id || null, transaction.category_name || 'Uncategorised');
    existing.actualExpensePence += Number(transaction.amount_pence || 0);
    rows.set(key, existing);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      variancePence: row.actualExpensePence - row.budgetPence
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function categoryBudgetSummary(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.totalBudgetPence += row.budgetPence;
      summary.totalActualExpensePence += row.actualExpensePence;
      summary.totalVariancePence += row.variancePence;
      return summary;
    },
    { totalBudgetPence: 0, totalActualExpensePence: 0, totalVariancePence: 0 }
  );
}

export function mergeCategoryExpenseTracking(breakdownRows, budgetRows) {
  const rows = new Map();

  for (const row of breakdownRows) {
    rows.set(row.category, {
      category: row.category,
      plannedExpensePence: row.plannedExpensePence,
      budgetPence: 0,
      actualExpensePence: row.actualExpensePence,
      budgetVariancePence: row.actualExpensePence,
      plannedVariancePence: row.actualExpensePence - row.plannedExpensePence
    });
  }

  for (const row of budgetRows) {
    const existing =
      rows.get(row.category) ||
      {
        category: row.category,
        plannedExpensePence: 0,
        budgetPence: 0,
        actualExpensePence: 0,
        budgetVariancePence: 0,
        plannedVariancePence: 0
      };

    existing.budgetPence = row.budgetPence;
    existing.actualExpensePence = Math.max(existing.actualExpensePence, row.actualExpensePence);
    existing.budgetVariancePence = row.variancePence;
    existing.plannedVariancePence = existing.actualExpensePence - existing.plannedExpensePence;
    rows.set(row.category, existing);
  }

  return [...rows.values()].sort((a, b) => a.category.localeCompare(b.category));
}

function createRow(categoryId, category) {
  return {
    categoryId,
    category,
    budgetId: null,
    budgetScope: null,
    budgetMonth: null,
    notes: '',
    budgetPence: 0,
    actualExpensePence: 0
  };
}
