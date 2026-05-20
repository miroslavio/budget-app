import { formatCurrency, formatSignedCurrency, penceToPounds } from '../utils/money.js';

const ASSET_VERSION = '2026-05-20-modals';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function selected(actual, expected) {
  return actual === expected ? 'selected' : '';
}

export function checked(value) {
  return value ? 'checked' : '';
}

export function csrfField(ctx) {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(ctx.csrfToken || '')}">`;
}

export function moneyInputValue(pence) {
  return escapeHtml(penceToPounds(pence).toFixed(2));
}

export function page(ctx, { title, body, wide = false }) {
  const loggedIn = Boolean(ctx.user);
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · UK Household Budget</title>
  <link rel="stylesheet" href="/assets/styles.css?v=${ASSET_VERSION}">
  <script src="/assets/app.js?v=${ASSET_VERSION}" defer></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="${loggedIn ? '/dashboard' : '/login'}">Household Budget</a>
    ${loggedIn ? nav(ctx) : ''}
  </header>
  <main class="${wide ? 'container wide' : 'container'}">
    ${message(ctx)}
    ${body}
  </main>
</body>
</html>`;
}

function nav(ctx) {
  const currentPath = ctx.url?.pathname || '';
  const items = [
    ['/dashboard', 'Dashboard'],
    ['/income', 'Income'],
    ['/expenses', 'Expenses'],
    ['/transactions', 'Transactions'],
    ['/savings', 'Savings goals'],
    ['/forecast', 'Forecast'],
    ['/reports', 'Reports'],
    ['/csv', 'CSV'],
    ['/settings', 'Settings']
  ];
  return `<nav class="site-nav">
    <div class="nav-links">
      ${items.map(([href, label]) => {
        const isActive = currentPath === href;
        return `<a class="${isActive ? 'active' : ''}" ${isActive ? 'aria-current="page"' : ''} href="${href}">${label}</a>`;
      }).join('\n      ')}
    </div>
    <form method="post" action="/logout" class="nav-form">
      ${csrfField(ctx)}
      <button class="logout-button" type="submit" title="Log out" aria-label="Log out">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20">
          <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M14 7l5 5-5 5M19 12H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </form>
  </nav>`;
}

function message(ctx) {
  const error = ctx.query.get('error');
  const success = ctx.query.get('success');
  if (error) return `<div class="flash error">${escapeHtml(error)}</div>`;
  if (success) return `<div class="flash success">${escapeHtml(success)}</div>`;
  return '';
}

export function card(title, content, extraClass = '') {
  return `<section class="card ${extraClass}"><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

export function stat(label, pence, tone = '') {
  return `<div class="stat ${tone}"><span>${escapeHtml(label)}</span><strong>${formatCurrency(pence)}</strong></div>`;
}

export function signedStat(label, pence) {
  const tone = pence < 0 ? 'bad' : pence > 0 ? 'good' : '';
  return `<div class="stat ${tone}"><span>${escapeHtml(label)}</span><strong>${formatSignedCurrency(pence)}</strong></div>`;
}

export function ownerLabel(ownerType, members = []) {
  if (ownerType === 'shared') return 'Shared household';
  const member = members.find((row) => row.person_key === ownerType);
  if (member?.display_name) return member.display_name;
  return {
    person_a: 'Person A',
    person_b: 'Person B'
  }[ownerType] || ownerType;
}

export function typeLabel(type) {
  return {
    income: 'Income',
    expense: 'Expense',
    savings: 'Savings'
  }[type] || type;
}

export { formatCurrency, formatSignedCurrency };
