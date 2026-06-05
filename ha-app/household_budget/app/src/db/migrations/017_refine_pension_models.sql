PRAGMA foreign_keys = OFF;

ALTER TABLE income_estimates RENAME TO income_estimates_old_017;

CREATE TABLE income_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_item_id INTEGER REFERENCES budget_items(id) ON DELETE SET NULL,
  gross_annual_salary_pence INTEGER NOT NULL,
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('monthly', 'yearly')),
  tax_year TEXT NOT NULL,
  pension_scheme_type TEXT NOT NULL DEFAULT 'defined_contribution' CHECK (pension_scheme_type IN ('defined_contribution', 'defined_benefit', 'sipp', 'other')),
  pension_contribution_method TEXT NOT NULL DEFAULT 'salary_sacrifice' CHECK (pension_contribution_method IN ('salary_sacrifice', 'net_pay', 'relief_at_source', 'employer_only', 'not_sure')),
  pension_contribution_type TEXT NOT NULL CHECK (pension_contribution_type IN ('none', 'fixed_monthly', 'fixed_annual', 'percentage')),
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
  linked_savings_account_id INTEGER REFERENCES savings_accounts(id) ON DELETE SET NULL,
  employer_pension_contribution_type TEXT NOT NULL CHECK (employer_pension_contribution_type IN ('none', 'fixed_monthly', 'fixed_annual', 'percentage')) DEFAULT 'none',
  employer_pension_contribution_value REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO income_estimates (
  id, household_id, budget_item_id, gross_annual_salary_pence, pay_frequency, tax_year,
  pension_scheme_type, pension_contribution_method, pension_contribution_type, pension_contribution_value,
  pension_contribution_tax_treatment, other_pre_tax_deductions_pence, other_post_tax_deductions_pence,
  student_loan_plans_json, has_postgraduate_loan, estimated_income_tax_pence,
  estimated_national_insurance_pence, estimated_student_loan_repayment_pence,
  estimated_postgraduate_loan_repayment_pence, pension_contribution_pence,
  estimated_other_deductions_pence, estimated_net_monthly_income_pence,
  estimated_net_annual_income_pence, linked_savings_account_id,
  employer_pension_contribution_type, employer_pension_contribution_value, created_at
)
SELECT
  id, household_id, budget_item_id, gross_annual_salary_pence, pay_frequency, tax_year,
  CASE
    WHEN pension_scheme_type = 'defined_benefit' THEN 'defined_benefit'
    ELSE 'defined_contribution'
  END,
  CASE
    WHEN pension_scheme_type = 'salary_sacrifice' THEN 'salary_sacrifice'
    WHEN pension_contribution_tax_treatment = 'post_tax' THEN 'relief_at_source'
    ELSE 'net_pay'
  END,
  CASE
    WHEN pension_contribution_type = 'fixed_amount' THEN 'fixed_annual'
    ELSE pension_contribution_type
  END,
  pension_contribution_value,
  pension_contribution_tax_treatment,
  other_pre_tax_deductions_pence,
  other_post_tax_deductions_pence,
  student_loan_plans_json,
  has_postgraduate_loan,
  estimated_income_tax_pence,
  estimated_national_insurance_pence,
  estimated_student_loan_repayment_pence,
  estimated_postgraduate_loan_repayment_pence,
  pension_contribution_pence,
  estimated_other_deductions_pence,
  estimated_net_monthly_income_pence,
  estimated_net_annual_income_pence,
  linked_savings_account_id,
  CASE
    WHEN employer_pension_contribution_type = 'fixed_amount' THEN 'fixed_annual'
    ELSE employer_pension_contribution_type
  END,
  employer_pension_contribution_value,
  created_at
FROM income_estimates_old_017;

DROP TABLE income_estimates_old_017;

ALTER TABLE savings_accounts RENAME TO savings_accounts_old_017;

CREATE TABLE savings_accounts (
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
      'defined_contribution_pension',
      'sipp_pension',
      'defined_benefit_pension',
      'other'
    )
  ),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('person_a', 'person_b', 'shared')),
  current_balance_pence INTEGER NOT NULL DEFAULT 0,
  monthly_contribution_pence INTEGER NOT NULL DEFAULT 0,
  employer_monthly_contribution_pence INTEGER NOT NULL DEFAULT 0,
  available_for_household_cashflow INTEGER NOT NULL DEFAULT 0,
  access_type TEXT NOT NULL CHECK (
    access_type IN (
      'instant_access',
      'notice',
      'penalty_withdrawal',
      'locked_until_date',
      'locked_until_age'
    )
  ) DEFAULT 'instant_access',
  access_date TEXT,
  access_age INTEGER,
  access_notes TEXT,
  projected_annual_rate REAL NOT NULL DEFAULT 0,
  projected_rate_type TEXT NOT NULL CHECK (projected_rate_type IN ('interest', 'growth')) DEFAULT 'interest',
  include_lisa_bonus INTEGER NOT NULL DEFAULT 0,
  annual_charge_percentage REAL NOT NULL DEFAULT 0,
  annual_pension_entitlement_pence INTEGER NOT NULL DEFAULT 0,
  lump_sum_entitlement_pence INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO savings_accounts (
  id, household_id, name, provider_name, account_type, owner_type,
  current_balance_pence, monthly_contribution_pence, employer_monthly_contribution_pence,
  available_for_household_cashflow, access_type, access_date, access_age, access_notes,
  projected_annual_rate, projected_rate_type, include_lisa_bonus, annual_charge_percentage,
  annual_pension_entitlement_pence, lump_sum_entitlement_pence, is_active, notes, created_at, updated_at
)
SELECT
  id, household_id, name, provider_name,
  CASE WHEN account_type = 'pension' THEN 'defined_contribution_pension' ELSE account_type END,
  owner_type, current_balance_pence, monthly_contribution_pence, employer_monthly_contribution_pence,
  available_for_household_cashflow, access_type, access_date, access_age, access_notes,
  projected_annual_rate, projected_rate_type, include_lisa_bonus, 0, 0, 0,
  is_active, notes, created_at, updated_at
FROM savings_accounts_old_017;

DROP TABLE savings_accounts_old_017;

CREATE INDEX IF NOT EXISTS idx_savings_accounts_household ON savings_accounts(household_id);

ALTER TABLE savings_goal_accounts RENAME TO savings_goal_accounts_old_017;

CREATE TABLE savings_goal_accounts (
  goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  savings_account_id INTEGER NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, savings_account_id)
);

INSERT INTO savings_goal_accounts (goal_id, savings_account_id)
SELECT goal_id, savings_account_id
FROM savings_goal_accounts_old_017;

DROP TABLE savings_goal_accounts_old_017;

CREATE INDEX IF NOT EXISTS idx_savings_goal_accounts_goal ON savings_goal_accounts(goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_goal_accounts_account ON savings_goal_accounts(savings_account_id);

ALTER TABLE income_estimates RENAME TO income_estimates_ref_017;

CREATE TABLE income_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_item_id INTEGER REFERENCES budget_items(id) ON DELETE SET NULL,
  gross_annual_salary_pence INTEGER NOT NULL,
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('monthly', 'yearly')),
  tax_year TEXT NOT NULL,
  pension_scheme_type TEXT NOT NULL DEFAULT 'defined_contribution' CHECK (pension_scheme_type IN ('defined_contribution', 'defined_benefit', 'sipp', 'other')),
  pension_contribution_method TEXT NOT NULL DEFAULT 'salary_sacrifice' CHECK (pension_contribution_method IN ('salary_sacrifice', 'net_pay', 'relief_at_source', 'employer_only', 'not_sure')),
  pension_contribution_type TEXT NOT NULL CHECK (pension_contribution_type IN ('none', 'fixed_monthly', 'fixed_annual', 'percentage')),
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
  linked_savings_account_id INTEGER REFERENCES savings_accounts(id) ON DELETE SET NULL,
  employer_pension_contribution_type TEXT NOT NULL CHECK (employer_pension_contribution_type IN ('none', 'fixed_monthly', 'fixed_annual', 'percentage')) DEFAULT 'none',
  employer_pension_contribution_value REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO income_estimates
SELECT *
FROM income_estimates_ref_017;

DROP TABLE income_estimates_ref_017;

PRAGMA foreign_keys = ON;
