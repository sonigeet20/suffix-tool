/*
  # Add redirect chain step selection to offers

  1. Changes
    - Add `redirect_chain_step` column to `offers` table
      - Stores which step in the redirect chain to extract params from
      - Defaults to 0 (first step with params)
    - Add index for performance

  2. Notes
    - This allows users to select which URL in the redirect chain to extract parameters from
    - The step number is 0-based (0 = first step, 1 = second step, etc.)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'redirect_chain_step'
  ) THEN
    ALTER TABLE offers ADD COLUMN redirect_chain_step integer DEFAULT 0;
  END IF;
END $$;