-- Google Ads Silent Fetch Stats Migration
-- Tracks silent fetch requests with 7-day retention
-- This is ADDITIVE ONLY - creates new table without modifying existing ones

-- ============================================================================
-- 1. SILENT FETCH STATS TABLE
-- Stores silent fetch request logs with automatic 7-day cleanup
-- ============================================================================
CREATE TABLE IF NOT EXISTS google_ads_silent_fetch_stats (
    id BIGSERIAL PRIMARY KEY,
    offer_name TEXT NOT NULL,
    client_country TEXT,
    client_ip TEXT,
    fetch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_silent_fetch_stats_date 
    ON google_ads_silent_fetch_stats(fetch_date);

CREATE INDEX IF NOT EXISTS idx_silent_fetch_stats_offer 
    ON google_ads_silent_fetch_stats(offer_name, fetch_date);

-- ============================================================================
-- 2. AUTO-CLEANUP FUNCTION
-- Removes data older than 7 days
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_silent_fetch_stats()
RETURNS void AS $$
BEGIN
    DELETE FROM google_ads_silent_fetch_stats
    WHERE fetch_date < CURRENT_DATE - INTERVAL '7 days';
    
    RAISE NOTICE 'Cleaned up silent fetch stats older than 7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- Apply same security model as existing tables
-- ============================================================================
ALTER TABLE google_ads_silent_fetch_stats ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then create
DROP POLICY IF EXISTS "Service role has full access to silent_fetch_stats"
    ON google_ads_silent_fetch_stats;

CREATE POLICY "Service role has full access to silent_fetch_stats"
    ON google_ads_silent_fetch_stats
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 4. HELPER FUNCTION TO GET STATS
-- ============================================================================
CREATE OR REPLACE FUNCTION get_silent_fetch_stats(
    p_offer_name TEXT,
    p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
    fetch_date DATE,
    total_fetches BIGINT,
    unique_countries BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gsfs.fetch_date,
        COUNT(*) as total_fetches,
        COUNT(DISTINCT gsfs.client_country) as unique_countries
    FROM google_ads_silent_fetch_stats gsfs
    WHERE gsfs.offer_name = p_offer_name
        AND gsfs.fetch_date >= CURRENT_DATE - p_days
    GROUP BY gsfs.fetch_date
    ORDER BY gsfs.fetch_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON TABLE google_ads_silent_fetch_stats IS 'Tracks silent fetch requests for Google Ads (7-day retention)';
COMMENT ON FUNCTION cleanup_old_silent_fetch_stats() IS 'Removes silent fetch stats older than 7 days';
COMMENT ON FUNCTION get_silent_fetch_stats(TEXT, INTEGER) IS 'Get silent fetch statistics for an offer';
