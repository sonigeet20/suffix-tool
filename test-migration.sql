-- Add location extraction configuration columns
ALTER TABLE offers 
  ADD COLUMN IF NOT EXISTS extract_from_location_header boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_extract_hop integer DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN offers.extract_from_location_header IS 'Enable extraction of parameters from location header of redirect chain';
COMMENT ON COLUMN offers.location_extract_hop IS 'Specific hop number (1-indexed) to extract from, NULL = last redirect';

-- Create index for filtering offers with location extraction enabled
CREATE INDEX IF NOT EXISTS idx_offers_location_extraction ON offers(extract_from_location_header) 
  WHERE extract_from_location_header = true;
