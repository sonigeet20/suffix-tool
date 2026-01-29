-- Click Categorization Functions
-- Helps distinguish real users from Google bots and track redirect quality

-- Function to categorize a click as real user, google bot, or invalid
CREATE OR REPLACE FUNCTION categorize_click(
    p_user_agent TEXT,
    p_redirect_url TEXT
)
RETURNS TABLE (
    category TEXT,  -- 'real_user', 'google_bot', 'invalid'
    reason TEXT
) AS $$
BEGIN
  -- Check if Google bot
  IF p_user_agent ILIKE '%GoogleHypersonic%' OR p_user_agent ILIKE '%gzip(gfe)%' THEN
    RETURN QUERY SELECT 'google_bot'::TEXT, 'GoogleHypersonic user agent'::TEXT;
    RETURN;
  END IF;

  -- Check if redirect to Google verification endpoint
  IF p_redirect_url ILIKE '%google.com/asnc%' THEN
    RETURN QUERY SELECT 'google_bot'::TEXT, 'Redirected to google.com/asnc verification'::TEXT;
    RETURN;
  END IF;

  -- Check if macro not replaced
  IF p_redirect_url LIKE '%{lpurl%' THEN
    RETURN QUERY SELECT 'invalid'::TEXT, '{lpurl} macro not replaced'::TEXT;
    RETURN;
  END IF;

  -- Check if test URL
  IF p_redirect_url LIKE '%example.com%' THEN
    RETURN QUERY SELECT 'invalid'::TEXT, 'Test URL (example.com)'::TEXT;
    RETURN;
  END IF;

  -- Check if valid landing page
  IF p_redirect_url LIKE 'https://%' OR p_redirect_url LIKE 'http://%' THEN
    RETURN QUERY SELECT 'real_user'::TEXT, 'Valid landing page redirect'::TEXT;
    RETURN;
  END IF;

  -- Default: unknown
  RETURN QUERY SELECT 'invalid'::TEXT, 'Unknown redirect format'::TEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get click statistics by category
CREATE OR REPLACE FUNCTION get_click_stats_by_category(
    p_offer_name TEXT DEFAULT NULL,
    p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    offer_name TEXT,
    total_clicks BIGINT,
    real_users BIGINT,
    google_bots BIGINT,
    invalid_clicks BIGINT,
    real_user_percentage NUMERIC,
    google_bot_percentage NUMERIC,
    real_user_conversions BIGINT,
    conversion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH categorized AS (
    SELECT 
      gace.offer_name,
      gace.id,
      gace.user_agent,
      gace.redirect_url,
      (categorize_click(gace.user_agent, gace.redirect_url)).category,
      gace.clicked_at
    FROM google_ads_click_events gace
    WHERE gace.clicked_at >= NOW() - (p_days || ' days')::INTERVAL
      AND (p_offer_name IS NULL OR gace.offer_name = p_offer_name)
  ),
  stats AS (
    SELECT 
      offer_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE category = 'real_user') as real_user_count,
      COUNT(*) FILTER (WHERE category = 'google_bot') as google_bot_count,
      COUNT(*) FILTER (WHERE category = 'invalid') as invalid_count,
      COUNT(*) FILTER (WHERE category = 'real_user' AND clicked_at::DATE = CURRENT_DATE) as today_real_users
    FROM categorized
    GROUP BY offer_name
  )
  SELECT 
    s.offer_name,
    s.total,
    s.real_user_count,
    s.google_bot_count,
    s.invalid_count,
    CASE WHEN s.total > 0 THEN (s.real_user_count::NUMERIC / s.total * 100)::NUMERIC(5,2) ELSE 0 END,
    CASE WHEN s.total > 0 THEN (s.google_bot_count::NUMERIC / s.total * 100)::NUMERIC(5,2) ELSE 0 END,
    s.today_real_users,
    CASE WHEN s.real_user_count > 0 THEN (s.today_real_users::NUMERIC / s.real_user_count * 100)::NUMERIC(5,2) ELSE 0 END
  FROM stats s
  ORDER BY s.total DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- View for easy dashboard querying
CREATE OR REPLACE VIEW click_analytics_dashboard AS
SELECT 
  gace.offer_name,
  (categorize_click(gace.user_agent, gace.redirect_url)).category as click_category,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE gace.suffix != '') as with_suffix,
  COUNT(*) FILTER (WHERE gace.blocked = true) as blocked_clicks,
  AVG(gace.response_time_ms) as avg_response_time,
  gace.clicked_at::DATE as click_date
FROM google_ads_click_events gace
GROUP BY gace.offer_name, (categorize_click(gace.user_agent, gace.redirect_url)).category, gace.clicked_at::DATE
ORDER BY gace.clicked_at::DATE DESC, gace.offer_name;

-- Drop existing function if it exists (needed because we're changing the return type)
DROP FUNCTION IF EXISTS get_recent_click_events(TEXT, INTEGER);

-- Function to get recent click events with categorization
CREATE OR REPLACE FUNCTION get_recent_click_events(
    p_offer_name TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    click_timestamp TIMESTAMP WITH TIME ZONE,
    user_ip TEXT,
    target_country TEXT,
    suffix TEXT,
    trace_success BOOLEAN,
    trace_final_url TEXT,
    trace_error TEXT,
    user_agent TEXT,
    redirect_url TEXT,
    click_category TEXT,
    category_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gace.id,
    gace.clicked_at as click_timestamp,
    gace.user_ip,
    gace.target_country,
    gace.suffix,
    gace.trace_success,
    gace.trace_final_url,
    gace.trace_error,
    gace.user_agent,
    gace.redirect_url,
    (categorize_click(gace.user_agent, gace.redirect_url)).category as click_category,
    (categorize_click(gace.user_agent, gace.redirect_url)).reason as category_reason
  FROM google_ads_click_events gace
  WHERE (p_offer_name IS NULL OR gace.offer_name = p_offer_name)
  ORDER BY gace.clicked_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON FUNCTION categorize_click(TEXT, TEXT) IS 'Categorize a click as real_user, google_bot, or invalid based on user agent and redirect URL';
COMMENT ON FUNCTION get_click_stats_by_category(TEXT, INTEGER) IS 'Get aggregated click statistics by category (real users vs bots) for dashboard';
COMMENT ON FUNCTION get_recent_click_events(TEXT, INTEGER) IS 'Get recent click events with IP, category, and trace status for monitoring';
COMMENT ON VIEW click_analytics_dashboard IS 'Real-time analytics dashboard showing click categorization and performance metrics';
