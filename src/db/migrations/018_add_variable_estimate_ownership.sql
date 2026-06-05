PRAGMA foreign_keys = OFF;

ALTER TABLE category_budgets RENAME TO category_budgets_old_018;

CREATE TABLE category_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT,
  budget_month TEXT NOT NULL,
  owner_type TEXT NOT NULL DEFAULT 'shared' CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'manual_percentage')),
  person_a_percentage REAL NOT NULL DEFAULT 50,
  person_b_percentage REAL NOT NULL DEFAULT 50,
  amount_pence INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO category_budgets (
  id, household_id, category_id, name, budget_month,
  owner_type, split_type, person_a_percentage, person_b_percentage,
  amount_pence, notes, created_by, created_at, updated_at
)
SELECT
  id, household_id, category_id, name, budget_month,
  'shared', 'equal', 50, 50,
  amount_pence, notes, created_by, created_at, updated_at
FROM category_budgets_old_018;

DROP TABLE category_budgets_old_018;

CREATE INDEX IF NOT EXISTS idx_category_budgets_household_month ON category_budgets(household_id, budget_month);

ALTER TABLE category_budget_defaults RENAME TO category_budget_defaults_old_018;

CREATE TABLE category_budget_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT,
  owner_type TEXT NOT NULL DEFAULT 'shared' CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'manual_percentage')),
  person_a_percentage REAL NOT NULL DEFAULT 50,
  person_b_percentage REAL NOT NULL DEFAULT 50,
  amount_pence INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO category_budget_defaults (
  id, household_id, category_id, name,
  owner_type, split_type, person_a_percentage, person_b_percentage,
  amount_pence, is_active, notes, created_by, created_at, updated_at
)
SELECT
  id, household_id, category_id, name,
  'shared', 'equal', 50, 50,
  amount_pence, is_active, notes, created_by, created_at, updated_at
FROM category_budget_defaults_old_018;

DROP TABLE category_budget_defaults_old_018;

CREATE INDEX IF NOT EXISTS idx_category_budget_defaults_household ON category_budget_defaults(household_id);

PRAGMA foreign_keys = ON;
