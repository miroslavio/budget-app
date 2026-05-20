export function createBudgetItem(db, item) {
  const result = db
    .prepare(
      `INSERT INTO budget_items (
        household_id, name, item_type, category_id, owner_type, amount_pence, frequency,
        monthly_equivalent_pence, start_date, end_date, notes, is_active, split_type,
        person_a_percentage, person_b_percentage, income_entry_mode, income_estimate_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      item.householdId,
      item.name,
      item.itemType,
      item.categoryId,
      item.ownerType,
      item.amountPence,
      item.frequency,
      item.monthlyEquivalentPence,
      item.startDate,
      item.endDate,
      item.notes,
      item.isActive ? 1 : 0,
      item.splitType,
      item.personAPercentage,
      item.personBPercentage,
      item.incomeEntryMode,
      item.incomeEstimateId || null,
      item.createdBy
    );
  return findBudgetItemById(db, item.householdId, result.lastInsertRowid);
}

export function updateBudgetItemIncomeEstimate(db, householdId, itemId, incomeEstimateId) {
  db.prepare('UPDATE budget_items SET income_estimate_id = ?, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND id = ?').run(
    incomeEstimateId,
    householdId,
    itemId
  );
}

export function findBudgetItemById(db, householdId, id) {
  return db
    .prepare(
      `SELECT budget_items.*, categories.name AS category_name, categories.kind AS category_kind
       FROM budget_items
       LEFT JOIN categories ON categories.id = budget_items.category_id
       WHERE budget_items.household_id = ? AND budget_items.id = ?`
    )
    .get(householdId, id);
}

export function listBudgetItems(db, householdId, itemType = null) {
  const sql =
    `SELECT budget_items.*, categories.name AS category_name, categories.kind AS category_kind
     FROM budget_items
     LEFT JOIN categories ON categories.id = budget_items.category_id
     WHERE budget_items.household_id = ? ${itemType ? 'AND budget_items.item_type = ?' : ''}
     ORDER BY budget_items.is_active DESC, budget_items.item_type, budget_items.name`;
  const statement = db.prepare(sql);
  return itemType ? statement.all(householdId, itemType) : statement.all(householdId);
}

export function listActiveBudgetItems(db, householdId) {
  return db
    .prepare(
      `SELECT budget_items.*, categories.name AS category_name, categories.kind AS category_kind
       FROM budget_items
       LEFT JOIN categories ON categories.id = budget_items.category_id
       WHERE budget_items.household_id = ? AND budget_items.is_active = 1
       ORDER BY budget_items.item_type, budget_items.name`
    )
    .all(householdId);
}

export function setBudgetItemActive(db, householdId, id, isActive) {
  db.prepare('UPDATE budget_items SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND id = ?').run(
    isActive ? 1 : 0,
    householdId,
    id
  );
}
