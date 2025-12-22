/*
  # Add User ID to Offers Table

  ## Description
  Associates offers with specific users to enable user-specific settings lookup.
  This allows edge functions to fetch the correct global proxy settings for each user.

  ## Changes
  
  1. Add `user_id` to offers table
    - Foreign key to auth.users
    - Required field for all new offers
    - Enables user-specific proxy settings lookup
    
  2. Clean up legacy proxy fields from offers
    - Remove `proxy_provider` column (moved to global settings)
    - Remove `proxy_config` column (moved to global settings)
    
  3. Update RLS policies
    - Ensure users can only see their own offers
    - Add policies for authenticated users
    
  ## Notes
  - Existing offers without user_id will need to be migrated manually or deleted
  - Edge functions will use offer.user_id to fetch the correct settings row
*/

-- Add user_id to offers table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE offers ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Remove legacy proxy columns from offers (now in global settings)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'proxy_provider'
  ) THEN
    ALTER TABLE offers DROP COLUMN proxy_provider;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'proxy_config'
  ) THEN
    ALTER TABLE offers DROP COLUMN proxy_config;
  END IF;
END $$;

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS offers_user_id_idx ON offers(user_id);

-- Update RLS policies for offers
DROP POLICY IF EXISTS "Users can view own offers" ON offers;
DROP POLICY IF EXISTS "Users can insert own offers" ON offers;
DROP POLICY IF EXISTS "Users can update own offers" ON offers;
DROP POLICY IF EXISTS "Users can delete own offers" ON offers;

CREATE POLICY "Users can view own offers"
  ON offers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own offers"
  ON offers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own offers"
  ON offers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own offers"
  ON offers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);