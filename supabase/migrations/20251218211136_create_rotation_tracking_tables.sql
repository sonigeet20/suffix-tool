/*
  # Create Rotation System Tracking and Analytics Tables

  ## Overview
  This migration creates comprehensive tracking tables to monitor the usage and performance
  of the multi-URL/referrer rotation system.

  ## 1. New Tables Created

  ### `tracking_url_usage`
  Tracks detailed statistics for each tracking URL in each offer:
  - How many times each URL has been used
  - Success vs failure rates
  - Last usage timestamp
  - Associated offer and URL details

  ### `referrer_usage`
  Tracks statistics for each referrer in each offer:
  - Usage frequency
  - Last usage timestamp
  - Associated offer and referrer details

  ## 2. Enhanced Existing Tables

  ### `suffix_requests` - New Columns
  - `tracking_url_used`: Which tracking URL was selected for this request
  - `tracking_url_label`: Label of the tracking URL used
  - `tracking_url_weight`: Weight value of selected URL
  - `tracking_url_index`: Position in rotation sequence
  - `referrer_used`: Which referrer was selected
  - `referrer_label`: Label of the referrer used
  - `referrer_weight`: Weight value of selected referrer
  - `referrer_index`: Position in referrer rotation
  - `rotation_mode`: Combined rotation mode info
  - `params_extracted`: All params before filtering
  - `params_filtered`: Final params after filter applied
  - `filter_mode`: Which filtering mode was used

  ### `url_traces` - New Columns
  - `tracking_url_used`: Which tracking URL was traced
  - `referrer_used`: Which referrer was injected

  ## 3. Security
  - RLS enabled on all new tables
  - Policies restrict access to authenticated users viewing their own data
  - Foreign key constraints ensure data integrity

  ## 4. Indexes
  - Optimized for common query patterns
  - Fast lookups by offer_id
  - Efficient aggregation queries
*/

-- Create tracking_url_usage table for analytics
CREATE TABLE IF NOT EXISTS tracking_url_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  tracking_url text NOT NULL,
  tracking_url_label text DEFAULT '',
  times_used bigint DEFAULT 0,
  last_used_at timestamptz DEFAULT now(),
  success_count bigint DEFAULT 0,
  failure_count bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(offer_id, tracking_url)
);

-- Create referrer_usage table for analytics
CREATE TABLE IF NOT EXISTS referrer_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  referrer_url text NOT NULL,
  referrer_label text DEFAULT '',
  times_used bigint DEFAULT 0,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(offer_id, referrer_url)
);

-- Add tracking metadata columns to suffix_requests table
ALTER TABLE suffix_requests
ADD COLUMN IF NOT EXISTS tracking_url_used text,
ADD COLUMN IF NOT EXISTS tracking_url_label text,
ADD COLUMN IF NOT EXISTS tracking_url_weight integer,
ADD COLUMN IF NOT EXISTS tracking_url_index integer,
ADD COLUMN IF NOT EXISTS referrer_used text,
ADD COLUMN IF NOT EXISTS referrer_label text,
ADD COLUMN IF NOT EXISTS referrer_weight integer,
ADD COLUMN IF NOT EXISTS referrer_index integer,
ADD COLUMN IF NOT EXISTS rotation_mode jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS params_extracted jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS params_filtered jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS filter_mode text;

-- Add tracking metadata columns to url_traces table
ALTER TABLE url_traces
ADD COLUMN IF NOT EXISTS tracking_url_used text,
ADD COLUMN IF NOT EXISTS referrer_used text;

-- Enable RLS on new tables
ALTER TABLE tracking_url_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrer_usage ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tracking_url_usage
CREATE POLICY "Users can view own tracking URL usage"
  ON tracking_url_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = tracking_url_usage.offer_id
      AND offers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own tracking URL usage"
  ON tracking_url_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = tracking_url_usage.offer_id
      AND offers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own tracking URL usage"
  ON tracking_url_usage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = tracking_url_usage.offer_id
      AND offers.user_id = auth.uid()
    )
  );

-- Create RLS policies for referrer_usage
CREATE POLICY "Users can view own referrer usage"
  ON referrer_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = referrer_usage.offer_id
      AND offers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own referrer usage"
  ON referrer_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = referrer_usage.offer_id
      AND offers.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own referrer usage"
  ON referrer_usage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = referrer_usage.offer_id
      AND offers.user_id = auth.uid()
    )
  );

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_tracking_url_usage_offer_id ON tracking_url_usage(offer_id);
CREATE INDEX IF NOT EXISTS idx_tracking_url_usage_last_used ON tracking_url_usage(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrer_usage_offer_id ON referrer_usage(offer_id);
CREATE INDEX IF NOT EXISTS idx_referrer_usage_last_used ON referrer_usage(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_suffix_requests_offer_tracking ON suffix_requests(offer_id, tracking_url_used);

-- Add helpful comments
COMMENT ON TABLE tracking_url_usage IS 'Tracks usage statistics and performance metrics for each tracking URL in the rotation system';
COMMENT ON TABLE referrer_usage IS 'Tracks usage statistics for each referrer in the rotation system';
COMMENT ON COLUMN suffix_requests.tracking_url_used IS 'The actual tracking URL selected from the rotation pool for this request';
COMMENT ON COLUMN suffix_requests.params_extracted IS 'All parameters extracted from redirect chain before filtering';
COMMENT ON COLUMN suffix_requests.params_filtered IS 'Final parameters after applying param_filter rules';
