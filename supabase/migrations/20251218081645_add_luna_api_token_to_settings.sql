/*
  # Add Luna API Token to Settings

  1. Changes
    - Add `luna_api_token` column to settings table
    - This replaces the proxy host/username/password approach
    - Users will now use Luna Proxy's Universal Scraping API

  2. Notes
    - Existing proxy fields remain for backward compatibility
    - Luna API token takes precedence when both are configured
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'luna_api_token'
  ) THEN
    ALTER TABLE settings ADD COLUMN luna_api_token text;
  END IF;
END $$;
