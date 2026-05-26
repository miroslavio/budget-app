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
  projected_annual_rate REAL NOT NULL DEFAULT 0,
  projected_rate_type TEXT NOT NULL CHECK (projected_rate_type IN ('interest', 'growth')) DEFAULT 'interest',
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_savings_accounts_household ON savings_accounts(household_id);
