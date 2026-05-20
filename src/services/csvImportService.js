import { parsePoundsToPence } from '../utils/money.js';
import { requireChoice, requireString } from '../utils/validation.js';
import { buildDuplicateKey, duplicateExists } from '../repositories/transactionRepository.js';

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

export function validateCsvTransactionRow(db, householdId, raw, mapping) {
  const transactionDate = requireString(raw[mapping.date], 'Date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  const description = requireString(raw[mapping.description], 'Description', 255);
  const amountPence = Math.abs(parsePoundsToPence(raw[mapping.amount]));
  const type = requireChoice(String(raw[mapping.type] || '').trim().toLowerCase(), ['income', 'expense', 'savings'], 'Type');
  const ownerType = requireChoice(normaliseOwner(raw[mapping.owner]), ['person_a', 'person_b', 'shared'], 'Owner');
  const categoryName = String(raw[mapping.category] || '').trim() || (type === 'income' ? 'Other income' : 'Discretionary spending');
  const duplicateKey = buildDuplicateKey({ transactionDate, description, amountPence });
  const duplicate = duplicateExists(db, householdId, duplicateKey);

  return {
    transactionDate,
    description,
    amountPence,
    type,
    ownerType,
    categoryName,
    duplicateKey,
    duplicate
  };
}

function normaliseOwner(value) {
  const owner = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (['person_a', 'a', 'person_a_owner'].includes(owner)) return 'person_a';
  if (['person_b', 'b', 'person_b_owner'].includes(owner)) return 'person_b';
  if (['shared', 'shared_household', 'household'].includes(owner)) return 'shared';
  return owner;
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
