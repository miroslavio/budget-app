export function findCategoryBudgetById(db, householdId, id) {
  if (!id) return null;
  return db
    .prepare(
      `SELECT category_budgets.*, categories.name AS category_name, categories.kind AS category_kind
       FROM category_budgets
       JOIN categories ON categories.id = category_budgets.category_id
       WHERE category_budgets.household_id = ? AND category_budgets.id = ?`
    )
    .get(householdId, id);
}

export function findCategoryBudgetDefaultById(db, householdId, id) {
  if (!id) return null;
  return db
    .prepare(
      `SELECT category_budget_defaults.*, categories.name AS category_name, categories.kind AS category_kind
       FROM category_budget_defaults
       JOIN categories ON categories.id = category_budget_defaults.category_id
       WHERE category_budget_defaults.household_id = ? AND category_budget_defaults.id = ?`
    )
    .get(householdId, id);
}

export function saveCategoryBudget(db, budget) {
  const existing = budget.id ? findCategoryBudgetById(db, budget.householdId, budget.id) : null;
  const duplicate = db
    .prepare(
      `SELECT id
       FROM category_budgets
       WHERE household_id = ? AND category_id = ? AND budget_month = ? ${budget.id ? 'AND id != ?' : ''}`
    )
    .get(
      budget.householdId,
      budget.categoryId,
      budget.budgetMonth,
      ...(budget.id ? [budget.id] : [])
    );

  if (existing) {
    if (duplicate) throw new Error('A budget for that category and month already exists.');
    db.prepare(
      `UPDATE category_budgets
       SET category_id = ?, budget_month = ?, amount_pence = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE household_id = ? AND id = ?`
    ).run(
      budget.categoryId,
      budget.budgetMonth,
      budget.amountPence,
      budget.notes || null,
      budget.householdId,
      budget.id
    );
    return findCategoryBudgetById(db, budget.householdId, budget.id);
  }

  if (duplicate) {
    db.prepare(
      `UPDATE category_budgets
       SET amount_pence = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE household_id = ? AND id = ?`
    ).run(
      budget.amountPence,
      budget.notes || null,
      budget.householdId,
      duplicate.id
    );
    return findCategoryBudgetById(db, budget.householdId, duplicate.id);
  }

  const result = db
    .prepare(
      `INSERT INTO category_budgets (
        household_id, category_id, budget_month, amount_pence, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      budget.householdId,
      budget.categoryId,
      budget.budgetMonth,
      budget.amountPence,
      budget.notes || null,
      budget.createdBy || null
    );

  return findCategoryBudgetById(db, budget.householdId, result.lastInsertRowid);
}

export function listCategoryBudgets(db, householdId, filters = {}) {
  const clauses = ['category_budgets.household_id = ?'];
  const params = [householdId];

  if (filters.startMonth) {
    clauses.push('category_budgets.budget_month >= ?');
    params.push(filters.startMonth);
  }

  if (filters.endMonth) {
    clauses.push('category_budgets.budget_month <= ?');
    params.push(filters.endMonth);
  }

  if (filters.categoryId) {
    clauses.push('category_budgets.category_id = ?');
    params.push(filters.categoryId);
  }

  return db
    .prepare(
      `SELECT category_budgets.*, categories.name AS category_name, categories.kind AS category_kind
       FROM category_budgets
       JOIN categories ON categories.id = category_budgets.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY category_budgets.budget_month DESC, categories.name ASC`
    )
    .all(...params);
}

export function saveCategoryBudgetDefault(db, budget) {
  const isActive = budget.isActive === undefined ? 1 : budget.isActive ? 1 : 0;
  const existing = budget.id ? findCategoryBudgetDefaultById(db, budget.householdId, budget.id) : null;
  const duplicate = db
    .prepare(
      `SELECT id
       FROM category_budget_defaults
       WHERE household_id = ? AND category_id = ? ${budget.id ? 'AND id != ?' : ''}`
    )
    .get(
      budget.householdId,
      budget.categoryId,
      ...(budget.id ? [budget.id] : [])
    );

  if (existing) {
    if (duplicate) throw new Error('A default budget for that category already exists.');
    db.prepare(
      `UPDATE category_budget_defaults
       SET category_id = ?, amount_pence = ?, is_active = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE household_id = ? AND id = ?`
    ).run(
      budget.categoryId,
      budget.amountPence,
      isActive,
      budget.notes || null,
      budget.householdId,
      budget.id
    );
    return findCategoryBudgetDefaultById(db, budget.householdId, budget.id);
  }

  if (duplicate) {
    db.prepare(
      `UPDATE category_budget_defaults
       SET amount_pence = ?, is_active = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE household_id = ? AND id = ?`
    ).run(
      budget.amountPence,
      isActive,
      budget.notes || null,
      budget.householdId,
      duplicate.id
    );
    return findCategoryBudgetDefaultById(db, budget.householdId, duplicate.id);
  }

  const result = db
    .prepare(
      `INSERT INTO category_budget_defaults (
        household_id, category_id, amount_pence, is_active, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      budget.householdId,
      budget.categoryId,
      budget.amountPence,
      isActive,
      budget.notes || null,
      budget.createdBy || null
    );

  return findCategoryBudgetDefaultById(db, budget.householdId, result.lastInsertRowid);
}

export function listCategoryBudgetDefaults(db, householdId, filters = {}) {
  const clauses = ['category_budget_defaults.household_id = ?'];
  const params = [householdId];

  if (filters.categoryId) {
    clauses.push('category_budget_defaults.category_id = ?');
    params.push(filters.categoryId);
  }

  return db
    .prepare(
      `SELECT category_budget_defaults.*, categories.name AS category_name, categories.kind AS category_kind
       FROM category_budget_defaults
       JOIN categories ON categories.id = category_budget_defaults.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY categories.name ASC`
    )
    .all(...params);
}

export function deleteCategoryBudget(db, householdId, id) {
  const existing = findCategoryBudgetById(db, householdId, id);
  if (!existing) throw new Error('Category budget was not found.');
  db.prepare('DELETE FROM category_budgets WHERE household_id = ? AND id = ?').run(householdId, id);
}

export function deleteCategoryBudgetDefault(db, householdId, id) {
  const existing = findCategoryBudgetDefaultById(db, householdId, id);
  if (!existing) throw new Error('Default category budget was not found.');
  db.prepare('DELETE FROM category_budget_defaults WHERE household_id = ? AND id = ?').run(householdId, id);
}

export function setCategoryBudgetDefaultActive(db, householdId, id, isActive) {
  const existing = findCategoryBudgetDefaultById(db, householdId, id);
  if (!existing) throw new Error('Default category budget was not found.');
  db.prepare(
    'UPDATE category_budget_defaults SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND id = ?'
  ).run(isActive ? 1 : 0, householdId, id);
  return findCategoryBudgetDefaultById(db, householdId, id);
}
