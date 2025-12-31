/*
  # Remove Luna API Token Column

  1. Changes
    - Remove `luna_api_token` column from settings table
    - This column is no longer needed as the system exclusively uses residential proxy credentials
  
  2. Notes
    - The application now only supports Luna residential proxy credentials
    - Users must configure host, port, username, and password
    - Luna API token approach has been completely removed
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'luna_api_token'
  ) THEN
    ALTER TABLE settings DROP COLUMN luna_api_token;
  END IF;
END $$;
