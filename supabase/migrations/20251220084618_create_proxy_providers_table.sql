/*
  # Create Proxy Providers Table

  1. New Tables
    - `proxy_providers`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid, foreign key) - Owner of this provider configuration
      - `name` (text) - User-friendly name for the provider
      - `provider_type` (text) - Type: brightdata, oxylabs, smartproxy, luna, custom
      - `host` (text) - Proxy server hostname
      - `port` (integer) - Proxy server port
      - `username` (text) - Proxy authentication username
      - `password` (text) - Proxy authentication password
      - `api_endpoint_example` (text, nullable) - Example API endpoint for format reference
      - `curl_example` (text, nullable) - Example cURL command showing request format
      - `priority` (integer) - Priority/weight for rotation (1-100)
      - `enabled` (boolean) - Whether this provider is active
      - `success_count` (integer) - Number of successful requests
      - `failure_count` (integer) - Number of failed requests
      - `last_used_at` (timestamptz, nullable) - Last time this provider was used
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `proxy_providers` table
    - Add policy for users to manage their own providers

  3. Indexes
    - Index on user_id for fast lookups
    - Index on enabled for filtering active providers
    - Index on priority for rotation ordering
*/

-- Create proxy_providers table
CREATE TABLE IF NOT EXISTS proxy_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('brightdata', 'oxylabs', 'smartproxy', 'luna', 'custom')),
  host text NOT NULL,
  port integer NOT NULL CHECK (port > 0 AND port <= 65535),
  username text NOT NULL,
  password text NOT NULL,
  api_endpoint_example text,
  curl_example text,
  priority integer NOT NULL DEFAULT 50 CHECK (priority >= 1 AND priority <= 100),
  enabled boolean NOT NULL DEFAULT true,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE proxy_providers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own providers"
  ON proxy_providers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own providers"
  ON proxy_providers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own providers"
  ON proxy_providers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own providers"
  ON proxy_providers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_proxy_providers_user_id ON proxy_providers(user_id);
CREATE INDEX IF NOT EXISTS idx_proxy_providers_enabled ON proxy_providers(enabled);
CREATE INDEX IF NOT EXISTS idx_proxy_providers_priority ON proxy_providers(priority DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_providers_user_enabled ON proxy_providers(user_id, enabled);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_proxy_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_proxy_providers_updated_at
  BEFORE UPDATE ON proxy_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_proxy_providers_updated_at();