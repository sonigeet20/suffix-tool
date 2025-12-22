/*
  # Create Profiles for Existing Users

  1. Purpose
    - Creates user_profiles entries for any existing auth.users who don't have one yet
    - Assigns the first user (by created_at) as admin
    - Assigns all other users as viewers
    
  2. Changes
    - Inserts missing user profiles based on auth.users
    - Uses created_at timestamp to determine the first user
    
  3. Notes
    - Idempotent: Safe to run multiple times
    - Only creates profiles for users that don't already have one
*/

-- Create profiles for existing users who don't have one
DO $$
DECLARE
  first_user_id uuid;
BEGIN
  -- Get the ID of the first user (by created_at)
  SELECT id INTO first_user_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  -- Insert profiles for users who don't have one yet
  INSERT INTO public.user_profiles (id, email, role, created_at, updated_at)
  SELECT 
    u.id,
    u.email,
    CASE 
      WHEN u.id = first_user_id THEN 'admin'::user_role
      ELSE 'viewer'::user_role
    END as role,
    u.created_at,
    now()
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON u.id = p.id
  WHERE p.id IS NULL;
  
END $$;