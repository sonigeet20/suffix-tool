/*
  # Add Trackier API Key to Settings

  ## Summary
  - Store Trackier API key per user in settings table
  - Allows reusing the key across Trackier offers without re-entering
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'trackier_api_key'
  ) THEN
    ALTER TABLE settings ADD COLUMN trackier_api_key text;
  END IF;
END $$;
