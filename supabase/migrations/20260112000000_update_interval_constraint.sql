-- Update interval constraint to allow minimum 1 second instead of 5
-- Also update default to 1 second

ALTER TABLE trackier_offers DROP CONSTRAINT IF EXISTS trackier_offers_check_interval;
ALTER TABLE trackier_offers ADD CONSTRAINT trackier_offers_check_interval CHECK (update_interval_seconds >= 1);
ALTER TABLE trackier_offers ALTER COLUMN update_interval_seconds SET DEFAULT 1;
