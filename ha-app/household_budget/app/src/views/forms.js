import { escapeHtml, ownerLabel, selected } from './html.js';

export function moneyInputAttrs({ required = false, min = '0', allowNegative = false } = {}) {
  return decimalInputAttrs({
    required,
    min: allowNegative ? min : min,
    allowNegative,
    decimals: 2,
    step: '0.01',
    money: true
  });
}

export function decimalInputAttrs({ required = false, min = null, max = null, allowNegative = false, decimals = 2, step = '0.01', money = false } = {}) {
  const attrs = [
    'type="number"',
    'inputmode="decimal"',
    `step="${escapeHtml(step)}"`,
    'data-number-input',
    `data-decimals="${escapeHtml(decimals)}"`
  ];

  if (money) attrs.push('data-money-input');
  if (required) attrs.push('required');
  if (allowNegative) attrs.push('data-allow-negative="true"');
  if (min !== null && min !== undefined) attrs.push(`min="${escapeHtml(min)}"`);
  if (max !== null && max !== undefined) attrs.push(`max="${escapeHtml(max)}"`);

  return attrs.join(' ');
}

export function categoryOptions(categories, selectedId = '') {
  return categories
    .map((category) => `<option value="${category.id}" ${selected(String(category.id), String(selectedId))}>${escapeHtml(category.name)}</option>`)
    .join('');
}

export function ownerOptions(value = 'shared', members = []) {
  return [
    ['person_a', ownerLabel('person_a', members)],
    ['person_b', ownerLabel('person_b', members)],
    ['shared', 'Shared household']
  ]
    .map(([key, label]) => `<option value="${key}" ${selected(value, key)}>${escapeHtml(label)}</option>`)
    .join('');
}

export function frequencyOptions(value = 'monthly') {
  return [
    ['monthly', 'Monthly'],
    ['yearly', 'Yearly']
  ]
    .map(([key, label]) => `<option value="${key}" ${selected(value, key)}>${label}</option>`)
    .join('');
}

export function taxYearOptions(taxYears, value = '') {
  return taxYears
    .map((taxYear) => `<option value="${taxYear}" ${selected(value, taxYear)}>${taxYear.replace('-', ' to ')}</option>`)
    .join('');
}
