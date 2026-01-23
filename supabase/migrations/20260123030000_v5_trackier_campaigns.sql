-- V5 Trackier campaign tracking (with 200_hrf redirect and p1 parameter passing)
-- This table stores the relationship between Google Ads campaigns and Trackier campaigns
-- with webhook URLs and tracking templates that pass campaign ID via p1 parameter

CREATE TABLE IF NOT EXISTS v5_trackier_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id UUID REFERENCES v5_campaign_offer_mapping(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  google_campaign_id TEXT NOT NULL,
  offer_name TEXT NOT NULL,
  trackier_campaign_id BIGINT NOT NULL,
  trackier_campaign_name TEXT,
  webhook_url TEXT NOT NULL,
  tracking_template TEXT NOT NULL,
  redirect_type TEXT DEFAULT '200_hrf',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, google_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_v5_trackier_mapping ON v5_trackier_campaigns(mapping_id);
CREATE INDEX IF NOT EXISTS idx_v5_trackier_account_google ON v5_trackier_campaigns(account_id, google_campaign_id);
CREATE INDEX IF NOT EXISTS idx_v5_trackier_trackier_id ON v5_trackier_campaigns(trackier_campaign_id);
CREATE INDEX IF NOT EXISTS idx_v5_trackier_offer ON v5_trackier_campaigns(account_id, offer_name);

COMMENT ON TABLE v5_trackier_campaigns IS 'Stores Trackier campaign metadata for V5 webhook system with 200_hrf redirects';
COMMENT ON COLUMN v5_trackier_campaigns.google_campaign_id IS 'Google Ads campaign ID (passed via p1 parameter)';
COMMENT ON COLUMN v5_trackier_campaigns.trackier_campaign_id IS 'Trackier campaign ID (auto-created with redirectType: 200_hrf)';
COMMENT ON COLUMN v5_trackier_campaigns.tracking_template IS 'Tracking template with p1={campaignid} to pass Google campaign ID';
COMMENT ON COLUMN v5_trackier_campaigns.redirect_type IS 'Trackier redirect type, always 200_hrf for V5';
