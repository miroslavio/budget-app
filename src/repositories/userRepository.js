export function createUser(db, user) {
  const result = db
    .prepare(
      `INSERT INTO users
        (email, password_hash, password_salt, display_name, household_id, person_key)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(user.email, user.passwordHash, user.passwordSalt, user.displayName, user.householdId, user.personKey);
  return findUserById(db, result.lastInsertRowid);
}

export function findUserByEmail(db, email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function findUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function countHouseholdUsers(db, householdId) {
  return db.prepare('SELECT COUNT(*) AS count FROM users WHERE household_id = ?').get(householdId).count;
}

export function listHouseholdMembers(db, householdId) {
  return db.prepare('SELECT id, email, display_name, person_key, created_at FROM users WHERE household_id = ? ORDER BY person_key').all(householdId);
}
