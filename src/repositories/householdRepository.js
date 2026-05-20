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

export function updateHouseholdSettings(db, householdId, { name, openingBalancePence }) {
  db.prepare('UPDATE households SET name = ?, opening_balance_pence = ? WHERE id = ?').run(
    name,
    openingBalancePence,
    householdId
  );
  return findHouseholdById(db, householdId);
}
