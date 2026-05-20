export function requireString(value, fieldName, maxLength = 255) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${fieldName} is required.`);
  if (trimmed.length > maxLength) throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  return trimmed;
}

export function optionalString(value, maxLength = 1000) {
  const trimmed = String(value || '').trim();
  if (trimmed.length > maxLength) throw new Error(`Value must be ${maxLength} characters or fewer.`);
  return trimmed || null;
}

export function requireChoice(value, choices, fieldName) {
  if (!choices.includes(value)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return value;
}

export function parsePercentage(value, fallback = 50) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error('Percentage must be between 0 and 100.');
  }
  return number;
}

export function normaliseEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new Error('Enter a valid email address.');
  return value;
}
