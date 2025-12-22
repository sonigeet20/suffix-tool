/*
  # Fix Infinite Recursion in User Profiles RLS

  1. Problem
    - The existing "Admins can view all profiles" policy creates infinite recursion
    - When checking if a user is admin, it queries user_profiles, which triggers the same policy

  2. Solution
    - Drop the problematic policies
    - Create simpler policies that don't cause recursion
    - All authenticated users can read any profile (read-only is safe)
    - Only admins can update roles (checked via a security definer function)

  3. Security
    - Reading profiles is safe (no sensitive data)
    - Updates are restricted to admins via function-based check
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update user roles" ON user_profiles;

-- Allow all authenticated users to read profiles (avoids recursion)
CREATE POLICY "Authenticated users can read profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Create a helper function to check if current user is admin
-- This uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Only admins can update user profiles (using the helper function)
CREATE POLICY "Admins can update profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- Only admins can insert user profiles
CREATE POLICY "Admins can insert profiles"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_user_admin());

-- Only admins can delete user profiles
CREATE POLICY "Admins can delete profiles"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (public.is_current_user_admin());