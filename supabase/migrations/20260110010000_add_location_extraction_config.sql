/*
  # Add Location Header Extraction Configuration

  ## Summary
  Adds configuration fields to offers table to control location header parameter extraction.
  
  ## New Columns
    - `extract_from_location_header` (boolean) - Enable location header extraction
    - `location_extract_hop` (integer) - Which hop to extract from (1-indexed, null = last redirect)
  
  ## Usage
    - If extract_from_location_header = true, system will extract params from location header
    - If location_extract_hop is set, extract from that specific hop
    - If location_extract_hop is null, extract from last redirect (default behavior)
*/

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
