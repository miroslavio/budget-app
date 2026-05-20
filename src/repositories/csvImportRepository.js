export function createImportBatch(db, batch) {
  const result = db
    .prepare('INSERT INTO csv_import_batches (household_id, original_filename, created_by) VALUES (?, ?, ?)')
    .run(batch.householdId, batch.originalFilename || null, batch.createdBy);
  return result.lastInsertRowid;
}

export function addImportRows(db, batchId, rows) {
  const statement = db.prepare('INSERT INTO csv_import_rows (batch_id, row_number, raw_json) VALUES (?, ?, ?)');
  for (const row of rows) {
    statement.run(batchId, row.rowNumber, JSON.stringify(row.raw));
  }
}

export function listImportRows(db, batchId) {
  return db.prepare('SELECT * FROM csv_import_rows WHERE batch_id = ? ORDER BY row_number').all(batchId);
}

export function findImportBatch(db, householdId, batchId) {
  return db.prepare('SELECT * FROM csv_import_batches WHERE household_id = ? AND id = ?').get(householdId, batchId);
}

export function updateImportRowStatus(db, rowId, status, errorMessage = null, transactionId = null) {
  db.prepare('UPDATE csv_import_rows SET status = ?, error_message = ?, transaction_id = ? WHERE id = ?').run(
    status,
    errorMessage,
    transactionId,
    rowId
  );
}

export function updateImportBatchStatus(db, batchId, status, { errorCount = 0, importedCount = 0 } = {}) {
  db.prepare('UPDATE csv_import_batches SET status = ?, error_count = ?, imported_count = ? WHERE id = ?').run(
    status,
    errorCount,
    importedCount,
    batchId
  );
}
