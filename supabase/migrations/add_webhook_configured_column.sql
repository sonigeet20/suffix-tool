-- Add webhook configuration tracking columns to existing webhook_campaign_mappings table

-- Add columns if they don't exist
ALTER TABLE webhook_campaign_mappings 
ADD COLUMN IF NOT EXISTS webhook_configured BOOLEAN DEFAULT false;

ALTER TABLE webhook_campaign_mappings 
ADD COLUMN IF NOT EXISTS first_webhook_received_at TIMESTAMP;

-- Add index for fast filtering
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_configured 
ON webhook_campaign_mappings(webhook_configured);

-- Add comment
COMMENT ON COLUMN webhook_campaign_mappings.webhook_configured IS 'Has user added webhook URL to Trackier?';
COMMENT ON COLUMN webhook_campaign_mappings.first_webhook_received_at IS 'Timestamp when first webhook was received from Trackier';
