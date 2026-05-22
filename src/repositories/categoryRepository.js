export function listCategories(db, householdId = null, kind = null) {
  const sql = `SELECT * FROM categories ${kind ? 'WHERE kind = ?' : ''} ORDER BY kind, name`;
  const statement = db.prepare(sql);
  return kind ? statement.all(kind) : statement.all();
}

export function listCategoriesByKind(db, kind, householdId = null) {
  return listCategories(db, householdId, kind);
}

export function findCategoryById(db, id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function findOrCreateCategory(db, name, kind, householdId = null) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existing = db.prepare('SELECT * FROM categories WHERE kind = ? AND lower(name) = lower(?)').get(kind, trimmed);
  if (existing) return existing;
  const result = db.prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 0)').run(trimmed, kind);
  return findCategoryById(db, result.lastInsertRowid);
}

export function createCategory(db, { name, kind, householdId = null, isDefault = false }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category name is required.');
  const existing = db.prepare('SELECT id FROM categories WHERE kind = ? AND lower(name) = lower(?)').get(kind, trimmed);
  if (existing) throw new Error('A category with that name already exists.');
  const result = db
    .prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, ?)')
    .run(trimmed, kind, isDefault ? 1 : 0);
  return findCategoryById(db, result.lastInsertRowid);
}

export function updateCategory(db, { id, name, kind }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category name is required.');

  const category = findCategoryById(db, id);
  if (!category) throw new Error('Category was not found.');

  const duplicate = db
    .prepare('SELECT id FROM categories WHERE kind = ? AND lower(name) = lower(?) AND id != ?')
    .get(kind || category.kind, trimmed, id);
  if (duplicate) throw new Error('A category with that name already exists.');

  db.prepare('UPDATE categories SET name = ?, kind = ? WHERE id = ?').run(trimmed, kind || category.kind, id);
  return findCategoryById(db, id);
}

export function deleteCategory(db, id) {
  const category = findCategoryById(db, id);
  if (!category) throw new Error('Category was not found.');

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE budget_items SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('UPDATE transactions SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
