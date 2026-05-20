export function createSavingsGoal(db, goal) {
  const result = db
    .prepare(
      `INSERT INTO savings_goals (
        household_id, name, target_amount_pence, current_saved_amount_pence,
        monthly_contribution_pence, target_date, owner_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      goal.householdId,
      goal.name,
      goal.targetAmountPence,
      goal.currentSavedAmountPence,
      goal.monthlyContributionPence,
      goal.targetDate || null,
      goal.ownerType,
      goal.status
    );
  return findSavingsGoalById(db, goal.householdId, result.lastInsertRowid);
}

export function findSavingsGoalById(db, householdId, id) {
  return db.prepare('SELECT * FROM savings_goals WHERE household_id = ? AND id = ?').get(householdId, id);
}

export function listSavingsGoals(db, householdId) {
  return db.prepare('SELECT * FROM savings_goals WHERE household_id = ? ORDER BY status, target_date, name').all(householdId);
}
