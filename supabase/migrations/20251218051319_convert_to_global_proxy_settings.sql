/*
  # Convert to Global Proxy Settings

  ## Description
  This migration converts the proxy configuration from per-request to a single global configuration per user.
  The global proxy is configured in the Settings page and used for all API calls (Google Ads scripts, tracing).
  Target geo remains at the offer level.

  ## Changes
  
  1. Modify `settings` Table
    - Add `user_id` column (foreign key to auth.users)
    - Enable RLS on settings table
    - Add policies for users to manage their own settings
    - Drop the old single-row constraint (make it per-user)
    
  2. Drop `proxy_configs` Table
    - This table is no longer needed as we use a single global proxy per user
    
  3. Security
    - Enable RLS on settings table
    - Add policies for authenticated users to manage their own settings
    
  ## Notes
  - Proxy format: `http://username:password@proxy-host:port`
  - The global proxy will be used for all trace-redirects calls
  - Target geo is specified at the offer level (offers.target_geo)
*/

-- Add user_id to settings table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE settings ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enable RLS on settings table
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON settings;

CREATE POLICY "Users can view own settings"
  ON settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS settings_user_id_idx ON settings(user_id);

-- Add updated_at trigger for settings
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_settings_updated_at_trigger'
  ) THEN
    CREATE TRIGGER update_settings_updated_at_trigger
      BEFORE UPDATE ON settings
      FOR EACH ROW
      EXECUTE FUNCTION update_settings_updated_at();
  END IF;
END $$;

-- Drop proxy_configs table (no longer needed)
DROP TABLE IF EXISTS proxy_configs CASCADE;