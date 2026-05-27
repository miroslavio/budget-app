import { escapeHtml } from './html.js';

export function renderSetupChecklist(items) {
  const essentialItems = items.filter((item) => !item.optional);
  const incompleteEssentials = essentialItems.filter((item) => !item.complete);
  if (!incompleteEssentials.length) return '';
  const completedEssentials = essentialItems.filter((item) => item.complete).length;

  return `<section class="card setup-checklist" aria-labelledby="setup-checklist-title">
    <div class="card-heading">
      <div>
        <h2 id="setup-checklist-title">Set up your budget plan</h2>
        <p class="hint">Your budget is not fully set up yet. Complete these steps to see a useful dashboard and forecast.</p>
      </div>
      <span class="setup-progress">${completedEssentials} of ${essentialItems.length} essentials complete</span>
    </div>
    <div class="setup-steps">
      ${items.map((item) => setupStep(item)).join('')}
    </div>
  </section>`;
}

function setupStep(item) {
  const complete = Boolean(item.complete);
  return `<article class="setup-step${complete ? ' complete' : ''}">
    <div class="setup-status" aria-hidden="true">${complete ? checkIcon() : circleIcon()}</div>
    <div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
    </div>
    ${complete
      ? '<span class="setup-done">Done</span>'
      : item.actionHtml
        ? `<div class="setup-actions">${item.actionHtml}</div>`
      : item.optional
        ? `<a class="button secondary" href="${escapeHtml(item.href)}">${escapeHtml(item.action || 'Review')}</a>`
        : `<a class="button secondary" href="${escapeHtml(item.href)}">${escapeHtml(item.action || 'Open')}</a>`}
  </article>`;
}

function checkIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
    <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function circleIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
    <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}
