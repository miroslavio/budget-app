export function createSession(db, session) {
  db.prepare('INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
    session.id,
    session.userId,
    session.csrfToken,
    session.expiresAt
  );
}

export function findSessionWithUser(db, sessionId) {
  return db
    .prepare(
      `SELECT
        sessions.id AS session_id,
        sessions.csrf_token,
        sessions.expires_at,
        users.*
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > datetime('now')`
    )
    .get(sessionId);
}

export function deleteSession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}
