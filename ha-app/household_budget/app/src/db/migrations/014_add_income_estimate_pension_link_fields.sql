ALTER TABLE income_estimates ADD COLUMN linked_savings_account_id INTEGER REFERENCES savings_accounts(id) ON DELETE SET NULL;
ALTER TABLE income_estimates ADD COLUMN employer_pension_contribution_type TEXT NOT NULL DEFAULT 'none' CHECK (employer_pension_contribution_type IN ('none', 'fixed_amount', 'percentage'));
ALTER TABLE income_estimates ADD COLUMN employer_pension_contribution_value REAL NOT NULL DEFAULT 0;
