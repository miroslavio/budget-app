import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../db/database.js';
import { createCategory, deleteCategory, findOrCreateCategory, listCategories, updateCategory } from '../repositories/categoryRepository.js';

test('households only see their own custom categories', () => {
  const db = openTestDatabase();
  const firstHouseholdId = createHousehold(db, 'Household one');
  const secondHouseholdId = createHousehold(db, 'Household two');

  createCategory(db, {
    householdId: firstHouseholdId,
    name: 'Pet care',
    kind: 'expense'
  });

  const firstHouseholdCategories = listCategories(db, firstHouseholdId, 'expense');
  const secondHouseholdCategories = listCategories(db, secondHouseholdId, 'expense');

  assert.equal(firstHouseholdCategories.some((category) => category.name === 'Pet care'), true);
  assert.equal(secondHouseholdCategories.some((category) => category.name === 'Pet care'), false);
});

test('same category name can be used by multiple households without sharing later edits', () => {
  const db = openTestDatabase();
  const firstHouseholdId = createHousehold(db, 'Household one');
  const secondHouseholdId = createHousehold(db, 'Household two');

  const firstCategory = createCategory(db, {
    householdId: firstHouseholdId,
    name: 'Pet care',
    kind: 'expense'
  });
  createCategory(db, {
    householdId: secondHouseholdId,
    name: 'Pet care',
    kind: 'expense'
  });

  updateCategory(db, {
    householdId: firstHouseholdId,
    id: firstCategory.id,
    name: 'Vet care',
    kind: 'expense'
  });

  const firstHouseholdCategories = listCategories(db, firstHouseholdId, 'expense');
  const secondHouseholdCategories = listCategories(db, secondHouseholdId, 'expense');

  assert.equal(firstHouseholdCategories.some((category) => category.name === 'Vet care'), true);
  assert.equal(firstHouseholdCategories.some((category) => category.name === 'Pet care'), false);
  assert.equal(secondHouseholdCategories.some((category) => category.name === 'Pet care'), true);
  assert.equal(secondHouseholdCategories.some((category) => category.name === 'Vet care'), false);
});

test('deleting a category only removes it from the current household', () => {
  const db = openTestDatabase();
  const firstHouseholdId = createHousehold(db, 'Household one');
  const secondHouseholdId = createHousehold(db, 'Household two');

  const firstCategory = createCategory(db, {
    householdId: firstHouseholdId,
    name: 'Dining out',
    kind: 'expense'
  });
  createCategory(db, {
    householdId: secondHouseholdId,
    name: 'Dining out',
    kind: 'expense'
  });

  deleteCategory(db, firstHouseholdId, firstCategory.id);

  assert.equal(listCategories(db, firstHouseholdId, 'expense').some((category) => category.name === 'Dining out'), false);
  assert.equal(listCategories(db, secondHouseholdId, 'expense').some((category) => category.name === 'Dining out'), true);
});

test('standard categories are available to each household when categories are listed', () => {
  const db = openTestDatabase();
  const householdId = createHousehold(db, 'Household');

  const categories = listCategories(db, householdId, 'expense');
  assert.equal(categories.some((category) => category.name === 'Groceries'), true);
  assert.equal(categories.some((category) => category.name === 'Subscriptions'), true);
});

test('findOrCreateCategory reuses the household category mapping safely', () => {
  const db = openTestDatabase();
  const firstHouseholdId = createHousehold(db, 'Household one');
  const secondHouseholdId = createHousehold(db, 'Household two');

  const firstCategory = findOrCreateCategory(db, 'Travel extras', 'expense', firstHouseholdId);
  const secondCategory = findOrCreateCategory(db, 'Travel extras', 'expense', secondHouseholdId);

  assert.equal(firstCategory.name, 'Travel extras');
  assert.equal(secondCategory.name, 'Travel extras');
  assert.equal(listCategories(db, firstHouseholdId, 'expense').some((category) => category.name === 'Travel extras'), true);
  assert.equal(listCategories(db, secondHouseholdId, 'expense').some((category) => category.name === 'Travel extras'), true);
});

function openTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-categories-'));
  const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
  db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
  runMigrations(db);
  return db;
}

function createHousehold(db, name) {
  return db.prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)').run(name, cryptoSafeId()).lastInsertRowid;
}

function cryptoSafeId() {
  return `invite-${Math.random().toString(36).slice(2, 10)}`;
}
