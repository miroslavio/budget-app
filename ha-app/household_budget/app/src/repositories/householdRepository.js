import { randomToken } from '../services/authService.js';

export function createHousehold(db, { name }) {
  const inviteCode = randomToken(8);
  const result = db.prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)').run(name, inviteCode);
  return findHouseholdById(db, result.lastInsertRowid);
}

export function findHouseholdById(db, id) {
  return db.prepare('SELECT * FROM households WHERE id = ?').get(id);
}

export function findHouseholdByInviteCode(db, inviteCode) {
  return db.prepare('SELECT * FROM households WHERE invite_code = ?').get(inviteCode);
}

export function updateHouseholdSettings(db, householdId, { name, openingBalancePence, forecastAdjustmentPence, skipPlannedSavings }) {
  const household = findHouseholdById(db, householdId);
  db.prepare(
    'UPDATE households SET name = ?, opening_balance_pence = ?, forecast_adjustment_pence = ?, skip_planned_savings = ? WHERE id = ?'
  ).run(
    name ?? household.name,
    openingBalancePence ?? Number(household.opening_balance_pence || 0),
    forecastAdjustmentPence ?? Number(household.forecast_adjustment_pence || 0),
    skipPlannedSavings ?? Number(household.skip_planned_savings || 0),
    householdId
  );
  return findHouseholdById(db, householdId);
}
