-- Add macro_mapping column to trackier_offers table
-- This stores the mapping between traced suffix parameters and Trackier macros

ALTER TABLE trackier_offers 
ADD COLUMN IF NOT EXISTS macro_mapping JSONB DEFAULT '{
  "clickid": "{clickid}",
  "gclid": "{gclid}",
  "fbclid": "{fbclid}",
  "ttclid": "{ttclid}",
  "campaign": "{campaign_id}",
  "source": "{source}",
  "publisher": "{publisher_id}",
  "medium": "{medium}",
  "keyword": "{keyword}",
  "adgroup": "{adgroup}",
  "creative": "{creative}"
}'::jsonb;

-- Add comment
COMMENT ON COLUMN trackier_offers.macro_mapping IS 'Maps traced URL parameters to Trackier macros for dynamic replacement';
