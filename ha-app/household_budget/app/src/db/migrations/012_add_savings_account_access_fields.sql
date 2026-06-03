ALTER TABLE savings_accounts ADD COLUMN available_for_household_cashflow INTEGER NOT NULL DEFAULT 0;
ALTER TABLE savings_accounts ADD COLUMN access_type TEXT NOT NULL DEFAULT 'instant_access';
ALTER TABLE savings_accounts ADD COLUMN access_date TEXT;
ALTER TABLE savings_accounts ADD COLUMN access_age INTEGER;
ALTER TABLE savings_accounts ADD COLUMN access_notes TEXT;

UPDATE savings_accounts
SET available_for_household_cashflow = CASE account_type
  WHEN 'current_account' THEN 1
  WHEN 'easy_access_savings' THEN 1
  WHEN 'cash_isa' THEN 1
  ELSE 0
END,
access_type = CASE account_type
  WHEN 'current_account' THEN 'instant_access'
  WHEN 'easy_access_savings' THEN 'instant_access'
  WHEN 'fixed_savings' THEN 'notice'
  WHEN 'cash_isa' THEN 'penalty_withdrawal'
  WHEN 'stocks_and_shares_isa' THEN 'penalty_withdrawal'
  WHEN 'lifetime_isa' THEN 'locked_until_age'
  WHEN 'pension' THEN 'locked_until_age'
  ELSE 'instant_access'
END
WHERE 1 = 1;
