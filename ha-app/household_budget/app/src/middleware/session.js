import { parseCookies, serialiseCookie } from '../http/cookies.js';
import { randomToken, sessionExpiry } from '../services/authService.js';
import { createSession, deleteExpiredSessions, findSessionWithUser } from '../repositories/sessionRepository.js';
import { createHousehold, findFirstHousehold } from '../repositories/householdRepository.js';
import {
  createUser,
  findUserByEmail,
  findUserByHouseholdAndPersonKey,
  listHouseholdMembers,
  updateUserHomeAssistantIdentity
} from '../repositories/userRepository.js';

const COOKIE_NAME = 'budget_session';

export function loadSession(db, req, res) {
  deleteExpiredSessions(db);

  const homeAssistantUser = resolveHomeAssistantUser(req);
  if (homeAssistantUser) {
    const user = provisionHomeAssistantUser(db, homeAssistantUser);
    if (!user) return { user: null, csrfToken: null, sessionId: null, authError: 'This Household Budget app already has two Home Assistant users linked.' };
    return sessionForUser(db, req, res, user);
  }

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

function sessionForUser(db, req, res, user) {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies[COOKIE_NAME];
  if (sessionId) {
    const session = findSessionWithUser(db, sessionId);
    if (session && session.id === user.id) {
      return {
        user: session,
        csrfToken: session.csrf_token,
        sessionId
      };
    }
  }

  const session = startSession(db, res, user.id, Boolean(req.secure || req.get('x-forwarded-proto') === 'https'));
  return {
    user: {
      ...user,
      session_id: session.id,
      csrf_token: session.csrfToken
    },
    csrfToken: session.csrfToken,
    sessionId: session.id
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
      path: cookiePath(res),
      expires: new Date(sessionExpiry())
    })
  );
  return { id: sessionId, csrfToken };
}

export function clearSessionCookie(res, secure = false) {
  res.setHeader(
    'Set-Cookie',
    serialiseCookie(COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: cookiePath(res),
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

function cookiePath(res) {
  const ingressPath = String(res?.locals?.ingressPath || '').trim();
  return ingressPath || '/';
}

function resolveHomeAssistantUser(req) {
  const ingressPath = req.get('x-ingress-path');
  const remoteUserId = req.get('x-remote-user-id');
  if (!ingressPath || !remoteUserId) {
    if (process.env.NODE_ENV !== 'production' && process.env.APP_AUTH_MODE !== 'session') {
      return {
        id: 'local-dev',
        name: 'Local development user'
      };
    }
    return null;
  }

  return {
    id: remoteUserId,
    name: req.get('x-remote-user-display-name') || req.get('x-remote-user-name') || 'Home Assistant user'
  };
}

function provisionHomeAssistantUser(db, homeAssistantUser) {
  const email = `ha-${normaliseIdentifier(homeAssistantUser.id)}@homeassistant.local`;
  const displayName = String(homeAssistantUser.name || 'Home Assistant user').slice(0, 100);
  const existingUser = findUserByEmail(db, email);
  if (existingUser) return existingUser;

  let household = findFirstHousehold(db);
  if (!household) {
    household = createHousehold(db, { name: 'Home Assistant household' });
  }

  const claimedUser = claimExistingMemberSlot(db, household.id, { email, displayName });
  if (claimedUser) return claimedUser;

  const personKey = nextPersonKey(db, household.id);
  if (!personKey) return null;

  return createUser(db, {
    email,
    passwordHash: `home-assistant-${randomToken(16)}`,
    passwordSalt: `home-assistant-${randomToken(16)}`,
    displayName,
    householdId: household.id,
    personKey
  });
}

function claimExistingMemberSlot(db, householdId, { email, displayName }) {
  const members = listHouseholdMembers(db, householdId);
  const legacyMembers = members.filter((member) => !isHomeAssistantEmail(member.email));
  if (!legacyMembers.length) return null;

  const displayNameKey = normaliseName(displayName);
  const matchedMember = legacyMembers.find((member) => normaliseName(member.display_name) === displayNameKey);
  const memberToClaim = matchedMember || legacyMembers[0];
  return updateUserHomeAssistantIdentity(db, memberToClaim.id, { email, displayName });
}

function nextPersonKey(db, householdId) {
  if (!findUserByHouseholdAndPersonKey(db, householdId, 'person_a')) return 'person_a';
  if (!findUserByHouseholdAndPersonKey(db, householdId, 'person_b')) return 'person_b';
  return null;
}

function normaliseIdentifier(value) {
  return String(value || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'user';
}

function normaliseName(value) {
  return String(value || '').trim().toLowerCase();
}

function isHomeAssistantEmail(email) {
  return /^ha-[a-z0-9-]+@homeassistant\.local$/i.test(String(email || ''));
}
