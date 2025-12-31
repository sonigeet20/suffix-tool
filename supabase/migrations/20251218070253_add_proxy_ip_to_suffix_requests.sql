/*
  # Add proxy_ip to suffix_requests table

  1. Changes
    - Add `proxy_ip` column to `suffix_requests` table to track which proxy was used for the trace
    - This allows displaying proxy IP in suffix request analytics
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suffix_requests' AND column_name = 'proxy_ip'
  ) THEN
    ALTER TABLE suffix_requests ADD COLUMN proxy_ip text;
  END IF;
END $$;