export function createSavingsGoal(db, goal) {
  const result = db
    .prepare(
      `INSERT INTO savings_goals (
        household_id, name, target_amount_pence, current_saved_amount_pence,
        monthly_contribution_pence, target_date, tracking_mode, goal_type, owner_type, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      goal.householdId,
      goal.name,
      goal.targetAmountPence,
      goal.currentSavedAmountPence,
      goal.monthlyContributionPence,
      goal.targetDate || null,
      goal.trackingMode || 'manual',
      goal.goalType || 'general',
      goal.ownerType,
      goal.status,
      goal.notes || null
    );
  return findSavingsGoalById(db, goal.householdId, result.lastInsertRowid);
}

export function updateSavingsGoal(db, goal) {
  db.prepare(
    `UPDATE savings_goals
     SET name = ?, target_amount_pence = ?, current_saved_amount_pence = ?,
         monthly_contribution_pence = ?, target_date = ?, tracking_mode = ?, goal_type = ?, owner_type = ?, status = ?, notes = ?
     WHERE household_id = ? AND id = ?`
  ).run(
    goal.name,
    goal.targetAmountPence,
    goal.currentSavedAmountPence,
    goal.monthlyContributionPence,
    goal.targetDate || null,
    goal.trackingMode || 'manual',
    goal.goalType || 'general',
    goal.ownerType,
    goal.status,
    goal.notes || null,
    goal.householdId,
    goal.id
  );
  return findSavingsGoalById(db, goal.householdId, goal.id);
}

export function findSavingsGoalById(db, householdId, id) {
  return db.prepare('SELECT * FROM savings_goals WHERE household_id = ? AND id = ?').get(householdId, id);
}

export function listSavingsGoals(db, householdId) {
  return db.prepare('SELECT * FROM savings_goals WHERE household_id = ? ORDER BY status, target_date, name').all(householdId);
}

export function deleteSavingsGoal(db, householdId, id) {
  db.prepare('DELETE FROM savings_goals WHERE household_id = ? AND id = ?').run(householdId, id);
}
