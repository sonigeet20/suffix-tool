-- Google Ads Click Tracker Migration
-- This migration is ADDITIVE ONLY - creates new tables without modifying existing ones
-- Rollback: Run 20260128_google_ads_click_tracker_rollback.sql

-- ============================================================================
-- 1. GEO SUFFIX BUCKETS TABLE
-- Stores pre-traced suffixes organized by target country for instant serving
-- ============================================================================
CREATE TABLE IF NOT EXISTS geo_suffix_buckets (
    id BIGSERIAL PRIMARY KEY,
    offer_name TEXT NOT NULL,
    target_country TEXT NOT NULL, -- 'US', 'GB', 'ES', or 'US,GB,ES' for multi-geo
    suffix TEXT NOT NULL,
    hop_count INTEGER NOT NULL,
    final_url TEXT NOT NULL,
    traced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    use_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Indexes for fast lookups
    CONSTRAINT geo_suffix_buckets_unique UNIQUE (offer_name, suffix)
);

-- Index for fast unused suffix lookups by offer and geo
CREATE INDEX IF NOT EXISTS idx_geo_suffix_buckets_available 
    ON geo_suffix_buckets(offer_name, target_country, is_used, traced_at) 
    WHERE is_used = FALSE;

-- Index for cleanup queries (find old used suffixes)
CREATE INDEX IF NOT EXISTS idx_geo_suffix_buckets_cleanup 
    ON geo_suffix_buckets(is_used, used_at) 
    WHERE is_used = TRUE;

-- Index for metadata queries
CREATE INDEX IF NOT EXISTS idx_geo_suffix_buckets_metadata 
    ON geo_suffix_buckets USING gin(metadata);

-- ============================================================================
-- 2. GOOGLE ADS CLICK STATS TABLE
-- Tracks click events and metrics per offer/day
-- ============================================================================
CREATE TABLE IF NOT EXISTS google_ads_click_stats (
    id BIGSERIAL PRIMARY KEY,
    offer_name TEXT NOT NULL,
    click_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_country TEXT,
    clicks_today INTEGER NOT NULL DEFAULT 0,
    suffixes_served INTEGER NOT NULL DEFAULT 0,
    transparent_clicks INTEGER NOT NULL DEFAULT 0, -- Clicks without suffix
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One row per offer per day
    CONSTRAINT google_ads_click_stats_unique UNIQUE (offer_name, click_date)
);

-- Index for daily stats queries
CREATE INDEX IF NOT EXISTS idx_google_ads_click_stats_date 
    ON google_ads_click_stats(offer_name, click_date DESC);

-- ============================================================================
-- 3. ADD GOOGLE ADS CONFIG TO OFFERS TABLE (OPTIONAL COLUMN)
-- Nullable JSONB column - won't affect existing offers or queries
-- ============================================================================
DO $$ 
BEGIN
    -- Only add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'offers' 
        AND column_name = 'google_ads_config'
    ) THEN
        ALTER TABLE offers ADD COLUMN google_ads_config JSONB DEFAULT NULL;
    END IF;
END $$;

-- Index for offers with Google Ads enabled
CREATE INDEX IF NOT EXISTS idx_offers_google_ads_enabled 
    ON offers((google_ads_config->>'enabled')) 
    WHERE google_ads_config->>'enabled' = 'true';

-- ============================================================================
-- 4. ADD TRACKING DOMAINS TO SETTINGS TABLE
-- Stores array of domains approved for Google Ads tracking
-- ============================================================================
DO $$ 
BEGIN
    -- Only add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' 
        AND column_name = 'tracking_domains'
    ) THEN
        ALTER TABLE settings ADD COLUMN tracking_domains JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Index for domain lookups
CREATE INDEX IF NOT EXISTS idx_settings_tracking_domains 
    ON settings USING gin(tracking_domains);

-- ============================================================================
-- 5. ADD FEATURE TOGGLE TO SETTINGS TABLE
-- Master switch to enable/disable entire Google Ads feature
-- ============================================================================
DO $$ 
BEGIN
    -- Only add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'settings' 
        AND column_name = 'google_ads_enabled'
    ) THEN
        ALTER TABLE settings ADD COLUMN google_ads_enabled BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to get available suffix from bucket
CREATE OR REPLACE FUNCTION get_geo_suffix(
    p_offer_name TEXT,
    p_target_country TEXT
)
RETURNS TABLE (
    suffix TEXT,
    hop_count INTEGER,
    final_url TEXT
) AS $$
DECLARE
    v_result RECORD;
BEGIN
    -- Try to find unused suffix for exact country match first
    SELECT gsb.suffix, gsb.hop_count, gsb.final_url, gsb.id
    INTO v_result
    FROM geo_suffix_buckets gsb
    WHERE gsb.offer_name = p_offer_name
        AND gsb.target_country = p_target_country
        AND gsb.is_used = FALSE
    ORDER BY gsb.traced_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    -- If found, mark as used and return
    IF FOUND THEN
        UPDATE geo_suffix_buckets
        SET is_used = TRUE,
            used_at = NOW(),
            use_count = use_count + 1
        WHERE id = v_result.id;
        
        RETURN QUERY SELECT v_result.suffix, v_result.hop_count, v_result.final_url;
        RETURN;
    END IF;
    
    -- Try multi-geo suffixes if single geo not found
    SELECT gsb.suffix, gsb.hop_count, gsb.final_url, gsb.id
    INTO v_result
    FROM geo_suffix_buckets gsb
    WHERE gsb.offer_name = p_offer_name
        AND gsb.target_country LIKE '%' || p_target_country || '%'
        AND gsb.is_used = FALSE
    ORDER BY gsb.traced_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF FOUND THEN
        UPDATE geo_suffix_buckets
        SET is_used = TRUE,
            used_at = NOW(),
            use_count = use_count + 1
        WHERE id = v_result.id;
        
        RETURN QUERY SELECT v_result.suffix, v_result.hop_count, v_result.final_url;
        RETURN;
    END IF;
    
    -- No suffix available
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to increment click stats (upsert pattern)
CREATE OR REPLACE FUNCTION increment_click_stats(
    p_offer_name TEXT,
    p_target_country TEXT DEFAULT NULL,
    p_has_suffix BOOLEAN DEFAULT TRUE
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO google_ads_click_stats (
        offer_name,
        click_date,
        target_country,
        clicks_today,
        suffixes_served,
        transparent_clicks,
        updated_at
    ) VALUES (
        p_offer_name,
        CURRENT_DATE,
        p_target_country,
        1,
        CASE WHEN p_has_suffix THEN 1 ELSE 0 END,
        CASE WHEN p_has_suffix THEN 0 ELSE 1 END,
        NOW()
    )
    ON CONFLICT (offer_name, click_date)
    DO UPDATE SET
        clicks_today = google_ads_click_stats.clicks_today + 1,
        suffixes_served = google_ads_click_stats.suffixes_served + 
            CASE WHEN p_has_suffix THEN 1 ELSE 0 END,
        transparent_clicks = google_ads_click_stats.transparent_clicks + 
            CASE WHEN p_has_suffix THEN 0 ELSE 1 END,
        target_country = COALESCE(google_ads_click_stats.target_country, p_target_country),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get bucket stats for an offer
CREATE OR REPLACE FUNCTION get_bucket_stats(p_offer_name TEXT)
RETURNS TABLE (
    target_country TEXT,
    total_suffixes BIGINT,
    available_suffixes BIGINT,
    used_suffixes BIGINT,
    oldest_unused TIMESTAMPTZ,
    newest_unused TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gsb.target_country,
        COUNT(*) as total_suffixes,
        COUNT(*) FILTER (WHERE gsb.is_used = FALSE) as available_suffixes,
        COUNT(*) FILTER (WHERE gsb.is_used = TRUE) as used_suffixes,
        MIN(gsb.traced_at) FILTER (WHERE gsb.is_used = FALSE) as oldest_unused,
        MAX(gsb.traced_at) FILTER (WHERE gsb.is_used = FALSE) as newest_unused
    FROM geo_suffix_buckets gsb
    WHERE gsb.offer_name = p_offer_name
    GROUP BY gsb.target_country
    ORDER BY gsb.target_country;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- Apply same security model as existing tables
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE geo_suffix_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_click_stats ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to geo_suffix_buckets"
    ON geo_suffix_buckets
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role has full access to google_ads_click_stats"
    ON google_ads_click_stats
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to read their own data
-- (Adjust based on your existing RLS patterns)
CREATE POLICY "Authenticated users can read geo_suffix_buckets"
    ON geo_suffix_buckets
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can read google_ads_click_stats"
    ON google_ads_click_stats
    FOR SELECT
    TO authenticated
    USING (true);

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

-- Grant execute on functions to service role
GRANT EXECUTE ON FUNCTION get_geo_suffix TO service_role;
GRANT EXECUTE ON FUNCTION increment_click_stats TO service_role;
GRANT EXECUTE ON FUNCTION get_bucket_stats TO service_role;

-- Grant execute to authenticated users for read-only function
GRANT EXECUTE ON FUNCTION get_bucket_stats TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration
DO $$
BEGIN
    RAISE NOTICE 'Google Ads Click Tracker migration completed successfully';
    RAISE NOTICE 'New tables: geo_suffix_buckets, google_ads_click_stats';
    RAISE NOTICE 'New columns: offers.google_ads_config, settings.tracking_domains, settings.google_ads_enabled';
    RAISE NOTICE 'Feature is DISABLED by default - set settings.google_ads_enabled = TRUE to enable';
END $$;
