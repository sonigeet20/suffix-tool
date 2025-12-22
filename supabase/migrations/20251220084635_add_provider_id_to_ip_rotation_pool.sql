/*
  # Add Provider ID to IP Rotation Pool

  1. Changes to `ip_rotation_pool` table
    - `provider_id` (uuid, nullable, foreign key) - References proxy_providers table
    - NULL means this IP came from Luna (original default provider)
    - Allows tracking which provider each IP came from

  2. Indexes
    - Index on provider_id for filtering by provider

  3. Notes
    - Nullable for backwards compatibility
    - Existing IPs without provider_id are treated as Luna IPs
*/

-- Add provider_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ip_rotation_pool' AND column_name = 'provider_id'
  ) THEN
    ALTER TABLE ip_rotation_pool ADD COLUMN provider_id uuid REFERENCES proxy_providers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for provider filtering
CREATE INDEX IF NOT EXISTS idx_ip_rotation_pool_provider_id ON ip_rotation_pool(provider_id);

-- Create composite index for provider + status queries
CREATE INDEX IF NOT EXISTS idx_ip_rotation_pool_provider_status ON ip_rotation_pool(provider_id, status);