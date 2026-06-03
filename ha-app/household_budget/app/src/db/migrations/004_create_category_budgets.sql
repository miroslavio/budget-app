CREATE TABLE IF NOT EXISTS category_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  budget_month TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (household_id, category_id, budget_month)
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_household_month ON category_budgets(household_id, budget_month);
