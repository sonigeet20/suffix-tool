-- Add additional_pairs column to trackier_offers table
-- This stores multiple campaign pairs created from the multi-campaign creation feature

ALTER TABLE trackier_offers 
ADD COLUMN IF NOT EXISTS additional_pairs JSONB;

COMMENT ON COLUMN trackier_offers.additional_pairs IS 'Array of additional campaign pairs beyond the primary pair. Each pair contains url1_campaign_id, url2_campaign_id, google_ads_template, etc.';
