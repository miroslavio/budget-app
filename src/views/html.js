import { formatCurrency, formatSignedCurrency, penceToPounds } from '../utils/money.js';

const ASSET_VERSION = '2026-06-04-ha-auth';

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

export function actionIconButton({ label, icon, variant = 'edit', type = 'button', attributes = '' }) {
  return `<button type="${escapeHtml(type)}" class="action-icon-button ${escapeHtml(variant)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${attributes ? ` ${attributes}` : ''}>
    ${actionIcon(icon)}
    <span class="sr-only">${escapeHtml(label)}</span>
  </button>`;
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
  <script src="/vendor/echarts/echarts.min.js?v=${ASSET_VERSION}" defer></script>
  <script src="/assets/app.js?v=${ASSET_VERSION}" defer></script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/dashboard">
      <span class="brand-mark" aria-hidden="true">${brandIcon()}</span>
      <span>Household Budget</span>
    </a>
    ${loggedIn ? nav(ctx) : ''}
  </header>
  <main class="${wide ? 'container wide' : 'container'}">
    ${message(ctx)}
    ${body}
  </main>
  ${confirmDialogMarkup()}
</body>
</html>`;
}

function nav(ctx) {
  const currentPath = ctx.url?.pathname || '';
  const items = [
    { href: '/dashboard', label: 'Dashboard', matches: ['/dashboard'] },
    { href: '/budget-plan', label: 'Budget Plan', matches: ['/budget-plan', '/income', '/expenses'] },
    { href: '/transactions', label: 'Actuals', matches: ['/transactions'] },
    { href: '/savings', label: 'Savings & goals', matches: ['/savings'] },
    { href: '/forecast', label: 'Forecast', matches: ['/forecast'] },
    { href: '/csv', label: 'Import/Export', matches: ['/csv', '/csv/preview', '/export'] },
    { href: '/settings', label: 'Settings', matches: ['/settings'] }
  ];
  return `<nav class="site-nav">
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav-panel" aria-label="Open menu" data-mobile-nav-toggle>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22">
        <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
    <div class="nav-panel" id="site-nav-panel" data-mobile-nav-panel>
      <div class="nav-links">
        ${items.map(({ href, label, matches }) => {
          const isActive = matches.some((match) => currentPath === match || currentPath.startsWith(`${match}/`));
          return `<a class="${isActive ? 'active' : ''}" ${isActive ? 'aria-current="page"' : ''} href="${href}">${label}</a>`;
        }).join('\n        ')}
      </div>
    </div>
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

export function stat(label, pence, tone = '', note = '') {
  return `<div class="stat ${tone}"><span>${escapeHtml(label)}</span><strong>${formatCurrency(pence)}</strong>${note ? `<small class="plan-stat-note">${escapeHtml(note)}</small>` : ''}</div>`;
}

export function signedStat(label, pence) {
  const tone = pence < 0 ? 'bad' : pence > 0 ? 'good' : '';
  return `<div class="stat ${tone}"><span>${escapeHtml(label)}</span><strong>${formatSignedCurrency(pence)}</strong></div>`;
}

export function movementStat(label, pence, note = '') {
  const tone = pence < 0 ? 'bad' : pence > 0 ? 'good' : '';
  return `<div class="stat ${tone}"><span>${escapeHtml(label)}</span><strong>${formatSignedCurrency(pence)}</strong>${note ? `<small class="plan-stat-note">${escapeHtml(note)}</small>` : ''}</div>`;
}

export function signedValueLabel(pence) {
  const value = Number(pence || 0);
  const tone = value < 0 ? 'bad' : value > 0 ? 'good' : '';
  return `<span class="context-value ${escapeHtml(tone)}">${formatSignedCurrency(value)}</span>`;
}

export function varianceText(pence, kind = 'generic') {
  const value = Number(pence || 0);
  const amount = formatCurrency(Math.abs(value));
  if (value === 0) {
    return { text: 'On track', tone: '' };
  }

  switch (kind) {
    case 'income':
      return value > 0
        ? { text: `${amount} above plan`, tone: 'good' }
        : { text: `${amount} below plan`, tone: 'bad' };
    case 'expense':
      return value > 0
        ? { text: `${amount} over plan`, tone: 'bad' }
        : { text: `${amount} under plan`, tone: 'good' };
    case 'savings':
      return value > 0
        ? { text: `${amount} above target`, tone: 'good' }
        : { text: `${amount} below target`, tone: 'bad' };
    case 'surplus':
      return value > 0
        ? { text: `${amount} ahead of plan`, tone: 'good' }
        : { text: `${amount} below plan`, tone: 'bad' };
    case 'budget':
      return value > 0
        ? { text: `${amount} over budget`, tone: 'bad' }
        : { text: `${amount} under budget`, tone: 'good' };
    default:
      return value > 0
        ? { text: `${amount} above plan`, tone: 'good' }
        : { text: `${amount} below plan`, tone: 'bad' };
  }
}

export function varianceLabel(pence, kind = 'generic') {
  const { text, tone } = varianceText(pence, kind);
  return `<span class="context-value ${escapeHtml(tone)}">${escapeHtml(text)}</span>`;
}

export function ownerLabel(ownerType, members = []) {
  if (ownerType === 'shared') return 'Shared household';
  const member = members.find((row) => row.person_key === ownerType);
  if (member?.display_name) return member.display_name;
  return {
    person_a: 'First member',
    person_b: 'Second member'
  }[ownerType] || ownerType;
}

export function typeLabel(type) {
  return {
    income: 'Income',
    expense: 'Spending',
    savings: 'Savings'
  }[type] || type;
}

export { formatCurrency, formatSignedCurrency };

function brandIcon() {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22">
    <path d="M4.5 10.5L12 4l7.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 19v-8.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M10 9.5h4M10 13h3.2M9.8 16.5h4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function actionIcon(name) {
  switch (name) {
    case 'delete':
      return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
        <path d="M4 7h16M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case 'pause':
      return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
        <path d="M9 6v12M15 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case 'play':
      return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
        <path d="M9 7l8 5-8 5V7z" fill="currentColor"/>
      </svg>`;
    case 'plus':
      return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case 'view':
      return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/>
      </svg>`;
    case 'edit':
    default:
      return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18">
        <path d="M4 20l4.5-1 9-9-3.5-3.5-9 9L4 20zM13.5 6.5l3.5 3.5M4 20h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
}

function confirmDialogMarkup() {
  return `<dialog id="confirm-modal" class="modal confirm-modal" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
    <div class="modal-panel confirm-modal-panel">
      <div class="modal-heading">
        <div>
          <h2 id="confirm-modal-title">Confirm action</h2>
        </div>
      </div>
      <p id="confirm-modal-message" class="confirm-modal-message">Are you sure?</p>
      <div class="button-list confirm-modal-actions">
        <button type="button" class="secondary" data-confirm-cancel>Cancel</button>
        <button type="button" class="danger-button" data-confirm-accept>Confirm</button>
      </div>
    </div>
  </dialog>`;
}
