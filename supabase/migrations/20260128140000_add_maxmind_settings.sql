-- Add MaxMind API configuration to settings table

DO $$ 
BEGIN
    -- Add maxmind_license_key column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' 
        AND column_name = 'maxmind_license_key'
    ) THEN
        ALTER TABLE settings ADD COLUMN maxmind_license_key TEXT DEFAULT NULL;
        COMMENT ON COLUMN settings.maxmind_license_key IS 'MaxMind GeoLite2 license key for bot/datacenter detection';
    END IF;
END $$;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_maxmind_key 
    ON settings(maxmind_license_key) 
    WHERE maxmind_license_key IS NOT NULL;
