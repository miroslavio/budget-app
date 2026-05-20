UPDATE budget_items
SET category_id = (SELECT id FROM categories WHERE name = 'Subscriptions')
WHERE category_id IN (
  SELECT id FROM categories WHERE name IN ('Streaming subscriptions', 'Software subscriptions')
);

UPDATE transactions
SET category_id = (SELECT id FROM categories WHERE name = 'Subscriptions')
WHERE category_id IN (
  SELECT id FROM categories WHERE name IN ('Streaming subscriptions', 'Software subscriptions')
);

DELETE FROM categories
WHERE name IN ('Streaming subscriptions', 'Software subscriptions');

UPDATE budget_items
SET category_id = (SELECT id FROM categories WHERE name = 'Utilities')
WHERE category_id IN (
  SELECT id FROM categories WHERE name = 'Water bill'
);

UPDATE transactions
SET category_id = (SELECT id FROM categories WHERE name = 'Utilities')
WHERE category_id IN (
  SELECT id FROM categories WHERE name = 'Water bill'
);

DELETE FROM categories
WHERE name = 'Water bill';
