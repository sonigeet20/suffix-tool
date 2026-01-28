-- Create click stats table for historical tracking
-- Stores daily aggregated stats permanently, while individual events keep processing logic
-- Stats are computed from google_ads_click_events table

CREATE TABLE IF NOT EXISTS public.google_ads_click_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  click_date DATE NOT NULL,
  offer_name TEXT NOT NULL,
  
  -- Click counts
  total_clicks INTEGER DEFAULT 0,
  allowed_clicks INTEGER DEFAULT 0,
  blocked_clicks INTEGER DEFAULT 0,
  
  -- Breakdown by country
  target_countries JSONB DEFAULT '[]'::jsonb, -- [{country: 'US', clicks: 10, blocked: 1}, ...]
  
  -- Breakdown by block reason
  block_reasons JSONB DEFAULT '{}'::jsonb, -- {"Bot detected": 5, "IP blacklisted": 2, ...}
  
  -- Performance metrics
  avg_response_time_ms NUMERIC DEFAULT 0,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_click_stats_date_offer UNIQUE(click_date, offer_name),
  
  -- Foreign key (if offer_name exists in offers table)
  CONSTRAINT fk_click_stats_offer FOREIGN KEY (offer_name) REFERENCES offers(offer_name) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_google_ads_click_stats_date ON google_ads_click_stats(click_date DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_click_stats_offer_date ON google_ads_click_stats(offer_name, click_date DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_click_stats_offer ON google_ads_click_stats(offer_name);

-- Function to compute stats for a specific date/offer
CREATE OR REPLACE FUNCTION compute_click_stats(
  p_click_date DATE,
  p_offer_name TEXT
) RETURNS TABLE (
  total_clicks BIGINT,
  allowed_clicks BIGINT,
  blocked_clicks BIGINT,
  target_countries JSONB,
  block_reasons JSONB,
  avg_response_time NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_clicks,
    COUNT(*) FILTER (WHERE blocked = false OR blocked IS NULL) as allowed_clicks,
    COUNT(*) FILTER (WHERE blocked = true) as blocked_clicks,
    jsonb_agg(DISTINCT jsonb_build_object(
      'country', target_country,
      'clicks', COUNT(*) FILTER (WHERE target_country IS NOT NULL)
    )) FILTER (WHERE target_country IS NOT NULL) as target_countries,
    jsonb_object_agg(block_reason, COUNT(*)) FILTER (WHERE blocked = true AND block_reason IS NOT NULL) as block_reasons,
    AVG(response_time_ms)::NUMERIC as avg_response_time
  FROM google_ads_click_events
  WHERE 
    offer_name = p_offer_name AND
    DATE(clicked_at) = p_click_date;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to refresh click stats (idempotent - updates if exists, inserts if not)
CREATE OR REPLACE FUNCTION refresh_click_stats(
  p_click_date DATE,
  p_offer_name TEXT
) RETURNS TABLE (
  id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_stats RECORD;
  v_stat_id UUID;
BEGIN
  -- Get computed stats
  SELECT * INTO v_stats FROM compute_click_stats(p_click_date, p_offer_name);
  
  IF v_stats IS NULL THEN
    RETURN QUERY SELECT gen_random_uuid(), false, 'No click data for this date/offer'::TEXT;
    RETURN;
  END IF;
  
  -- Upsert into stats table
  INSERT INTO google_ads_click_stats (
    click_date,
    offer_name,
    total_clicks,
    allowed_clicks,
    blocked_clicks,
    target_countries,
    block_reasons,
    avg_response_time_ms
  ) VALUES (
    p_click_date,
    p_offer_name,
    (v_stats).total_clicks,
    (v_stats).allowed_clicks,
    (v_stats).blocked_clicks,
    (v_stats).target_countries,
    (v_stats).block_reasons,
    (v_stats).avg_response_time
  )
  ON CONFLICT (click_date, offer_name) DO UPDATE SET
    total_clicks = EXCLUDED.total_clicks,
    allowed_clicks = EXCLUDED.allowed_clicks,
    blocked_clicks = EXCLUDED.blocked_clicks,
    target_countries = EXCLUDED.target_countries,
    block_reasons = EXCLUDED.block_reasons,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    updated_at = CURRENT_TIMESTAMP
  RETURNING google_ads_click_stats.id INTO v_stat_id;
  
  RETURN QUERY SELECT v_stat_id, true, 'Stats updated'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to get stats for date range (with optional offer filter)
CREATE OR REPLACE FUNCTION get_click_stats_range(
  p_start_date DATE,
  p_end_date DATE,
  p_offer_name TEXT DEFAULT NULL
) RETURNS TABLE (
  click_date DATE,
  offer_name TEXT,
  total_clicks INTEGER,
  allowed_clicks INTEGER,
  blocked_clicks INTEGER,
  block_rate NUMERIC,
  avg_response_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.click_date,
    cs.offer_name,
    cs.total_clicks,
    cs.allowed_clicks,
    cs.blocked_clicks,
    CASE WHEN cs.total_clicks > 0 
      THEN (cs.blocked_clicks::NUMERIC / cs.total_clicks * 100)::NUMERIC(5,2)
      ELSE 0::NUMERIC 
    END as block_rate,
    cs.avg_response_time_ms
  FROM google_ads_click_stats cs
  WHERE 
    cs.click_date BETWEEN p_start_date AND p_end_date AND
    (p_offer_name IS NULL OR cs.offer_name = p_offer_name)
  ORDER BY cs.click_date DESC, cs.offer_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS for click stats table
ALTER TABLE google_ads_click_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own stats
CREATE POLICY "Users can view click stats" ON google_ads_click_stats
  FOR SELECT USING (true);

-- Policy: Only service role can insert/update/delete
CREATE POLICY "Service can manage click stats" ON google_ads_click_stats
  FOR ALL USING (auth.role() = 'service_role');

-- Comment on table
COMMENT ON TABLE google_ads_click_stats IS 'Daily aggregated Google Ads click statistics - kept permanently for historical reporting';
