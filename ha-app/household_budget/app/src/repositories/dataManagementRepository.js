export function resetHouseholdData(db, householdId) {
  const customCategoryIds = householdCustomCategoryIds(db, householdId);

  db.exec('BEGIN');
  try {
    deleteHouseholdFinancialData(db, householdId);
    db.prepare('DELETE FROM household_categories WHERE household_id = ?').run(householdId);
    cleanupUnusedCustomCategories(db, customCategoryIds);
    db.prepare('UPDATE households SET opening_balance_pence = 0, forecast_adjustment_pence = 0, skip_planned_savings = 0 WHERE id = ?').run(householdId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteHouseholdAndUsers(db, householdId) {
  const customCategoryIds = householdCustomCategoryIds(db, householdId);

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE household_id = ?)').run(householdId);
    db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
    cleanupUnusedCustomCategories(db, customCategoryIds);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function deleteHouseholdFinancialData(db, householdId) {
  db.prepare(
    `DELETE FROM savings_goal_accounts
     WHERE goal_id IN (SELECT id FROM savings_goals WHERE household_id = ?)
        OR savings_account_id IN (SELECT id FROM savings_accounts WHERE household_id = ?)`
  ).run(householdId, householdId);
  db.prepare('DELETE FROM csv_import_rows WHERE batch_id IN (SELECT id FROM csv_import_batches WHERE household_id = ?)').run(householdId);
  db.prepare('DELETE FROM csv_import_batches WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM transactions WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM income_estimates WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM budget_items WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM category_budgets WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM category_budget_defaults WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM savings_goals WHERE household_id = ?').run(householdId);
  db.prepare('DELETE FROM savings_accounts WHERE household_id = ?').run(householdId);
}

function householdCustomCategoryIds(db, householdId) {
  return db
    .prepare(
      `SELECT categories.id
       FROM categories
       JOIN household_categories ON household_categories.category_id = categories.id
       WHERE household_categories.household_id = ? AND categories.is_default = 0`
    )
    .all(householdId)
    .map((row) => Number(row.id));
}

function cleanupUnusedCustomCategories(db, categoryIds) {
  for (const categoryId of categoryIds) {
    const stillUsed = db
      .prepare(
        `SELECT 1
         WHERE EXISTS (SELECT 1 FROM household_categories WHERE category_id = ?)
            OR EXISTS (SELECT 1 FROM budget_items WHERE category_id = ?)
            OR EXISTS (SELECT 1 FROM transactions WHERE category_id = ?)
            OR EXISTS (SELECT 1 FROM category_budgets WHERE category_id = ?)
            OR EXISTS (SELECT 1 FROM category_budget_defaults WHERE category_id = ?)`
      )
      .get(categoryId, categoryId, categoryId, categoryId, categoryId);

    if (!stillUsed) {
      db.prepare('DELETE FROM categories WHERE id = ? AND is_default = 0').run(categoryId);
    }
  }
}
