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

export function listImportRows(db, householdId, batchId) {
  return db
    .prepare(
      `SELECT csv_import_rows.*
       FROM csv_import_rows
       JOIN csv_import_batches ON csv_import_batches.id = csv_import_rows.batch_id
       WHERE csv_import_batches.household_id = ? AND csv_import_rows.batch_id = ?
       ORDER BY csv_import_rows.row_number`
    )
    .all(householdId, batchId);
}

export function findImportBatch(db, householdId, batchId) {
  return db.prepare('SELECT * FROM csv_import_batches WHERE household_id = ? AND id = ?').get(householdId, batchId);
}

export function updateImportRowStatus(db, householdId, rowId, status, errorMessage = null, transactionId = null) {
  db.prepare(
    `UPDATE csv_import_rows
     SET status = ?, error_message = ?, transaction_id = ?
     WHERE id = ?
       AND batch_id IN (SELECT id FROM csv_import_batches WHERE household_id = ?)`
  ).run(status, errorMessage, transactionId, rowId, householdId);
}

export function updateImportBatchStatus(db, householdId, batchId, status, { errorCount = 0, importedCount = 0 } = {}) {
  db.prepare(
    'UPDATE csv_import_batches SET status = ?, error_count = ?, imported_count = ? WHERE id = ? AND household_id = ?'
  ).run(status, errorCount, importedCount, batchId, householdId);
}
