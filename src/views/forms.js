import { escapeHtml, selected } from './html.js';

export function categoryOptions(categories, selectedId = '') {
  return categories
    .map((category) => `<option value="${category.id}" ${selected(String(category.id), String(selectedId))}>${escapeHtml(category.name)}</option>`)
    .join('');
}

export function ownerOptions(value = 'shared', members = []) {
  const labelFor = (key, fallback) => {
    const member = members.find((row) => row.person_key === key);
    return member?.display_name || fallback;
  };

  return [
    ['person_a', labelFor('person_a', 'Person A')],
    ['person_b', labelFor('person_b', 'Person B')],
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
