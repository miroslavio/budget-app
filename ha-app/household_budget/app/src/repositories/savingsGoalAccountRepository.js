export function listSavingsGoalAccountLinks(db, householdId) {
  return db
    .prepare(
      `SELECT
         sga.goal_id,
         sa.id AS savings_account_id,
         sa.name AS savings_account_name,
         sa.owner_type,
         sa.account_type
       FROM savings_goal_accounts sga
       JOIN savings_goals sg ON sg.id = sga.goal_id
       JOIN savings_accounts sa ON sa.id = sga.savings_account_id
       WHERE sg.household_id = ? AND sa.household_id = ?
       ORDER BY sga.goal_id, sa.owner_type, sa.account_type, sa.name`
    )
    .all(householdId, householdId);
}

export function replaceSavingsGoalAccountLinks(db, householdId, goalId, accountIds) {
  const uniqueIds = [...new Set(accountIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];

  if (uniqueIds.length) {
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const validIds = db
      .prepare(`SELECT id FROM savings_accounts WHERE household_id = ? AND id IN (${placeholders})`)
      .all(householdId, ...uniqueIds)
      .map((row) => Number(row.id));

    if (validIds.length !== uniqueIds.length) {
      throw new Error('One or more linked pots are no longer available.');
    }
  }

  db.prepare(
    `DELETE FROM savings_goal_accounts
     WHERE goal_id = ?
       AND goal_id IN (SELECT id FROM savings_goals WHERE household_id = ?)`
  ).run(goalId, householdId);

  if (!uniqueIds.length) return;

  const insert = db.prepare('INSERT INTO savings_goal_accounts (goal_id, savings_account_id) VALUES (?, ?)');
  for (const savingsAccountId of uniqueIds) {
    insert.run(goalId, savingsAccountId);
  }
}
