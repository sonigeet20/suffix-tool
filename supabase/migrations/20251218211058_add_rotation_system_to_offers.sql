/*
  # Add Multi-URL/Referrer Rotation System with Weighted Selection

  ## Overview
  This migration adds a sophisticated rotation system that allows offers to use multiple tracking URLs 
  and referrers with weighted selection algorithms and parameter filtering capabilities.

  ## 1. New Columns Added to `offers` Table
  
  ### Tracking URL Rotation
  - `tracking_urls` (jsonb): Array of tracking URL objects with structure:
    ```json
    [{
      "url": "https://track1.example.com/click?id=123",
      "weight": 70,
      "enabled": true,
      "label": "Primary Tracker"
    }]
    ```
  - `tracking_url_rotation_mode` (text): Controls how URLs are selected
    - `sequential`: Rotates through URLs in order, remembers position
    - `random`: Picks a random enabled URL each time
    - `weighted-random`: Random selection based on weight values
  - `current_tracking_url_index` (integer): Tracks position for sequential rotation

  ### Referrer Rotation
  - `referrers` (jsonb): Array of referrer objects with structure:
    ```json
    [{
      "url": "https://example.com/landing",
      "weight": 50,
      "enabled": true,
      "label": "Main Landing Page"
    }]
    ```
  - `referrer_rotation_mode` (text): Controls referrer selection (same modes as URLs)
  - `current_referrer_index` (integer): Tracks position for sequential rotation

  ### Parameter Filtering
  - `param_filter` (jsonb): Array of parameter names to filter
    ```json
    ["gclid", "fbclid", "msclkid"]
    ```
  - `param_filter_mode` (text): How to apply the filter
    - `all`: Pass all extracted parameters (default)
    - `whitelist`: Only include params in the filter array
    - `blacklist`: Exclude params in the filter array

  ## 2. Backward Compatibility
  - Existing `tracking_template` field remains functional
  - When `tracking_urls` is empty/null, system falls back to `tracking_template`
  - Default rotation mode is `sequential` for predictable behavior
  - Default param_filter_mode is `all` for no filtering

  ## 3. Security
  - All new columns are accessible via existing RLS policies
  - No new security concerns introduced

  ## 4. Usage Notes
  - Weights range from 1-100, higher weights = higher selection probability
  - Sequential mode persists state across requests via index fields
  - Disabled URLs/referrers are automatically skipped
  - Empty arrays fall back to legacy single-value fields
*/

-- Add tracking URL rotation fields to offers table
ALTER TABLE offers 
ADD COLUMN IF NOT EXISTS tracking_urls jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS tracking_url_rotation_mode text DEFAULT 'sequential' 
  CHECK (tracking_url_rotation_mode IN ('sequential', 'random', 'weighted-random')),
ADD COLUMN IF NOT EXISTS current_tracking_url_index integer DEFAULT 0;

-- Add referrer rotation fields to offers table
ALTER TABLE offers
ADD COLUMN IF NOT EXISTS referrers jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS referrer_rotation_mode text DEFAULT 'sequential'
  CHECK (referrer_rotation_mode IN ('sequential', 'random', 'weighted-random')),
ADD COLUMN IF NOT EXISTS current_referrer_index integer DEFAULT 0;

-- Add parameter filtering fields to offers table
ALTER TABLE offers
ADD COLUMN IF NOT EXISTS param_filter jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS param_filter_mode text DEFAULT 'all'
  CHECK (param_filter_mode IN ('all', 'whitelist', 'blacklist'));

-- Add comment documentation
COMMENT ON COLUMN offers.tracking_urls IS 
  'Array of tracking URL objects: [{url, weight, enabled, label}]. When populated, overrides tracking_template.';
COMMENT ON COLUMN offers.tracking_url_rotation_mode IS 
  'Selection algorithm: sequential (rotate in order), random (pick randomly), weighted-random (probability based on weights)';
COMMENT ON COLUMN offers.current_tracking_url_index IS 
  'Current position in tracking_urls array for sequential rotation. Auto-increments with each selection.';
COMMENT ON COLUMN offers.referrers IS 
  'Array of referrer objects: [{url, weight, enabled, label}]. Static referrers injected at browser level.';
COMMENT ON COLUMN offers.referrer_rotation_mode IS 
  'Selection algorithm for referrers: sequential, random, or weighted-random';
COMMENT ON COLUMN offers.current_referrer_index IS 
  'Current position in referrers array for sequential rotation';
COMMENT ON COLUMN offers.param_filter IS 
  'Array of parameter names for filtering. Usage depends on param_filter_mode.';
COMMENT ON COLUMN offers.param_filter_mode IS 
  'How to filter params: all (no filter), whitelist (only include listed), blacklist (exclude listed)';

-- Create index for faster rotation queries
CREATE INDEX IF NOT EXISTS idx_offers_rotation_state ON offers(id, current_tracking_url_index, current_referrer_index);
