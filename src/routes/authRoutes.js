import { clearSessionCookie, startSession } from '../middleware/session.js';
import { deleteSession } from '../repositories/sessionRepository.js';
import { createHousehold, findHouseholdByInviteCode } from '../repositories/householdRepository.js';
import { countHouseholdUsers, createUser, findUserByEmail, listHouseholdMembers } from '../repositories/userRepository.js';
import { createPasswordHash, verifyPassword } from '../services/authService.js';
import { normaliseEmail, requireString } from '../utils/validation.js';
import { html, redirect } from '../http/response.js';
import { escapeHtml, page } from '../views/html.js';
import { redirectWithError } from './helpers.js';

export function registerAuthRoutes(router, db) {
  router.get('/', (ctx) => redirect(ctx.res, ctx.user ? '/dashboard' : '/login'));

  router.get('/login', (ctx) => {
    html(
      ctx.res,
      page(ctx, {
        title: 'Login',
        body: `<section class="auth-card">
          <h1>Log in</h1>
          <form method="post" action="/login" class="stack" data-submit-on-enter>
            <label>Email <input name="email" type="email" autocomplete="email" required></label>
            <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
            <button type="submit">Log in</button>
          </form>
          <p>New household? <a href="/register">Create an account</a>.</p>
        </section>`
      })
    );
  });

  router.post('/login', (ctx) => {
    try {
      const email = normaliseEmail(ctx.body.email);
      const user = findUserByEmail(db, email);
      if (!user || !verifyPassword(ctx.body.password || '', user.password_salt, user.password_hash)) {
        throw new Error('Email or password is incorrect.');
      }
      startSession(db, ctx.res, user.id, ctx.secure);
      redirect(ctx.res, '/dashboard');
    } catch (error) {
      redirectWithError(ctx.res, '/login', error);
    }
  });

  router.get('/register', (ctx) => {
    const inviteCode = ctx.query.get('invite') || '';
    html(
      ctx.res,
      page(ctx, {
        title: 'Create account',
        body: `<section class="auth-card">
          <h1>Create your household budget</h1>
          <form method="post" action="/register" class="stack" data-submit-on-enter>
            <label>Your name <input name="display_name" required maxlength="100"></label>
            <label>Email <input name="email" type="email" autocomplete="email" required></label>
            <label>Password <input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
            <label>Household name <input name="household_name" value="Our household" maxlength="120"></label>
            <label>Household invite code <input name="invite_code" value="${escapeHtml(inviteCode)}" maxlength="64"></label>
            <p class="hint">Leave this blank to create a new household. Use a household invite code to join an existing household as the second member.</p>
            <button type="submit">Create account</button>
          </form>
          <p>Already registered? <a href="/login">Log in</a>.</p>
        </section>`
      })
    );
  });

  router.post('/register', (ctx) => {
    try {
      const email = normaliseEmail(ctx.body.email);
      if (findUserByEmail(db, email)) throw new Error('An account already exists for that email.');

      const displayName = requireString(ctx.body.display_name, 'Your name', 100);
      const { hash, salt } = createPasswordHash(ctx.body.password || '');
      const inviteCode = String(ctx.body.invite_code || '').trim();
      let household;
      let personKey = 'person_a';

      db.exec('BEGIN');
      try {
        if (inviteCode) {
          household = findHouseholdByInviteCode(db, inviteCode);
          if (!household) throw new Error('Invite code was not found.');
          const members = listHouseholdMembers(db, household.id);
          if (members.length >= 2) throw new Error('This household already has two people.');
          if (members.some((member) => member.person_key === 'person_b')) throw new Error('The second household member is already registered.');
          personKey = 'person_b';
        } else {
          household = createHousehold(db, { name: requireString(ctx.body.household_name || 'Our household', 'Household name', 120) });
        }

        if (countHouseholdUsers(db, household.id) >= 2) throw new Error('This household already has two people.');
        const user = createUser(db, {
          email,
          passwordHash: hash,
          passwordSalt: salt,
          displayName,
          householdId: household.id,
          personKey
        });
        db.exec('COMMIT');
        startSession(db, ctx.res, user.id, ctx.secure);
        redirect(ctx.res, '/dashboard');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      redirectWithError(ctx.res, '/register', error);
    }
  });

  router.post('/logout', (ctx) => {
    if (ctx.sessionId) deleteSession(db, ctx.sessionId);
    clearSessionCookie(ctx.res, ctx.secure);
    redirect(ctx.res, '/login');
  });
}
