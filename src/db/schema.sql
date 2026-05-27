PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  opening_balance_pence INTEGER NOT NULL DEFAULT 0,
  skip_planned_savings INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  person_key TEXT NOT NULL CHECK (person_key IN ('person_a', 'person_b')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (household_id, person_key)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'savings', 'debt')),
  is_default INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS household_categories (
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (household_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_household_categories_category ON household_categories(category_id);

CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('income', 'expense', 'savings')),
  category_id INTEGER REFERENCES categories(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  amount_pence INTEGER NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'yearly')),
  monthly_equivalent_pence INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'manual_percentage')),
  person_a_percentage REAL NOT NULL DEFAULT 50,
  person_b_percentage REAL NOT NULL DEFAULT 50,
  income_entry_mode TEXT CHECK (income_entry_mode IN ('manual_net', 'estimated_from_gross')),
  income_estimate_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS income_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_item_id INTEGER REFERENCES budget_items(id) ON DELETE SET NULL,
  gross_annual_salary_pence INTEGER NOT NULL,
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('monthly', 'yearly')),
  tax_year TEXT NOT NULL,
  pension_contribution_type TEXT NOT NULL CHECK (pension_contribution_type IN ('none', 'fixed_amount', 'percentage')),
  pension_contribution_value REAL NOT NULL DEFAULT 0,
  pension_contribution_tax_treatment TEXT NOT NULL CHECK (pension_contribution_tax_treatment IN ('pre_tax', 'post_tax')),
  other_pre_tax_deductions_pence INTEGER NOT NULL DEFAULT 0,
  other_post_tax_deductions_pence INTEGER NOT NULL DEFAULT 0,
  student_loan_plans_json TEXT NOT NULL DEFAULT '[]',
  has_postgraduate_loan INTEGER NOT NULL DEFAULT 0,
  estimated_income_tax_pence INTEGER NOT NULL,
  estimated_national_insurance_pence INTEGER NOT NULL,
  estimated_student_loan_repayment_pence INTEGER NOT NULL,
  estimated_postgraduate_loan_repayment_pence INTEGER NOT NULL,
  pension_contribution_pence INTEGER NOT NULL,
  estimated_other_deductions_pence INTEGER NOT NULL,
  estimated_net_monthly_income_pence INTEGER NOT NULL,
  estimated_net_annual_income_pence INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'savings')),
  category_id INTEGER REFERENCES categories(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'csv_import')),
  notes TEXT,
  duplicate_key TEXT NOT NULL,
  csv_import_batch_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_household_date ON transactions(household_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate ON transactions(household_id, duplicate_key);

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

CREATE TABLE IF NOT EXISTS category_budget_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount_pence INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (household_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_category_budget_defaults_household ON category_budget_defaults(household_id);

CREATE TABLE IF NOT EXISTS savings_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount_pence INTEGER NOT NULL,
  current_saved_amount_pence INTEGER NOT NULL DEFAULT 0,
  monthly_contribution_pence INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'paused')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_name TEXT,
  account_type TEXT NOT NULL CHECK (
    account_type IN (
      'current_account',
      'easy_access_savings',
      'fixed_savings',
      'cash_isa',
      'stocks_and_shares_isa',
      'lifetime_isa',
      'pension',
      'other'
    )
  ),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  current_balance_pence INTEGER NOT NULL DEFAULT 0,
  monthly_contribution_pence INTEGER NOT NULL DEFAULT 0,
  employer_monthly_contribution_pence INTEGER NOT NULL DEFAULT 0,
  projected_annual_rate REAL NOT NULL DEFAULT 0,
  projected_rate_type TEXT NOT NULL CHECK (projected_rate_type IN ('interest', 'growth')) DEFAULT 'interest',
  include_lisa_bonus INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_savings_accounts_household ON savings_accounts(household_id);

CREATE TABLE IF NOT EXISTS savings_goal_accounts (
  goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  savings_account_id INTEGER NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, savings_account_id)
);

CREATE INDEX IF NOT EXISTS idx_savings_goal_accounts_goal ON savings_goal_accounts(goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_goal_accounts_account ON savings_goal_accounts(savings_account_id);

CREATE TABLE IF NOT EXISTS csv_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  original_filename TEXT,
  status TEXT NOT NULL CHECK (status IN ('preview', 'imported', 'failed')) DEFAULT 'preview',
  error_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS csv_import_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES csv_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('preview', 'valid', 'invalid', 'duplicate', 'imported')) DEFAULT 'preview',
  error_message TEXT,
  transaction_id INTEGER REFERENCES transactions(id)
);
