-- Make trackier_offer_id nullable in trackier_webhook_logs
-- This allows logging webhooks even before we map them to offers

ALTER TABLE trackier_webhook_logs 
ALTER COLUMN trackier_offer_id DROP NOT NULL;
