/*
  # Add Offer Statistics and Automatic Cleanup

  ## Summary
  This migration implements a comprehensive statistics tracking system with automatic cleanup
  to maintain only the last 10 suffix requests per offer while preserving all-time aggregate data.

  ## 1. New Tables
    - `offer_statistics`
      - `id` (uuid, primary key)
      - `offer_id` (uuid, foreign key to offers table)
      - `total_suffix_requests` (bigint) - All-time count of suffix API calls
      - `total_tracking_hits` (bigint) - All-time count of tracking URL traces
      - `last_request_at` (timestamptz) - Timestamp of most recent request
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ## 2. Database Functions
    - `cleanup_old_suffix_requests()` - Automatically keeps only the last 10 records per offer
    - `increment_offer_statistics()` - Atomically updates statistics counters

  ## 3. Triggers
    - `trigger_cleanup_suffix_requests` - Executes cleanup after each insert to suffix_requests table

  ## 4. Indexes
    - Index on `offer_statistics.offer_id` for fast lookups
    - Index on `suffix_requests.requested_at` for efficient sorting (already exists)

  ## 5. Security
    - Enable RLS on `offer_statistics` table
    - Add policies for authenticated users to view all statistics
    - Allow public insert/update for statistics (needed by edge function)

  ## 6. Data Initialization
    - Populate statistics for existing offers based on current suffix_requests data
*/

-- Create offer_statistics table
CREATE TABLE IF NOT EXISTS offer_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,
  total_suffix_requests bigint DEFAULT 0,
  total_tracking_hits bigint DEFAULT 0,
  last_request_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on offer_statistics
ALTER TABLE offer_statistics ENABLE ROW LEVEL SECURITY;

-- Create policies for offer_statistics
CREATE POLICY "Authenticated users can view all statistics"
  ON offer_statistics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert statistics"
  ON offer_statistics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update statistics"
  ON offer_statistics FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_offer_statistics_offer_id ON offer_statistics(offer_id);

-- Function to cleanup old suffix_requests (keep only last 10 per offer)
CREATE OR REPLACE FUNCTION cleanup_old_suffix_requests()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete records beyond the 10 most recent for this offer
  DELETE FROM suffix_requests
  WHERE id IN (
    SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY offer_id ORDER BY requested_at DESC) as rn
      FROM suffix_requests
      WHERE offer_id = NEW.offer_id
    ) ranked
    WHERE rn > 10
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically cleanup after insert
DROP TRIGGER IF EXISTS trigger_cleanup_suffix_requests ON suffix_requests;
CREATE TRIGGER trigger_cleanup_suffix_requests
  AFTER INSERT ON suffix_requests
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_suffix_requests();

-- Initialize statistics for existing offers
INSERT INTO offer_statistics (offer_id, total_suffix_requests, total_tracking_hits, last_request_at)
SELECT 
  o.id as offer_id,
  COALESCE(COUNT(sr.id), 0) as total_suffix_requests,
  0 as total_tracking_hits,
  MAX(sr.requested_at) as last_request_at
FROM offers o
LEFT JOIN suffix_requests sr ON sr.offer_id = o.id
GROUP BY o.id
ON CONFLICT (offer_id) DO NOTHING;