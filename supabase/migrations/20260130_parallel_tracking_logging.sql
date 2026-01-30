-- Enhanced Parallel Tracking and Conversion Logging
-- Adds fields to detect Google parallel tracking hits and track conversions

-- Add columns to track parallel tracking and conversions
ALTER TABLE google_ads_click_events 
  ADD COLUMN IF NOT EXISTS is_parallel_tracking BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parallel_tracking_indicators JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS conversion_tracked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS conversion_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS conversion_id TEXT,
  ADD COLUMN IF NOT EXISTS click_id TEXT; -- For tracking through to conversion

-- Index for parallel tracking analysis
CREATE INDEX IF NOT EXISTS idx_click_events_parallel_tracking 
  ON google_ads_click_events(is_parallel_tracking, clicked_at DESC)
  WHERE is_parallel_tracking = TRUE;

-- Index for conversion analysis  
CREATE INDEX IF NOT EXISTS idx_click_events_conversions
  ON google_ads_click_events(conversion_tracked, conversion_timestamp DESC)
  WHERE conversion_tracked = TRUE;

-- Index for click_id lookups (for conversion matching)
CREATE INDEX IF NOT EXISTS idx_click_events_click_id
  ON google_ads_click_events(click_id)
  WHERE click_id IS NOT NULL;

-- Function to detect if a request is likely from Google parallel tracking
CREATE OR REPLACE FUNCTION detect_parallel_tracking(
  p_user_agent TEXT,
  p_referrer TEXT,
  p_headers JSONB
)
RETURNS TABLE (
  is_parallel BOOLEAN,
  indicators JSONB
) AS $$
DECLARE
  v_indicators JSONB := '{}'::jsonb;
  v_is_parallel BOOLEAN := FALSE;
BEGIN
  -- Check for Google bot user agents (parallel tracking often uses these)
  IF p_user_agent ILIKE '%googlebot%' OR 
     p_user_agent ILIKE '%google-adwords%' OR
     p_user_agent ILIKE '%google ads%' OR
     p_user_agent ILIKE '%AdsBot-Google%' THEN
    v_is_parallel := TRUE;
    v_indicators := jsonb_set(v_indicators, '{user_agent_match}', 'true'::jsonb);
  END IF;

  -- Check for no referrer (parallel tracking often has no referrer)
  IF p_referrer IS NULL OR p_referrer = '' THEN
    v_indicators := jsonb_set(v_indicators, '{no_referrer}', 'true'::jsonb);
  END IF;

  -- Check for Google-related headers
  IF p_headers ? 'x-google-ads-id' OR 
     p_headers ? 'x-google-gclid' OR
     p_headers ? 'google-cloud-trace-context' THEN
    v_is_parallel := TRUE;
    v_indicators := jsonb_set(v_indicators, '{google_headers}', 'true'::jsonb);
  END IF;

  -- Check for suspicious timing patterns (very fast after ad click)
  -- This would be populated by the application layer
  
  RETURN QUERY SELECT v_is_parallel, v_indicators;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get parallel tracking statistics
CREATE OR REPLACE FUNCTION get_parallel_tracking_stats(
  p_offer_name TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  offer_name TEXT,
  total_clicks BIGINT,
  parallel_tracking_clicks BIGINT,
  parallel_tracking_percentage NUMERIC,
  with_conversions BIGINT,
  conversion_rate NUMERIC,
  avg_conversion_value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gace.offer_name,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE gace.is_parallel_tracking = TRUE) as parallel_count,
    CASE 
      WHEN COUNT(*) > 0 
      THEN (COUNT(*) FILTER (WHERE gace.is_parallel_tracking = TRUE)::NUMERIC / COUNT(*) * 100)::NUMERIC(5,2) 
      ELSE 0 
    END as parallel_pct,
    COUNT(*) FILTER (WHERE gace.conversion_tracked = TRUE) as conversions,
    CASE 
      WHEN COUNT(*) > 0 
      THEN (COUNT(*) FILTER (WHERE gace.conversion_tracked = TRUE)::NUMERIC / COUNT(*) * 100)::NUMERIC(5,2)
      ELSE 0 
    END as conv_rate,
    AVG(gace.conversion_value) FILTER (WHERE gace.conversion_tracked = TRUE) as avg_value
  FROM google_ads_click_events gace
  WHERE gace.clicked_at >= NOW() - (p_days || ' days')::INTERVAL
    AND (p_offer_name IS NULL OR gace.offer_name = p_offer_name)
  GROUP BY gace.offer_name
  ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to record a conversion (called via postback or pixel)
CREATE OR REPLACE FUNCTION record_conversion(
  p_click_id TEXT,
  p_conversion_value NUMERIC DEFAULT 0,
  p_conversion_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  click_found BOOLEAN,
  offer_name TEXT
) AS $$
DECLARE
  v_click_record RECORD;
BEGIN
  -- Find the click event by click_id
  SELECT * INTO v_click_record
  FROM google_ads_click_events
  WHERE click_id = p_click_id
  LIMIT 1;

  IF v_click_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Click ID not found'::TEXT, FALSE, NULL::TEXT;
    RETURN;
  END IF;

  -- Update the click event with conversion data
  UPDATE google_ads_click_events
  SET 
    conversion_tracked = TRUE,
    conversion_timestamp = NOW(),
    conversion_value = p_conversion_value,
    conversion_id = p_conversion_id
  WHERE click_id = p_click_id;

  RETURN QUERY SELECT 
    TRUE, 
    'Conversion recorded successfully'::TEXT, 
    TRUE, 
    v_click_record.offer_name;
END;
$$ LANGUAGE plpgsql;

-- View for conversion tracking dashboard
CREATE OR REPLACE VIEW conversion_tracking_dashboard AS
SELECT 
  gace.offer_name,
  DATE_TRUNC('day', gace.clicked_at) as date,
  COUNT(*) as total_clicks,
  COUNT(*) FILTER (WHERE gace.is_parallel_tracking = TRUE) as parallel_tracking_hits,
  COUNT(*) FILTER (WHERE gace.conversion_tracked = TRUE) as conversions,
  CASE 
    WHEN COUNT(*) > 0 
    THEN (COUNT(*) FILTER (WHERE gace.conversion_tracked = TRUE)::NUMERIC / COUNT(*) * 100)::NUMERIC(5,2)
    ELSE 0 
  END as conversion_rate_pct,
  SUM(gace.conversion_value) FILTER (WHERE gace.conversion_tracked = TRUE) as total_revenue,
  AVG(gace.conversion_value) FILTER (WHERE gace.conversion_tracked = TRUE) as avg_order_value,
  -- Time to conversion (hours)
  AVG(EXTRACT(EPOCH FROM (gace.conversion_timestamp - gace.clicked_at)) / 3600) 
    FILTER (WHERE gace.conversion_tracked = TRUE) as avg_hours_to_conversion
FROM google_ads_click_events gace
WHERE gace.clicked_at >= NOW() - INTERVAL '30 days'
GROUP BY gace.offer_name, DATE_TRUNC('day', gace.clicked_at)
ORDER BY date DESC, gace.offer_name;

-- View for detailed parallel tracking analysis
CREATE OR REPLACE VIEW parallel_tracking_analysis AS
SELECT 
  gace.id,
  gace.offer_name,
  gace.clicked_at,
  gace.user_agent,
  gace.referrer,
  gace.is_parallel_tracking,
  gace.parallel_tracking_indicators,
  gace.user_ip,
  gace.click_id,
  gace.redirect_url,
  (categorize_click(gace.user_agent, gace.redirect_url)).category as click_category,
  gace.conversion_tracked,
  gace.conversion_value
FROM google_ads_click_events gace
WHERE gace.clicked_at >= NOW() - INTERVAL '7 days'
ORDER BY gace.clicked_at DESC;

-- Comments
COMMENT ON COLUMN google_ads_click_events.is_parallel_tracking IS 'TRUE if this hit was detected as Google parallel tracking request';
COMMENT ON COLUMN google_ads_click_events.parallel_tracking_indicators IS 'JSON object with details about why this was flagged as parallel tracking';
COMMENT ON COLUMN google_ads_click_events.conversion_tracked IS 'TRUE if a conversion was recorded for this click';
COMMENT ON COLUMN google_ads_click_events.click_id IS 'Unique identifier for matching clicks to conversions (e.g., gclid or custom ID)';
COMMENT ON FUNCTION detect_parallel_tracking(TEXT, TEXT, JSONB) IS 'Detects if a request is likely from Google parallel tracking based on user agent, referrer, and headers';
COMMENT ON FUNCTION record_conversion(TEXT, NUMERIC, TEXT) IS 'Records a conversion for a given click_id (called via postback URL or conversion pixel)';
COMMENT ON VIEW conversion_tracking_dashboard IS 'Daily conversion metrics by offer including parallel tracking hits and revenue';
COMMENT ON VIEW parallel_tracking_analysis IS 'Detailed analysis of parallel tracking requests with click categorization';
