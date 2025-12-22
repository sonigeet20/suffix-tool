/*
  # Fix Settings Table - Remove Singleton Constraint
  
  ## Description
  Removes the singleton constraint from settings table to allow per-user settings.
  The previous migration added user_id but forgot to drop the singleton constraint.
  
  ## Changes
  1. Delete any orphaned settings rows without user_id
  2. Drop singleton constraint that limited table to one row
  3. Make user_id NOT NULL (all settings must belong to a user)
  4. Add unique constraint on user_id (one settings row per user)
  
  ## Security
  - Maintains existing RLS policies
  - Ensures data integrity with per-user constraints
*/

-- Delete any orphaned settings rows without user_id
DELETE FROM settings WHERE user_id IS NULL;

-- Drop the singleton constraint
DROP INDEX IF EXISTS settings_singleton_idx;

-- Make user_id NOT NULL
ALTER TABLE settings 
  ALTER COLUMN user_id SET NOT NULL;

-- Add unique constraint for per-user settings
CREATE UNIQUE INDEX IF NOT EXISTS settings_user_id_unique_idx 
  ON settings(user_id);
