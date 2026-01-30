-- Allow frontend (anon/authenticated) to read silent fetch stats
-- Needed for UI to display events while keeping RLS enabled

ALTER TABLE google_ads_silent_fetch_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access to silent_fetch_stats"
    ON google_ads_silent_fetch_stats;

CREATE POLICY "Public read access to silent_fetch_stats"
    ON google_ads_silent_fetch_stats
    FOR SELECT
    TO anon, authenticated
    USING (true);
