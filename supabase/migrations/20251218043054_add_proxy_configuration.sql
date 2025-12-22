/*
  # Add Proxy Configuration for Geo-Targeting

  1. New Tables
    - `proxy_configs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text) - Friendly name for the proxy
      - `proxy_url` (text) - Full proxy URL (http://user:pass@host:port)
      - `country_code` (text) - Target country code (US, UK, etc.)
      - `is_active` (boolean) - Whether this proxy is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `proxy_configs` table
    - Add policies for authenticated users to manage their own proxies

  3. Indexes
    - Add index on user_id for faster lookups
*/

-- Create proxy_configs table
CREATE TABLE IF NOT EXISTS proxy_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  proxy_url text NOT NULL,
  country_code text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE proxy_configs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own proxy configs"
  ON proxy_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proxy configs"
  ON proxy_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proxy configs"
  ON proxy_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own proxy configs"
  ON proxy_configs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS proxy_configs_user_id_idx ON proxy_configs(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_proxy_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_proxy_configs_updated_at_trigger'
  ) THEN
    CREATE TRIGGER update_proxy_configs_updated_at_trigger
      BEFORE UPDATE ON proxy_configs
      FOR EACH ROW
      EXECUTE FUNCTION update_proxy_configs_updated_at();
  END IF;
END $$;
