-- Migration: Track instance IPs for automatic BrightData whitelisting
-- This table stores all EC2 instance IPs and their whitelist status

CREATE TABLE IF NOT EXISTS tracked_instance_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id TEXT NOT NULL UNIQUE, -- AWS instance ID (i-xxxxx)
  public_ip INET NOT NULL, -- Instance public IP
  whitelisted BOOLEAN DEFAULT FALSE, -- Whether IP is whitelisted in BrightData
  last_whitelist_attempt TIMESTAMPTZ, -- When we last tried to whitelist it
  whitelist_error TEXT, -- Error message if whitelist failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Indexes for common queries
  CONSTRAINT valid_ip CHECK (public_ip IS NOT NULL)
);

-- Index for finding unwhitelisted IPs
CREATE INDEX IF NOT EXISTS idx_tracked_ips_not_whitelisted 
  ON tracked_instance_ips(whitelisted, last_whitelist_attempt) 
  WHERE whitelisted = FALSE;

-- Index for checking by instance ID
CREATE INDEX IF NOT EXISTS idx_tracked_ips_instance_id 
  ON tracked_instance_ips(instance_id);

-- Index for finding recently created instances
CREATE INDEX IF NOT EXISTS idx_tracked_ips_created_at 
  ON tracked_instance_ips(created_at DESC);

-- Add comment
COMMENT ON TABLE tracked_instance_ips IS 'Tracks EC2 instance IPs and their BrightData whitelist status for automatic management';
COMMENT ON COLUMN tracked_instance_ips.instance_id IS 'AWS EC2 instance ID (e.g., i-0123456789abcdef0)';
COMMENT ON COLUMN tracked_instance_ips.public_ip IS 'Public IP address of the instance';
COMMENT ON COLUMN tracked_instance_ips.whitelisted IS 'TRUE if IP is whitelisted in BrightData zone';
COMMENT ON COLUMN tracked_instance_ips.last_whitelist_attempt IS 'Timestamp of last whitelist attempt (helps avoid rate limiting)';
COMMENT ON COLUMN tracked_instance_ips.whitelist_error IS 'Error message if whitelisting failed (null if successful)';
