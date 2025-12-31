/*
  # Add IP Cooldown and Proxy Rotation Settings

  1. Changes to `settings` table
    - `ip_cooldown_seconds` (integer, nullable) - Time in seconds before an IP can be reused (default: 60 when NULL)
    - `proxy_rotation_mode` (text, nullable) - Rotation strategy: sequential, random, weighted, failover
    - `proxy_failover_enabled` (boolean, nullable, default true) - Whether to automatically failover to next provider on error

  2. Notes
    - All columns nullable for backwards compatibility
    - NULL values mean use default behavior (60s cooldown, sequential rotation, failover enabled)
    - Existing offers and functionality unaffected
*/

-- Add IP cooldown configuration (NULL = 60 seconds default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'ip_cooldown_seconds'
  ) THEN
    ALTER TABLE settings ADD COLUMN ip_cooldown_seconds integer;
  END IF;
END $$;

-- Add proxy rotation mode (NULL = sequential default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'proxy_rotation_mode'
  ) THEN
    ALTER TABLE settings ADD COLUMN proxy_rotation_mode text;
  END IF;
END $$;

-- Add proxy failover enabled flag (NULL = true default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'proxy_failover_enabled'
  ) THEN
    ALTER TABLE settings ADD COLUMN proxy_failover_enabled boolean;
  END IF;
END $$;

-- Add check constraint for ip_cooldown_seconds (10-300 seconds range)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'settings' AND constraint_name = 'settings_ip_cooldown_seconds_check'
  ) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_ip_cooldown_seconds_check 
      CHECK (ip_cooldown_seconds IS NULL OR (ip_cooldown_seconds >= 10 AND ip_cooldown_seconds <= 300));
  END IF;
END $$;

-- Add check constraint for proxy_rotation_mode (valid modes only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'settings' AND constraint_name = 'settings_proxy_rotation_mode_check'
  ) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_proxy_rotation_mode_check 
      CHECK (proxy_rotation_mode IS NULL OR proxy_rotation_mode IN ('sequential', 'random', 'weighted', 'failover'));
  END IF;
END $$;