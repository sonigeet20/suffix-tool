-- Add campaign_name field to offers table
-- This is a frontend identifier for organizing offers (searchable)

ALTER TABLE offers ADD COLUMN IF NOT EXISTS campaign_name TEXT;

-- Add validation: campaign_name must not be empty string if provided
ALTER TABLE offers ADD CONSTRAINT campaign_name_not_empty 
  CHECK (campaign_name IS NULL OR LENGTH(TRIM(campaign_name)) > 0);

-- Add index for search performance
CREATE INDEX IF NOT EXISTS idx_offers_campaign_name ON offers(campaign_name);

-- Add comment
COMMENT ON COLUMN offers.campaign_name IS 'Campaign identifier for organizing and grouping related offers';
