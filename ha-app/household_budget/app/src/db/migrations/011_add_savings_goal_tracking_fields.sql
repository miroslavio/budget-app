ALTER TABLE savings_goals ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE savings_goals ADD COLUMN goal_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE savings_goals ADD COLUMN notes TEXT;

UPDATE savings_goals
SET tracking_mode = 'linked_pots'
WHERE id IN (SELECT DISTINCT goal_id FROM savings_goal_accounts);
