/*
  # User Roles System

  1. New Tables
    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `role` (enum: admin, viewer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `user_invites`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `role` (enum: admin, viewer)
      - `invite_token` (text, unique)
      - `invited_by` (uuid, references auth.users)
      - `expires_at` (timestamptz)
      - `accepted_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for role-based access
    - Create function to auto-create profile on user signup
    - Create admin function to invite users
    - First user automatically becomes admin

  3. Indexes
    - Index on offers table for pagination
    - Index on suffix_requests for filtering
    - Index on url_traces for filtering
*/

-- Create role enum type
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_invites table
CREATE TABLE IF NOT EXISTS user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  invite_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update user roles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Policies for user_invites
CREATE POLICY "Admins can manage invites"
  ON user_invites FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_count integer;
  assigned_role user_role;
BEGIN
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM auth.users;

  -- First user is admin, others are viewer
  IF user_count = 1 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'viewer';
  END IF;

  -- Create profile
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, assigned_role);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function for admins to create user accounts
CREATE OR REPLACE FUNCTION public.admin_create_user_invite(
  user_email text,
  user_role user_role DEFAULT 'viewer'
)
RETURNS json AS $$
DECLARE
  current_user_role user_role;
  invite_record record;
BEGIN
  -- Check if current user is admin
  SELECT role INTO current_user_role
  FROM user_profiles
  WHERE id = auth.uid();

  IF current_user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can create user invites';
  END IF;

  -- Create invite
  INSERT INTO user_invites (email, role, invited_by)
  VALUES (user_email, user_role, auth.uid())
  RETURNING * INTO invite_record;

  RETURN json_build_object(
    'success', true,
    'invite_token', invite_record.invite_token,
    'email', invite_record.email,
    'expires_at', invite_record.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add indexes for pagination and filtering
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_offer_name ON offers(offer_name);
CREATE INDEX IF NOT EXISTS idx_offers_is_active ON offers(is_active);
CREATE INDEX IF NOT EXISTS idx_offers_user_id ON offers(user_id);

CREATE INDEX IF NOT EXISTS idx_suffix_requests_offer_id ON suffix_requests(offer_id);
CREATE INDEX IF NOT EXISTS idx_suffix_requests_requested_at ON suffix_requests(requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_url_traces_offer_id ON url_traces(offer_id);
CREATE INDEX IF NOT EXISTS idx_url_traces_visited_at ON url_traces(visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Update existing offers table RLS to consider roles
DROP POLICY IF EXISTS "Users can view own offers" ON offers;
DROP POLICY IF EXISTS "Users can create offers" ON offers;
DROP POLICY IF EXISTS "Users can update own offers" ON offers;
DROP POLICY IF EXISTS "Users can delete own offers" ON offers;

CREATE POLICY "Users can view offers based on role"
  ON offers FOR SELECT
  TO authenticated
  USING (
    -- Admins can see all, viewers can see all (read-only)
    true
  );

CREATE POLICY "Only admins can create offers"
  ON offers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update offers"
  ON offers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete offers"
  ON offers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Similar policies for settings table
DROP POLICY IF EXISTS "Users can view own settings" ON settings;
DROP POLICY IF EXISTS "Users can update own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON settings;

CREATE POLICY "Only admins can view settings"
  ON settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can insert settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );