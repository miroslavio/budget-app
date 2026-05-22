import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/database.js';
import { createCategory, deleteCategory, findOrCreateCategory, listCategories, updateCategory } from '../repositories/categoryRepository.js';

test('users can add custom expense categories alongside built-ins', () => {
  const db = openTestDatabase();
  db.prepare("INSERT INTO categories (name, kind, is_default) VALUES (?, ?, 1)").run('Utilities', 'expense');

  const customCategory = createCategory(db, {
    name: 'Pet care',
    kind: 'expense'
  });

  const categories = listCategories(db, null, 'expense');
  assert.equal(categories.length, 2);
  assert.equal(categories[0].name, 'Pet care');
  assert.equal(categories[0].is_default, 0);
  assert.equal(categories[1].name, 'Utilities');

  const found = findOrCreateCategory(db, 'Pet care', 'expense');
  assert.equal(found.id, customCategory.id);
});

test('categories can be renamed and deleted', () => {
  const db = openTestDatabase();
  const category = createCategory(db, { name: 'Dining out', kind: 'expense' });

  updateCategory(db, { id: category.id, name: 'Restaurants', kind: 'expense' });
  assert.equal(db.prepare('SELECT name FROM categories WHERE id = ?').get(category.id).name, 'Restaurants');

  deleteCategory(db, category.id);
  assert.equal(db.prepare('SELECT id FROM categories WHERE id = ?').get(category.id), undefined);
});

test('standard categories are seeded once when the table is empty', () => {
  const db = openTestDatabase();

  runMigrations(db);

  const categories = listCategories(db, null, 'expense');
  assert.equal(categories.length > 0, true);
  assert.equal(categories.some((category) => category.name === 'Groceries'), true);
  assert.equal(categories.some((category) => category.name === 'Subscriptions'), true);
});

function openTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-categories-'));
  const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  return db;
}
