PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_savings_accounts_household;

CREATE TABLE IF NOT EXISTS savings_accounts_migrated (
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

INSERT INTO savings_accounts_migrated (
  id,
  household_id,
  name,
  provider_name,
  account_type,
  owner_type,
  current_balance_pence,
  monthly_contribution_pence,
  employer_monthly_contribution_pence,
  projected_annual_rate,
  projected_rate_type,
  include_lisa_bonus,
  is_active,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  household_id,
  name,
  provider_name,
  account_type,
  owner_type,
  current_balance_pence,
  monthly_contribution_pence,
  0,
  projected_annual_rate,
  projected_rate_type,
  0,
  is_active,
  notes,
  created_at,
  updated_at
FROM savings_accounts;

DROP TABLE IF EXISTS savings_goal_accounts;
DROP TABLE savings_accounts;
ALTER TABLE savings_accounts_migrated RENAME TO savings_accounts;

CREATE INDEX IF NOT EXISTS idx_savings_accounts_household ON savings_accounts(household_id);

CREATE TABLE IF NOT EXISTS savings_goal_accounts (
  goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  savings_account_id INTEGER NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, savings_account_id)
);

CREATE INDEX IF NOT EXISTS idx_savings_goal_accounts_goal ON savings_goal_accounts(goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_goal_accounts_account ON savings_goal_accounts(savings_account_id);

PRAGMA foreign_keys = ON;
