/*
  # Add URL Traces Table

  ## Summary
  This migration creates a comprehensive URL tracking system to log when users
  actually visit/click on the final tracked URLs. This complements the suffix_requests
  table which tracks API calls, providing full visibility into both configuration
  requests and actual user engagement.

  ## 1. New Tables
    - `url_traces`
      - `id` (uuid, primary key)
      - `offer_id` (uuid, foreign key to offers table)
      - `visitor_ip` (text) - IP address of the visitor
      - `user_agent` (text) - Browser user agent
      - `referrer` (text) - HTTP referrer header
      - `country` (text) - Detected country from IP
      - `city` (text) - Detected city from IP
      - `device_type` (text) - mobile, desktop, tablet, bot
      - `visited_at` (timestamptz) - Timestamp of the visit
      - `final_url` (text) - The final destination URL
      - `query_params` (jsonb) - Query parameters passed
      - `created_at` (timestamptz)

  ## 2. Indexes
    - Index on `url_traces.offer_id` for fast lookups
    - Index on `url_traces.visited_at` for time-based queries

  ## 3. Security
    - Enable RLS on `url_traces` table
    - Add policy for authenticated users to view all traces
    - Allow public insert for traces (needed for tracking pixel/redirect)

  ## 4. Automatic Cleanup Trigger
    - Keep only the last 100 traces per offer
    - Older traces are automatically deleted
*/

-- Create url_traces table
CREATE TABLE IF NOT EXISTS url_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  visitor_ip text DEFAULT '',
  user_agent text DEFAULT '',
  referrer text DEFAULT '',
  country text DEFAULT '',
  city text DEFAULT '',
  device_type text DEFAULT 'unknown',
  visited_at timestamptz DEFAULT now(),
  final_url text DEFAULT '',
  query_params jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on url_traces
ALTER TABLE url_traces ENABLE ROW LEVEL SECURITY;

-- Create policies for url_traces
CREATE POLICY "Authenticated users can view all traces"
  ON url_traces FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can insert traces"
  ON url_traces FOR INSERT
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_url_traces_offer_id ON url_traces(offer_id);
CREATE INDEX IF NOT EXISTS idx_url_traces_visited_at ON url_traces(visited_at DESC);

-- Function to cleanup old url_traces (keep only last 100 per offer)
CREATE OR REPLACE FUNCTION cleanup_old_url_traces()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete records beyond the 100 most recent for this offer
  DELETE FROM url_traces
  WHERE id IN (
    SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY offer_id ORDER BY visited_at DESC) as rn
      FROM url_traces
      WHERE offer_id = NEW.offer_id
    ) ranked
    WHERE rn > 100
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically cleanup after insert
DROP TRIGGER IF EXISTS trigger_cleanup_url_traces ON url_traces;
CREATE TRIGGER trigger_cleanup_url_traces
  AFTER INSERT ON url_traces
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_url_traces();