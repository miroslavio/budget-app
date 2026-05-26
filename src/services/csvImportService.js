import { parsePoundsToPence } from '../utils/money.js';
import { requireChoice, requireString } from '../utils/validation.js';
import { buildDuplicateKey, duplicateExists, findLatestCategorisedTransactionByDescription } from '../repositories/transactionRepository.js';

export function parseCsv(text) {
  const rows = [];
  const parsedRows = parseCsvRows(text);
  if (parsedRows.length === 0) return { headers: [], rows: [] };
  const headers = parsedRows[0].map((header) => header.trim());

  for (let index = 1; index < parsedRows.length; index += 1) {
    const cells = parsedRows[index];
    if (cells.every((cell) => !String(cell || '').trim())) continue;
    const raw = {};
    headers.forEach((header, cellIndex) => {
      raw[header] = cells[cellIndex] ?? '';
    });
    rows.push({ rowNumber: index + 1, raw });
  }

  return { headers, rows };
}

export function buildCsvImportReview(db, householdId, rows, mapping, defaults = {}, members = []) {
  return rows.map((row) => {
    const raw = row.raw_json ? JSON.parse(row.raw_json) : row.raw;

    try {
      const preview = normaliseCsvImportRow(db, householdId, raw, mapping, defaults, members);
      return {
        id: Number(row.id || 0) || row.rowNumber,
        rowNumber: row.row_number || row.rowNumber,
        status: preview.duplicate ? 'duplicate' : 'ready',
        errorMessage: preview.duplicate ? 'Possible duplicate: same date, amount, and description.' : '',
        ...preview
      };
    } catch (error) {
      return {
        id: Number(row.id || 0) || row.rowNumber,
        rowNumber: row.row_number || row.rowNumber,
        status: 'invalid',
        errorMessage: error.message,
        transactionDate: '',
        description: String(raw?.[mapping.description] || '').trim(),
        amountPence: 0,
        type: 'expense',
        ownerType: defaults.defaultOwnerType || 'shared',
        categoryName: '',
        duplicateKey: ''
      };
    }
  });
}

export function parseImportedDate(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Date is required.');

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    assertValidDate(year, month, day);
    return raw;
  }

  let match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) {
    const [, dayValue, monthValue, yearValue] = match;
    const day = Number(dayValue);
    const month = Number(monthValue);
    const year = Number(yearValue);
    assertValidDate(year, month, day);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  match = raw.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (match) {
    const [, yearValue, monthValue, dayValue] = match;
    const day = Number(dayValue);
    const month = Number(monthValue);
    const year = Number(yearValue);
    assertValidDate(year, month, day);
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  throw new Error('Date must use YYYY-MM-DD or DD/MM/YYYY format.');
}

function normaliseCsvImportRow(db, householdId, raw, mapping, defaults, members) {
  const transactionDate = parseImportedDate(requireString(readMappedValue(raw, mapping.date), 'Date', 40));
  const description = requireString(readMappedValue(raw, mapping.description), 'Description', 255);
  const { amountPence, inferredType } = parseImportedAmount(raw, mapping);
  const type = normaliseImportedType(readMappedValue(raw, mapping.type), inferredType);
  const matchedTransaction = findLatestCategorisedTransactionByDescription(db, householdId, description, type);
  const ownerType = resolveOwnerType(readMappedValue(raw, mapping.owner), members, defaults.defaultOwnerType, matchedTransaction?.owner_type);
  const categoryName =
    String(readMappedValue(raw, mapping.category) || '').trim() ||
    matchedTransaction?.category_name ||
    defaultCategoryName(type);
  const duplicateKey = buildDuplicateKey({ transactionDate, description, amountPence });

  return {
    transactionDate,
    description,
    amountPence,
    type,
    ownerType,
    categoryName,
    duplicateKey,
    duplicate: duplicateExists(db, householdId, duplicateKey)
  };
}

function parseImportedAmount(raw, mapping) {
  const amountValue = readMappedValue(raw, mapping.amount);
  const moneyInValue = readMappedValue(raw, mapping.moneyIn);
  const moneyOutValue = readMappedValue(raw, mapping.moneyOut);

  if (hasValue(amountValue)) {
    const signedAmountPence = parsePoundsToPence(amountValue);
    const amountPence = Math.abs(signedAmountPence);
    if (!amountPence) throw new Error('Amount must be greater than £0.00.');
    return {
      amountPence,
      inferredType: signedAmountPence < 0 ? 'expense' : 'income'
    };
  }

  const moneyInPence = hasValue(moneyInValue) ? Math.abs(parsePoundsToPence(moneyInValue)) : 0;
  const moneyOutPence = hasValue(moneyOutValue) ? Math.abs(parsePoundsToPence(moneyOutValue)) : 0;

  if (moneyInPence && moneyOutPence) {
    throw new Error('Each row must have either money in or money out, not both.');
  }

  if (moneyInPence) {
    return { amountPence: moneyInPence, inferredType: 'income' };
  }

  if (moneyOutPence) {
    return { amountPence: moneyOutPence, inferredType: 'expense' };
  }

  throw new Error('Amount is required.');
}

function resolveOwnerType(rawOwner, members, defaultOwnerType, suggestedOwnerType = '') {
  const normalised = normaliseOwner(rawOwner, members) || suggestedOwnerType || defaultOwnerType || 'shared';
  return requireChoice(normalised, ['person_a', 'person_b', 'shared'], 'Owner');
}

function normaliseImportedType(value, fallback = 'expense') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;

  const normalised = raw.replace(/\s+/g, '_');
  if (['income', 'credit', 'money_in', 'in'].includes(normalised)) return 'income';
  if (['savings', 'saving', 'transfer_to_savings'].includes(normalised)) return 'savings';
  if (['expense', 'spending', 'debit', 'money_out', 'out', 'payment'].includes(normalised)) return 'expense';

  return requireChoice(normalised, ['income', 'expense', 'savings'], 'Type');
}

function normaliseOwner(value, members = []) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const owner = raw.replace(/\s+/g, '_');
  if (['person_a', 'a', 'person_a_owner', 'first_member'].includes(owner)) return 'person_a';
  if (['person_b', 'b', 'person_b_owner', 'second_member'].includes(owner)) return 'person_b';
  if (['shared', 'shared_household', 'household'].includes(owner)) return 'shared';

  const matchedMember = members.find((member) => member.display_name && member.display_name.trim().toLowerCase() === raw);
  if (matchedMember?.person_key) return matchedMember.person_key;

  return owner;
}

function defaultCategoryName(type) {
  if (type === 'income') return 'Other income';
  if (type === 'savings') return 'Savings';
  return '';
}

function readMappedValue(raw, header) {
  if (!header) return '';
  return raw?.[header] ?? '';
}

function hasValue(value) {
  return String(value || '').trim() !== '';
}

function assertValidDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const valid =
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;

  if (!valid) throw new Error('Date is not valid.');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted && character === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && character === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
