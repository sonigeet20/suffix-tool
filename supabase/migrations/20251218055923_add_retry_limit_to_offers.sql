/*
  # Add Retry Limit to Offers

  1. Changes
    - Add `retry_limit` column to offers table
      - Default value of 3 retries
      - Allows customization per offer
    - Add `retry_delay_ms` column for delay between retries
      - Default 2000ms (2 seconds)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'retry_limit'
  ) THEN
    ALTER TABLE offers ADD COLUMN retry_limit integer DEFAULT 3;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'retry_delay_ms'
  ) THEN
    ALTER TABLE offers ADD COLUMN retry_delay_ms integer DEFAULT 2000;
  END IF;
END $$;