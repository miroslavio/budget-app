INSERT INTO categories (name, kind, is_default)
SELECT 'Rent', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories);

INSERT INTO categories (name, kind, is_default)
SELECT 'Mortgage', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Mortgage' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Mortgage overpayment', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Mortgage overpayment' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Council tax', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Council tax' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Energy bill', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Energy bill' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Broadband', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Broadband' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Mobile phone', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Mobile phone' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'TV licence', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'TV licence' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Utilities', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Utilities' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Groceries', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Groceries' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Transport', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Transport' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Insurance', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Insurance' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Subscriptions', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Subscriptions' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Gym membership', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Gym membership' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Discretionary spending', 'expense', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Discretionary spending' AND kind = 'expense');

INSERT INTO categories (name, kind, is_default)
SELECT 'Debt repayment', 'debt', 0
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Debt repayment' AND kind = 'debt');
