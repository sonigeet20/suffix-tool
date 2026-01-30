-- Migration: Add GCLID tracking tables for Google Ads conversion tracking
-- Created: 2026-02-01
-- Purpose: Store GCLID->click_id mappings and track conversions for attribution

-- Table 1: GCLID Click Mapping
-- Maps Google Click ID (gclid) to affiliate network click ID (xcust/subid) for conversion attribution
CREATE TABLE IF NOT EXISTS gclid_click_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gclid TEXT NOT NULL,
    offer_name TEXT NOT NULL,
    click_id TEXT, -- Will be updated when we get xcust back from affiliate network
    client_country TEXT,
    client_ip TEXT,
    user_agent TEXT,
    tracking_url TEXT,
    landing_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast GCLID lookups during conversion postbacks
CREATE INDEX IF NOT EXISTS idx_gclid_click_mapping_gclid ON gclid_click_mapping(gclid);
CREATE INDEX IF NOT EXISTS idx_gclid_click_mapping_click_id ON gclid_click_mapping(click_id);
CREATE INDEX IF NOT EXISTS idx_gclid_click_mapping_created_at ON gclid_click_mapping(created_at DESC);

-- Table 2: Google Ads Conversions
-- Stores conversion events received from affiliate network postbacks
CREATE TABLE IF NOT EXISTS google_ads_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gclid TEXT NOT NULL,
    offer_name TEXT NOT NULL,
    click_id TEXT, -- xcust/subid from affiliate network
    conversion_value DECIMAL(10, 2),
    conversion_currency TEXT DEFAULT 'USD',
    conversion_label TEXT, -- Google Ads conversion label (for API reporting)
    postback_data JSONB, -- Raw postback data from affiliate network
    reported_to_google BOOLEAN DEFAULT FALSE,
    google_report_status TEXT, -- Status of report to Google Ads API
    google_report_response JSONB, -- Response from Google Ads API
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_at TIMESTAMPTZ
);

-- Index for conversion lookups and reporting
CREATE INDEX IF NOT EXISTS idx_google_ads_conversions_gclid ON google_ads_conversions(gclid);
CREATE INDEX IF NOT EXISTS idx_google_ads_conversions_click_id ON google_ads_conversions(click_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_conversions_reported ON google_ads_conversions(reported_to_google);
CREATE INDEX IF NOT EXISTS idx_google_ads_conversions_created_at ON google_ads_conversions(created_at DESC);

-- Add column to google_ads_config to enable residential proxy for tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'google_ads_config' 
        AND column_name = 'use_residential_proxy_for_tracking'
    ) THEN
        ALTER TABLE google_ads_config 
        ADD COLUMN use_residential_proxy_for_tracking BOOLEAN DEFAULT TRUE;
        
        COMMENT ON COLUMN google_ads_config.use_residential_proxy_for_tracking 
        IS 'Use residential proxy for server-side tracking requests to match client country';
    END IF;
END $$;

-- Add column to google_ads_config for GCLID parameter token mapping
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'google_ads_config' 
        AND column_name = 'gclid_param_token'
    ) THEN
        ALTER TABLE google_ads_config 
        ADD COLUMN gclid_param_token TEXT;
        
        COMMENT ON COLUMN google_ads_config.gclid_param_token 
        IS 'Network-specific parameter name for GCLID (e.g., "xcust" for Skimlinks, "subid" for others). This will be appended as &param=gclid_value to the tracking URL';
    END IF;
END $$;

-- Add column for tracking URL (separate from silent_fetch_url for clarity)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'google_ads_config' 
        AND column_name = 'silent_fetch_tracking_url'
    ) THEN
        ALTER TABLE google_ads_config 
        ADD COLUMN silent_fetch_tracking_url TEXT;
        
        COMMENT ON COLUMN google_ads_config.silent_fetch_tracking_url 
        IS 'Tracking URL for silent fetch (e.g., affiliate network URL). If not set, falls back to silent_fetch_url';
    END IF;
END $$;

-- Add column for trace mode configuration
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'google_ads_config' 
        AND column_name = 'trace_mode'
    ) THEN
        ALTER TABLE google_ads_config 
        ADD COLUMN trace_mode TEXT DEFAULT 'http_only';
        
        COMMENT ON COLUMN google_ads_config.trace_mode 
        IS 'Trace mode for tracking URL hits: http_only (fast), browser (full rendering), anti_cloaking, interactive. Defaults to http_only';
    END IF;
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'GCLID tracking tables created successfully';
    RAISE NOTICE 'Tables: gclid_click_mapping, google_ads_conversions';
    RAISE NOTICE 'Columns added: use_residential_proxy_for_tracking, gclid_param_token, silent_fetch_tracking_url, trace_mode';
    RAISE NOTICE '';
    RAISE NOTICE 'Setup Instructions:';
    RAISE NOTICE '1. Set gclid_param_token to your network parameter (e.g., "xcust" for Skimlinks, "subid" for others)';
    RAISE NOTICE '2. Set silent_fetch_tracking_url to your affiliate network tracking URL';
    RAISE NOTICE '3. Set trace_mode to control how tracking URL is hit: http_only (fast), browser (full), anti_cloaking';
    RAISE NOTICE '4. In Google Ads tracking template, use: clickref={gclid}';
    RAISE NOTICE '5. System will automatically append &xcust=<gclid_value> (or your param) to tracking URL';
END $$;
