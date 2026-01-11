-- Add columns to store both display campaign IDs and actual Trackier campaign IDs
-- Display IDs (simple numbers) shown in UI
-- Real IDs (hex strings) used for webhook matching

ALTER TABLE trackier_offers
ADD COLUMN IF NOT EXISTS url1_campaign_id_real TEXT COMMENT 'Actual Trackier internal campaign ID for URL1 (used in webhooks)',
ADD COLUMN IF NOT EXISTS url2_campaign_id_real TEXT COMMENT 'Actual Trackier internal campaign ID for URL2 (used in webhooks)',
ADD COLUMN IF NOT EXISTS url1_campaign_id_display TEXT COMMENT 'Display campaign ID for URL1 (simple number)',
ADD COLUMN IF NOT EXISTS url2_campaign_id_display TEXT COMMENT 'Display campaign ID for URL2 (simple number)';

-- Create index for webhook lookups using real IDs
CREATE INDEX IF NOT EXISTS idx_trackier_offers_url1_campaign_id_real ON trackier_offers(url1_campaign_id_real);
CREATE INDEX IF NOT EXISTS idx_trackier_offers_url2_campaign_id_real ON trackier_offers(url2_campaign_id_real);

-- Backfill existing offers: assume current campaign_id values are the real IDs
UPDATE trackier_offers 
SET url1_campaign_id_real = url1_campaign_id,
    url2_campaign_id_real = url2_campaign_id
WHERE url1_campaign_id_real IS NULL AND url1_campaign_id IS NOT NULL;

COMMENT ON TABLE trackier_offers IS 'Trackier offers with both display and real campaign IDs for proper webhook matching';
