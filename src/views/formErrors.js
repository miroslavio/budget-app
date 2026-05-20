import { escapeHtml } from './html.js';

export function formErrorSummary(fieldErrors = {}) {
  const entries = Object.entries(fieldErrors);
  if (!entries.length) return '';

  return `<div class="form-error-summary" role="alert">
    <h3>Check these fields</h3>
    <ul>${entries.map(([field, message]) => `<li><a href="#${escapeHtml(field)}">${escapeHtml(message)}</a></li>`).join('')}</ul>
  </div>`;
}

export function fieldError(fieldErrors = {}, fieldName) {
  if (!fieldErrors[fieldName]) return '';
  return `<p class="field-error" id="${escapeHtml(fieldName)}-error">${escapeHtml(fieldErrors[fieldName])}</p>`;
}
