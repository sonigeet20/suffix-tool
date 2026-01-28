-- Google Ads Click Events Tracking
-- Migration to add event logging, recent clicks view, and alerting

-- Create click events table (if not exists)
CREATE TABLE IF NOT EXISTS google_ads_click_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_name TEXT NOT NULL,
  suffix TEXT NOT NULL,
  target_country TEXT NOT NULL,
  user_ip TEXT,
  user_agent TEXT,
  referrer TEXT,
  redirect_url TEXT NOT NULL,
  response_time_ms INTEGER,
  trace_verified BOOLEAN DEFAULT NULL,
  trace_success BOOLEAN DEFAULT NULL,
  trace_final_url TEXT,
  trace_checked_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_click_events_offer_created 
  ON google_ads_click_events(offer_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_click_events_trace_status 
  ON google_ads_click_events(offer_name, trace_verified, trace_success);

-- Function to log click event
CREATE OR REPLACE FUNCTION log_click_event(
  p_offer_name TEXT,
  p_suffix TEXT,
  p_target_country TEXT,
  p_user_ip TEXT,
  p_user_agent TEXT,
  p_referrer TEXT,
  p_redirect_url TEXT,
  p_response_time_ms INTEGER
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO google_ads_click_events (
    offer_name,
    suffix,
    target_country,
    user_ip,
    user_agent,
    referrer,
    redirect_url,
    response_time_ms
  ) VALUES (
    p_offer_name,
    p_suffix,
    p_target_country,
    p_user_ip,
    p_user_agent,
    p_referrer,
    p_redirect_url,
    p_response_time_ms
  ) RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update trace verification status
CREATE OR REPLACE FUNCTION update_trace_verification(
  p_event_id UUID,
  p_trace_success BOOLEAN,
  p_trace_final_url TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE google_ads_click_events
  SET 
    trace_verified = TRUE,
    trace_success = p_trace_success,
    trace_final_url = p_trace_final_url,
    trace_checked_at = NOW()
  WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent click events for an offer
CREATE OR REPLACE FUNCTION get_recent_click_events(
  p_offer_name TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  offer_name TEXT,
  suffix TEXT,
  target_country TEXT,
  redirect_url TEXT,
  response_time_ms INTEGER,
  trace_verified BOOLEAN,
  trace_success BOOLEAN,
  trace_final_url TEXT,
  trace_checked_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.offer_name,
    e.suffix,
    e.target_country,
    e.redirect_url,
    e.response_time_ms,
    e.trace_verified,
    e.trace_success,
    e.trace_final_url,
    e.trace_checked_at,
    e.clicked_at
  FROM google_ads_click_events e
  WHERE e.offer_name = p_offer_name
  ORDER BY e.clicked_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if last N clicks failed (for alerting)
CREATE OR REPLACE FUNCTION check_recent_failures(
  p_offer_name TEXT,
  p_check_count INTEGER DEFAULT 10
) RETURNS TABLE (
  total_checked INTEGER,
  total_verified INTEGER,
  total_failed INTEGER,
  failure_rate NUMERIC,
  should_alert BOOLEAN
) AS $$
DECLARE
  v_total_checked INTEGER;
  v_total_verified INTEGER;
  v_total_failed INTEGER;
  v_failure_rate NUMERIC;
BEGIN
  -- Get counts of recent events
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE trace_verified = TRUE),
    COUNT(*) FILTER (WHERE trace_verified = TRUE AND trace_success = FALSE)
  INTO v_total_checked, v_total_verified, v_total_failed
  FROM (
    SELECT trace_verified, trace_success
    FROM google_ads_click_events
    WHERE offer_name = p_offer_name
      AND trace_verified = TRUE
    ORDER BY clicked_at DESC
    LIMIT p_check_count
  ) recent;
  
  -- Calculate failure rate
  IF v_total_verified > 0 THEN
    v_failure_rate := (v_total_failed::NUMERIC / v_total_verified::NUMERIC) * 100;
  ELSE
    v_failure_rate := 0;
  END IF;
  
  -- Return result
  RETURN QUERY SELECT 
    v_total_checked,
    v_total_verified,
    v_total_failed,
    v_failure_rate,
    (v_total_failed >= 5 AND v_failure_rate >= 50) AS should_alert;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON google_ads_click_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON google_ads_click_events TO anon;

-- Add comment
COMMENT ON TABLE google_ads_click_events IS 'Tracks individual click events for Google Ads with trace verification and alerting';
