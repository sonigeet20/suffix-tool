/*
  # Add Target Country Column for Geo-Targeting

  1. Changes
    - Add `target_country` column to `offers` table
    - Stores 2-letter country code (US, GB, CA, etc.)
    - Used to target specific countries via Luna proxy
    
  2. Purpose
    - Enable geo-targeted URL tracing
    - Ensure redirects are tested from specific geographic locations
    - Match actual user traffic patterns
    
  3. Usage
    - Set target_country in offer settings (e.g., 'US' for United States)
    - Luna proxy will use this country when tracing
    - Leave NULL for random/any country
*/

-- Add target_country column to offers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'target_country'
  ) THEN
    ALTER TABLE offers ADD COLUMN target_country VARCHAR(2) DEFAULT NULL;
    COMMENT ON COLUMN offers.target_country IS '2-letter country code for geo-targeting (US, GB, CA, etc.)';
  END IF;
END $$;