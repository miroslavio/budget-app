import { parsePoundsToPence } from './money.js';

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

export function requireMoney(value, fieldName, { minPence = 1, allowNegative = false } = {}) {
  const pence = parseMoney(value, fieldName);
  validateMoneyRange(pence, fieldName, { minPence, allowNegative });
  return pence;
}

export function optionalMoney(value, fieldName, { defaultPence = 0, minPence = 0, allowNegative = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultPence;
  const pence = parseMoney(value, fieldName);
  validateMoneyRange(pence, fieldName, { minPence, allowNegative });
  return pence;
}

export function requireDecimal(value, fieldName, { min = null, max = null } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) throw new Error(`${fieldName} is required.`);
  const number = Number(trimmed);
  if (!Number.isFinite(number)) throw new Error(`${fieldName} must be a valid number.`);
  if (min !== null && number < min) throw new Error(rangeError(fieldName, min, max));
  if (max !== null && number > max) throw new Error(rangeError(fieldName, min, max));
  return number;
}

function parseMoney(value, fieldName) {
  try {
    return parsePoundsToPence(value);
  } catch {
    throw new Error(`${fieldName} must be a valid GBP amount.`);
  }
}

function validateMoneyRange(pence, fieldName, { minPence, allowNegative }) {
  if (!allowNegative && pence < 0) throw new Error(`${fieldName} cannot be negative.`);
  if (minPence !== null && minPence !== undefined && pence < minPence) {
    if (minPence === 1) throw new Error(`${fieldName} must be greater than zero.`);
    if (minPence === 0) throw new Error(`${fieldName} cannot be negative.`);
    throw new Error(`${fieldName} must be at least £${(minPence / 100).toFixed(2)}.`);
  }
}

function rangeError(fieldName, min, max) {
  if (min !== null && max !== null) return `${fieldName} must be between ${min} and ${max}.`;
  if (min !== null) return `${fieldName} must be at least ${min}.`;
  return `${fieldName} must be no more than ${max}.`;
}
