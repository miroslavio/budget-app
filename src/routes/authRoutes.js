import { html, redirect } from '../http/response.js';
import { escapeHtml, page } from '../views/html.js';

export function registerAuthRoutes(router) {
  router.get('/', (ctx) => redirect(ctx.res, ctx.user ? '/dashboard' : '/login'));

  router.get('/login', (ctx) => {
    if (ctx.user) return redirect(ctx.res, '/dashboard');
    return html(
      ctx.res,
      page(ctx, {
        title: 'Home Assistant authentication required',
        body: `<section class="auth-card">
          <h1>Open from Home Assistant</h1>
          <p>${escapeHtml(ctx.authError || 'Household Budget uses Home Assistant to control access. Open this app from the Home Assistant app page or sidebar.')}</p>
        </section>`
      }),
      401
    );
  });

  router.get('/register', (ctx) => redirect(ctx.res, ctx.user ? '/dashboard' : '/login'));
  router.post('/login', (ctx) => redirect(ctx.res, ctx.user ? '/dashboard' : '/login'));
  router.post('/register', (ctx) => redirect(ctx.res, ctx.user ? '/dashboard' : '/login'));
  router.post('/logout', (ctx) => redirect(ctx.res, '/dashboard'));
}
