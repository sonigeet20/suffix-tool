-- Add filtration configuration columns to settings table
-- Enables frontend control of bot/IP filtering rules

DO $$ 
BEGIN
    -- Filtration enabled flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_filtering_enabled'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_filtering_enabled BOOLEAN DEFAULT TRUE;
        COMMENT ON COLUMN settings.google_ads_filtering_enabled IS 'Enable/disable all Google Ads click filtering';
    END IF;

    -- Bot detection enabled
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_bot_detection_enabled'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_bot_detection_enabled BOOLEAN DEFAULT TRUE;
        COMMENT ON COLUMN settings.google_ads_bot_detection_enabled IS 'Enable bot detection (User-Agent patterns, isbot library)';
    END IF;

    -- Datacenter blocking enabled
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_block_datacenters_enabled'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_block_datacenters_enabled BOOLEAN DEFAULT TRUE;
        COMMENT ON COLUMN settings.google_ads_block_datacenters_enabled IS 'Block datacenter/cloud IPs (AWS, Google Cloud, Azure, etc)';
    END IF;

    -- Repeat IP window (days)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_repeat_ip_window_days'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_repeat_ip_window_days INTEGER DEFAULT 7;
        COMMENT ON COLUMN settings.google_ads_repeat_ip_window_days IS 'Days to block repeated IPs (0 = disabled)';
    END IF;

    -- Repeat IP filtering enabled
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_repeat_ip_enabled'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_repeat_ip_enabled BOOLEAN DEFAULT TRUE;
        COMMENT ON COLUMN settings.google_ads_repeat_ip_enabled IS 'Enable repeat IP detection across offers';
    END IF;

    -- Rate limiting enabled
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_rate_limit_enabled'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_rate_limit_enabled BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN settings.google_ads_rate_limit_enabled IS 'Enable rate limiting per IP';
    END IF;

    -- Rate limit max clicks per IP
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_rate_limit_max_clicks'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_rate_limit_max_clicks INTEGER DEFAULT 10;
        COMMENT ON COLUMN settings.google_ads_rate_limit_max_clicks IS 'Max clicks per IP within window';
    END IF;

    -- Rate limit window (minutes)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_rate_limit_window_minutes'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_rate_limit_window_minutes INTEGER DEFAULT 60;
        COMMENT ON COLUMN settings.google_ads_rate_limit_window_minutes IS 'Time window for rate limit (minutes)';
    END IF;

    -- IP blacklist (JSONB array)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_ip_blacklist'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_ip_blacklist JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN settings.google_ads_ip_blacklist IS 'List of IPs to always block (JSON array)';
    END IF;

    -- IP whitelist (JSONB array)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_ip_whitelist'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_ip_whitelist JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN settings.google_ads_ip_whitelist IS 'If set, ONLY allow these IPs (JSON array)';
    END IF;

    -- Country blacklist (JSONB array)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_country_blacklist'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_country_blacklist JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN settings.google_ads_country_blacklist IS 'Countries to block (2-letter codes, JSON array)';
    END IF;

    -- Country whitelist (JSONB array)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' AND column_name = 'google_ads_country_whitelist'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_country_whitelist JSONB DEFAULT '[]'::jsonb;
        COMMENT ON COLUMN settings.google_ads_country_whitelist IS 'If set, ONLY allow these countries (2-letter codes, JSON array)';
    END IF;

    RAISE NOTICE 'Successfully added Google Ads filtering configuration columns to settings table';
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_google_ads_click_events_user_ip_clicked_at 
  ON google_ads_click_events(user_ip, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_google_ads_click_events_blocked 
  ON google_ads_click_events(blocked, clicked_at DESC);
