-- Migration: Add GCLID tracking tables for Google Ads conversion tracking
-- Created: 2026-02-01 (Fixed)
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

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'GCLID tracking tables created successfully';
    RAISE NOTICE 'Tables: gclid_click_mapping, google_ads_conversions';
    RAISE NOTICE '';
    RAISE NOTICE 'Note: Configuration is stored in offers.google_ads_config JSONB column with fields:';
    RAISE NOTICE '  - gclid_param_token: Network parameter name (e.g., "xcust", "subid")';
    RAISE NOTICE '  - silent_fetch_tracking_url: Affiliate network tracking URL';
    RAISE NOTICE '  - trace_mode: http_only|browser|anti_cloaking|interactive';
    RAISE NOTICE '  - use_residential_proxy_for_tracking: boolean';
    RAISE NOTICE '  - silent_fetch_enabled: boolean';
END $$;
