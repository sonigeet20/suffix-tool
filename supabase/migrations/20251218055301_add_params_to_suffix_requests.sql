/*
  # Add Parameters Column to Suffix Requests

  1. Changes
    - Add `params` jsonb column to `suffix_requests` table to store the extracted query parameters
    - This allows displaying individual parameters in analytics instead of just the stringified suffix

  2. Purpose
    - Store the parsed query parameters from traced URLs
    - Enable better analytics and debugging of suffix requests
    - Show individual parameter key-value pairs in the dashboard
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suffix_requests' AND column_name = 'params'
  ) THEN
    ALTER TABLE suffix_requests ADD COLUMN params jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;
