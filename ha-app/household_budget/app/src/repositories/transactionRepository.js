import crypto from 'node:crypto';

export function buildDuplicateKey({ transactionDate, description, amountPence }) {
  return crypto
    .createHash('sha256')
    .update(`${transactionDate}|${String(description || '').trim().toLowerCase()}|${amountPence}`)
    .digest('hex');
}

export function createTransaction(db, transaction) {
  const duplicateKey = transaction.duplicateKey || buildDuplicateKey(transaction);
  const result = db
    .prepare(
      `INSERT INTO transactions (
        household_id, transaction_date, description, amount_pence, type, category_id,
        owner_type, source, notes, duplicate_key, csv_import_batch_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      transaction.householdId,
      transaction.transactionDate,
      transaction.description,
      transaction.amountPence,
      transaction.type,
      transaction.categoryId,
      transaction.ownerType,
      transaction.source,
      transaction.notes || null,
      duplicateKey,
      transaction.csvImportBatchId || null,
      transaction.createdBy || null
    );
  return findTransactionById(db, transaction.householdId, result.lastInsertRowid);
}

export function updateTransaction(db, transaction) {
  const duplicateKey = transaction.duplicateKey || buildDuplicateKey(transaction);
  db.prepare(
    `UPDATE transactions
     SET transaction_date = ?, description = ?, amount_pence = ?, type = ?, category_id = ?,
         owner_type = ?, notes = ?, duplicate_key = ?
     WHERE household_id = ? AND id = ?`
  ).run(
    transaction.transactionDate,
    transaction.description,
    transaction.amountPence,
    transaction.type,
    transaction.categoryId,
    transaction.ownerType,
    transaction.notes || null,
    duplicateKey,
    transaction.householdId,
    transaction.id
  );
  return findTransactionById(db, transaction.householdId, transaction.id);
}

export function duplicateExists(db, householdId, duplicateKey) {
  return Boolean(db.prepare('SELECT id FROM transactions WHERE household_id = ? AND duplicate_key = ?').get(householdId, duplicateKey));
}

export function findTransactionById(db, householdId, id) {
  return db
    .prepare(
      `SELECT transactions.*, categories.name AS category_name
       FROM transactions
       LEFT JOIN categories ON categories.id = transactions.category_id
       WHERE transactions.household_id = ? AND transactions.id = ?`
    )
    .get(householdId, id);
}

export function listTransactions(db, householdId, filters = {}) {
  const clauses = ['transactions.household_id = ?'];
  const params = [householdId];
  if (filters.startDate) {
    clauses.push('transactions.transaction_date >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push('transactions.transaction_date <= ?');
    params.push(filters.endDate);
  }
  if (filters.type) {
    clauses.push('transactions.type = ?');
    params.push(filters.type);
  }
  if (filters.ownerType) {
    clauses.push('transactions.owner_type = ?');
    params.push(filters.ownerType);
  }
  return db
    .prepare(
      `SELECT transactions.*, categories.name AS category_name
       FROM transactions
       LEFT JOIN categories ON categories.id = transactions.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY transactions.transaction_date DESC, transactions.id DESC`
    )
    .all(...params);
}

export function findLatestCategorisedTransactionByDescription(db, householdId, description, type = null) {
  const clauses = [
    'transactions.household_id = ?',
    'lower(trim(transactions.description)) = lower(trim(?))',
    'transactions.category_id IS NOT NULL'
  ];
  const params = [householdId, description];

  if (type) {
    clauses.push('transactions.type = ?');
    params.push(type);
  }

  return db
    .prepare(
      `SELECT transactions.*, categories.name AS category_name
       FROM transactions
       LEFT JOIN categories ON categories.id = transactions.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY transactions.transaction_date DESC, transactions.id DESC
       LIMIT 1`
    )
    .get(...params);
}

export function deleteTransaction(db, householdId, id) {
  db.prepare('DELETE FROM transactions WHERE household_id = ? AND id = ?').run(householdId, id);
}
