export function createSavingsAccount(db, account) {
  const result = db
    .prepare(
      `INSERT INTO savings_accounts (
        household_id, name, provider_name, account_type, owner_type,
        current_balance_pence, monthly_contribution_pence, employer_monthly_contribution_pence,
        available_for_household_cashflow, access_type, access_date, access_age, access_notes,
        projected_annual_rate, projected_rate_type, include_lisa_bonus, is_active, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      account.householdId,
      account.name,
      account.providerName || null,
      account.accountType,
      account.ownerType,
      account.currentBalancePence,
      account.monthlyContributionPence,
      account.employerMonthlyContributionPence,
      Number(account.availableForHouseholdCashflow) ? 1 : 0,
      account.accessType,
      account.accessDate || null,
      account.accessAge ?? null,
      account.accessNotes || null,
      account.projectedAnnualRate,
      account.projectedRateType,
      Number(account.includeLisaBonus) ? 1 : 0,
      Number(account.isActive) ? 1 : 0,
      account.notes || null
    );

  return findSavingsAccountById(db, account.householdId, result.lastInsertRowid);
}

export function updateSavingsAccount(db, account) {
  db.prepare(
    `UPDATE savings_accounts
     SET name = ?, provider_name = ?, account_type = ?, owner_type = ?,
         current_balance_pence = ?, monthly_contribution_pence = ?, employer_monthly_contribution_pence = ?,
         available_for_household_cashflow = ?, access_type = ?, access_date = ?, access_age = ?, access_notes = ?,
         projected_annual_rate = ?, projected_rate_type = ?, include_lisa_bonus = ?, is_active = ?,
         notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE household_id = ? AND id = ?`
  ).run(
    account.name,
    account.providerName || null,
    account.accountType,
    account.ownerType,
    account.currentBalancePence,
    account.monthlyContributionPence,
    account.employerMonthlyContributionPence,
    Number(account.availableForHouseholdCashflow) ? 1 : 0,
    account.accessType,
    account.accessDate || null,
    account.accessAge ?? null,
    account.accessNotes || null,
    account.projectedAnnualRate,
    account.projectedRateType,
    Number(account.includeLisaBonus) ? 1 : 0,
    Number(account.isActive) ? 1 : 0,
    account.notes || null,
    account.householdId,
    account.id
  );

  return findSavingsAccountById(db, account.householdId, account.id);
}

export function findSavingsAccountById(db, householdId, id) {
  return db.prepare('SELECT * FROM savings_accounts WHERE household_id = ? AND id = ?').get(householdId, id);
}

export function listSavingsAccounts(db, householdId, { activeOnly = false } = {}) {
  const where = ['household_id = ?'];
  const params = [householdId];

  if (activeOnly) {
    where.push('is_active = 1');
  }

  return db
    .prepare(
      `SELECT *
       FROM savings_accounts
       WHERE ${where.join(' AND ')}
       ORDER BY is_active DESC, owner_type, account_type, name`
    )
    .all(...params);
}

export function deleteSavingsAccount(db, householdId, id) {
  db.prepare('DELETE FROM savings_accounts WHERE household_id = ? AND id = ?').run(householdId, id);
}
