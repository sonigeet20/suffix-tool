-- V5 Trackier Shared Campaigns Migration
-- Convert v5_trackier_campaigns from per-mapping to per-offer (shared across accounts)
-- One Trackier campaign per offer_name, reused by all accounts

-- Drop old constraints and indexes
DROP INDEX IF EXISTS idx_v5_trackier_mapping;
DROP INDEX IF EXISTS idx_v5_trackier_account_google;
DROP INDEX IF EXISTS idx_v5_trackier_trackier_id;
DROP INDEX IF EXISTS idx_v5_trackier_offer;

-- Remove account-specific columns and make offer_name the primary key
ALTER TABLE v5_trackier_campaigns 
  DROP COLUMN IF EXISTS mapping_id,
  DROP COLUMN IF EXISTS account_id,
  DROP COLUMN IF EXISTS google_campaign_id,
  DROP CONSTRAINT IF EXISTS v5_trackier_campaigns_pkey,
  DROP CONSTRAINT IF EXISTS v5_trackier_campaigns_account_id_google_campaign_id_key;

-- Add offer_name as primary key (one row per offer)
ALTER TABLE v5_trackier_campaigns
  ADD PRIMARY KEY (offer_name);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_v5_trackier_trackier_id ON v5_trackier_campaigns(trackier_campaign_id);

-- Update comments
COMMENT ON TABLE v5_trackier_campaigns IS 'Stores shared Trackier campaign metadata (one per offer, works across all accounts)';
COMMENT ON COLUMN v5_trackier_campaigns.offer_name IS 'Primary key: offer name (unique Trackier campaign per offer)';
COMMENT ON COLUMN v5_trackier_campaigns.trackier_campaign_id IS 'Trackier campaign ID (auto-created with redirectType: 200_hrf, shared across accounts)';
COMMENT ON COLUMN v5_trackier_campaigns.tracking_template IS 'Universal tracking template with p1={campaignid} (works for all accounts)';
COMMENT ON COLUMN v5_trackier_campaigns.webhook_url IS 'Base webhook URL (append ?campaign_id={p1}&offer_name=X for postback)';
COMMENT ON COLUMN v5_trackier_campaigns.redirect_type IS 'Trackier redirect type, always 200_hrf for V5';
