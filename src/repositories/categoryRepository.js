const STANDARD_CATEGORIES = [
  { name: 'Salary', kind: 'income' },
  { name: 'Other income', kind: 'income' },
  { name: 'Savings', kind: 'savings' },
  { name: 'Rent', kind: 'expense' },
  { name: 'Mortgage', kind: 'expense' },
  { name: 'Mortgage overpayment', kind: 'expense' },
  { name: 'Council tax', kind: 'expense' },
  { name: 'Energy bill', kind: 'expense' },
  { name: 'Broadband', kind: 'expense' },
  { name: 'Mobile phone', kind: 'expense' },
  { name: 'TV licence', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Groceries', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Insurance', kind: 'expense' },
  { name: 'Subscriptions', kind: 'expense' },
  { name: 'Gym membership', kind: 'expense' },
  { name: 'Discretionary spending', kind: 'expense' },
  { name: 'Debt repayment', kind: 'debt' }
];

export function listCategories(db, householdId = null, kind = null) {
  if (!householdId) {
    const sql = `SELECT * FROM categories ${kind ? 'WHERE kind = ?' : ''} ORDER BY kind, name`;
    const statement = db.prepare(sql);
    return kind ? statement.all(kind) : statement.all();
  }

  ensureStandardCategoriesForHousehold(db, householdId);

  const clauses = ['household_categories.household_id = ?'];
  const params = [householdId];
  if (kind) {
    clauses.push('categories.kind = ?');
    params.push(kind);
  }

  return db
    .prepare(
      `SELECT categories.*
       FROM categories
       JOIN household_categories ON household_categories.category_id = categories.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY categories.kind, categories.name`
    )
    .all(...params);
}

export function listCategoriesByKind(db, kind, householdId = null) {
  return listCategories(db, householdId, kind);
}

export function findCategoryById(db, householdId, id) {
  if (!id) return null;
  if (!householdId) {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  return db
    .prepare(
      `SELECT categories.*
       FROM categories
       JOIN household_categories ON household_categories.category_id = categories.id
       WHERE household_categories.household_id = ? AND categories.id = ?`
    )
    .get(householdId, id);
}

export function findOrCreateCategory(db, name, kind, householdId = null) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  if (!householdId) throw new Error('Household category access requires a household.');

  ensureStandardCategoriesForHousehold(db, householdId);

  const existing = findGlobalCategoryByName(db, trimmed, kind);
  if (existing) {
    linkCategoryToHousehold(db, householdId, existing.id);
    return findCategoryById(db, householdId, existing.id);
  }

  const result = db.prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 0)').run(trimmed, kind);
  linkCategoryToHousehold(db, householdId, result.lastInsertRowid);
  return findCategoryById(db, householdId, result.lastInsertRowid);
}

export function createCategory(db, { name, kind, householdId = null, isDefault = false }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category name is required.');
  if (!householdId) throw new Error('Household category access requires a household.');

  ensureStandardCategoriesForHousehold(db, householdId);

  const existing = findGlobalCategoryByName(db, trimmed, kind);
  if (existing) {
    if (isCategoryLinkedToHousehold(db, householdId, existing.id)) {
      throw new Error('A category with that name already exists.');
    }
    linkCategoryToHousehold(db, householdId, existing.id);
    return findCategoryById(db, householdId, existing.id);
  }

  const result = db
    .prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, ?)')
    .run(trimmed, kind, isDefault ? 1 : 0);
  linkCategoryToHousehold(db, householdId, result.lastInsertRowid);
  return findCategoryById(db, householdId, result.lastInsertRowid);
}

export function updateCategory(db, { householdId, id, name, kind }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category name is required.');
  if (!householdId) throw new Error('Household category access requires a household.');

  const category = findCategoryById(db, householdId, id);
  if (!category) throw new Error('Category was not found.');

  const targetKind = kind || category.kind;
  const existing = findGlobalCategoryByName(db, trimmed, targetKind);
  if (existing?.id === category.id) return category;

  db.exec('BEGIN');
  try {
    if (existing) {
      linkCategoryToHousehold(db, householdId, existing.id);
      reassignHouseholdCategoryReferences(db, householdId, category.id, existing.id);
      unlinkCategoryFromHousehold(db, householdId, category.id);
      deleteOrphanCategory(db, category.id);
      db.exec('COMMIT');
      return findCategoryById(db, householdId, existing.id);
    }

    if (categoryLinkCount(db, category.id) > 1 || Number(category.is_default) === 1) {
      const result = db.prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 0)').run(trimmed, targetKind);
      const replacementId = result.lastInsertRowid;
      linkCategoryToHousehold(db, householdId, replacementId);
      reassignHouseholdCategoryReferences(db, householdId, category.id, replacementId);
      unlinkCategoryFromHousehold(db, householdId, category.id);
      deleteOrphanCategory(db, category.id);
      db.exec('COMMIT');
      return findCategoryById(db, householdId, replacementId);
    }

    db.prepare('UPDATE categories SET name = ?, kind = ?, is_default = 0 WHERE id = ?').run(trimmed, targetKind, id);
    db.exec('COMMIT');
    return findCategoryById(db, householdId, id);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function deleteCategory(db, householdId, id) {
  if (!householdId) throw new Error('Household category access requires a household.');

  const category = findCategoryById(db, householdId, id);
  if (!category) throw new Error('Category was not found.');

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE budget_items SET category_id = NULL WHERE household_id = ? AND category_id = ?').run(householdId, id);
    db.prepare('UPDATE transactions SET category_id = NULL WHERE household_id = ? AND category_id = ?').run(householdId, id);
    db.prepare('DELETE FROM category_budgets WHERE household_id = ? AND category_id = ?').run(householdId, id);
    db.prepare('DELETE FROM category_budget_defaults WHERE household_id = ? AND category_id = ?').run(householdId, id);
    unlinkCategoryFromHousehold(db, householdId, id);
    deleteOrphanCategory(db, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function ensureStandardCategoriesForHousehold(db, householdId) {
  if (!householdId) return;

  for (const definition of STANDARD_CATEGORIES) {
    const existing = findGlobalCategoryByName(db, definition.name, definition.kind)
      || createGlobalCategory(db, definition.name, definition.kind, true);
    linkCategoryToHousehold(db, householdId, existing.id);
  }
}

function createGlobalCategory(db, name, kind, isDefault = false) {
  const result = db
    .prepare('INSERT INTO categories (name, kind, is_default) VALUES (?, ?, ?)')
    .run(name, kind, isDefault ? 1 : 0);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
}

function findGlobalCategoryByName(db, name, kind) {
  return db
    .prepare('SELECT * FROM categories WHERE kind = ? AND lower(name) = lower(?) ORDER BY is_default DESC, id LIMIT 1')
    .get(kind, String(name || '').trim());
}

function isCategoryLinkedToHousehold(db, householdId, categoryId) {
  return Boolean(
    db.prepare('SELECT 1 FROM household_categories WHERE household_id = ? AND category_id = ?').get(householdId, categoryId)
  );
}

function linkCategoryToHousehold(db, householdId, categoryId) {
  db.prepare('INSERT OR IGNORE INTO household_categories (household_id, category_id) VALUES (?, ?)').run(householdId, categoryId);
}

function unlinkCategoryFromHousehold(db, householdId, categoryId) {
  db.prepare('DELETE FROM household_categories WHERE household_id = ? AND category_id = ?').run(householdId, categoryId);
}

function categoryLinkCount(db, categoryId) {
  return Number(db.prepare('SELECT COUNT(*) AS count FROM household_categories WHERE category_id = ?').get(categoryId)?.count || 0);
}

function deleteOrphanCategory(db, categoryId) {
  const stillLinked = categoryLinkCount(db, categoryId) > 0;
  if (stillLinked) return;

  const stillUsed = db
    .prepare(
      `SELECT 1
       WHERE EXISTS (SELECT 1 FROM budget_items WHERE category_id = ?)
          OR EXISTS (SELECT 1 FROM transactions WHERE category_id = ?)
          OR EXISTS (SELECT 1 FROM category_budgets WHERE category_id = ?)
          OR EXISTS (SELECT 1 FROM category_budget_defaults WHERE category_id = ?)`
    )
    .get(categoryId, categoryId, categoryId, categoryId);

  if (stillUsed) return;
  db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
}

function reassignHouseholdCategoryReferences(db, householdId, fromCategoryId, toCategoryId) {
  db.prepare('UPDATE budget_items SET category_id = ? WHERE household_id = ? AND category_id = ?').run(toCategoryId, householdId, fromCategoryId);
  db.prepare('UPDATE transactions SET category_id = ? WHERE household_id = ? AND category_id = ?').run(toCategoryId, householdId, fromCategoryId);
  db.prepare('UPDATE category_budgets SET category_id = ? WHERE household_id = ? AND category_id = ?').run(toCategoryId, householdId, fromCategoryId);
  db.prepare('UPDATE category_budget_defaults SET category_id = ? WHERE household_id = ? AND category_id = ?').run(toCategoryId, householdId, fromCategoryId);
}
