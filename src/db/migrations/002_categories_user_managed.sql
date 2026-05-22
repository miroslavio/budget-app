DELETE FROM categories
WHERE is_default = 1
  AND id NOT IN (SELECT category_id FROM budget_items WHERE category_id IS NOT NULL)
  AND id NOT IN (SELECT category_id FROM transactions WHERE category_id IS NOT NULL);

UPDATE categories
SET is_default = 0
WHERE is_default != 0;
