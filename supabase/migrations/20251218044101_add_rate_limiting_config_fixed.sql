/*
  # Add Rate Limiting Configuration

  1. New Tables
    - `rate_limit_config`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `endpoint_name` (text) - Name of the endpoint (get-suffix, track-hit, trace-redirects)
      - `requests_per_second` (numeric) - Maximum requests per second
      - `requests_per_minute` (numeric) - Maximum requests per minute
      - `requests_per_hour` (numeric) - Maximum requests per hour
      - `is_active` (boolean) - Whether rate limiting is enabled
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `rate_limit_log`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `endpoint_name` (text)
      - `ip_address` (text)
      - `timestamp` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own configs

  3. Indexes
    - Add index on user_id for faster lookups
    - Add index on timestamp for cleanup queries

  4. Notes
    - Rate limit log auto-cleans entries older than 24 hours
    - Default rate limits provide reasonable API usage
*/

-- Create rate_limit_config table
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint_name text NOT NULL,
  requests_per_second numeric DEFAULT 10,
  requests_per_minute numeric DEFAULT 300,
  requests_per_hour numeric DEFAULT 5000,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint_name)
);

-- Create rate_limit_log table
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint_name text NOT NULL,
  ip_address text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Policies for rate_limit_config
CREATE POLICY "Users can view own rate limit configs"
  ON rate_limit_config FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rate limit configs"
  ON rate_limit_config FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rate limit configs"
  ON rate_limit_config FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own rate limit configs"
  ON rate_limit_config FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for rate_limit_log (public access for logging, secured via edge functions)
CREATE POLICY "Public can insert rate limit logs"
  ON rate_limit_log FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can view own rate limit logs"
  ON rate_limit_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS rate_limit_config_user_id_idx ON rate_limit_config(user_id);
CREATE INDEX IF NOT EXISTS rate_limit_log_user_id_idx ON rate_limit_log(user_id);
CREATE INDEX IF NOT EXISTS rate_limit_log_timestamp_idx ON rate_limit_log(timestamp);
CREATE INDEX IF NOT EXISTS rate_limit_log_endpoint_timestamp_idx ON rate_limit_log(endpoint_name, timestamp);

-- Add updated_at trigger for rate_limit_config
CREATE OR REPLACE FUNCTION update_rate_limit_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_rate_limit_config_updated_at_trigger'
  ) THEN
    CREATE TRIGGER update_rate_limit_config_updated_at_trigger
      BEFORE UPDATE ON rate_limit_config
      FOR EACH ROW
      EXECUTE FUNCTION update_rate_limit_config_updated_at();
  END IF;
END $$;

-- Auto cleanup trigger function for rate_limit_log
CREATE OR REPLACE FUNCTION cleanup_old_rate_limit_logs()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM rate_limit_log
  WHERE timestamp < now() - interval '24 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'auto_cleanup_rate_limit_log_trigger'
  ) THEN
    CREATE TRIGGER auto_cleanup_rate_limit_log_trigger
      AFTER INSERT ON rate_limit_log
      FOR EACH ROW
      EXECUTE FUNCTION cleanup_old_rate_limit_logs();
  END IF;
END $$;
