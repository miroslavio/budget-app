import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createCategory, findOrCreateCategory, listCategories } from '../repositories/categoryRepository.js';

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

function openTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-categories-'));
  const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  return db;
}
