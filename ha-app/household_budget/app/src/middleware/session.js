import { parseCookies, serialiseCookie } from '../http/cookies.js';
import { randomToken, sessionExpiry } from '../services/authService.js';
import { createSession, deleteExpiredSessions, findSessionWithUser } from '../repositories/sessionRepository.js';

const COOKIE_NAME = 'budget_session';

export function loadSession(db, req, res) {
  deleteExpiredSessions(db);
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return { user: null, csrfToken: null, sessionId: null };

  const session = findSessionWithUser(db, sessionId);
  if (!session) return { user: null, csrfToken: null, sessionId: null };

  return {
    user: session,
    csrfToken: session.csrf_token,
    sessionId
  };
}

export function startSession(db, res, userId, secure = false) {
  const sessionId = randomToken(32);
  const csrfToken = randomToken(32);
  createSession(db, {
    id: sessionId,
    userId,
    csrfToken,
    expiresAt: sessionExpiry()
  });
  res.setHeader(
    'Set-Cookie',
    serialiseCookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      expires: new Date(sessionExpiry())
    })
  );
}

export function clearSessionCookie(res, secure = false) {
  res.setHeader(
    'Set-Cookie',
    serialiseCookie(COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      maxAge: 0
    })
  );
}

export function requireAuth(ctx) {
  if (!ctx.user) {
    return false;
  }
  return true;
}
