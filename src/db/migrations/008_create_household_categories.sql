CREATE TABLE IF NOT EXISTS household_categories (
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_household_categories_category ON household_categories(category_id);

INSERT INTO categories (name, kind, is_default)
SELECT 'Salary', 'income', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Salary' AND kind = 'income');

INSERT INTO categories (name, kind, is_default)
SELECT 'Other income', 'income', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Other income' AND kind = 'income');

INSERT INTO categories (name, kind, is_default)
SELECT 'Savings', 'savings', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Savings' AND kind = 'savings');

INSERT OR IGNORE INTO household_categories (household_id, category_id)
SELECT DISTINCT household_id, category_id
FROM budget_items
WHERE category_id IS NOT NULL;

INSERT OR IGNORE INTO household_categories (household_id, category_id)
SELECT DISTINCT household_id, category_id
FROM transactions
WHERE category_id IS NOT NULL;

INSERT OR IGNORE INTO household_categories (household_id, category_id)
SELECT DISTINCT household_id, category_id
FROM category_budgets
WHERE category_id IS NOT NULL;

INSERT OR IGNORE INTO household_categories (household_id, category_id)
SELECT DISTINCT household_id, category_id
FROM category_budget_defaults
WHERE category_id IS NOT NULL;
