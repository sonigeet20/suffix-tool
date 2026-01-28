-- Click Events Tracking for Google Ads
-- Tracks individual click events with trace results for monitoring and alerting

-- Table to store individual click events
CREATE TABLE IF NOT EXISTS google_ads_click_events (
    id BIGSERIAL PRIMARY KEY,
    offer_name TEXT NOT NULL,
    suffix TEXT NOT NULL,
    target_country TEXT,
    click_timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_ip TEXT,
    user_agent TEXT,
    referrer TEXT,
    
    -- Trace result tracking
    trace_attempted BOOLEAN DEFAULT FALSE,
    trace_success BOOLEAN DEFAULT NULL,
    trace_final_url TEXT,
    trace_expected_domain TEXT,
    trace_hop_count INTEGER DEFAULT 0,
    trace_error TEXT,
    trace_timestamp TIMESTAMPTZ,
    
    -- Response tracking
    redirect_url TEXT,
    response_time_ms INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT google_ads_click_events_check_trace_result 
        CHECK (trace_attempted = FALSE OR (trace_success IS NOT NULL))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_click_events_offer_time 
    ON google_ads_click_events(offer_name, click_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_click_events_trace_status 
    ON google_ads_click_events(offer_name, trace_attempted, trace_success, click_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_click_events_recent 
    ON google_ads_click_events(click_timestamp DESC)
    WHERE click_timestamp > NOW() - INTERVAL '7 days';

-- Table for Slack alert configuration
CREATE TABLE IF NOT EXISTS google_ads_alert_config (
    id SERIAL PRIMARY KEY,
    offer_name TEXT UNIQUE NOT NULL,
    slack_webhook_url TEXT NOT NULL,
    alert_threshold INTEGER DEFAULT 10, -- Alert if X consecutive failures
    check_last_n_clicks INTEGER DEFAULT 10, -- Check last N clicks
    enabled BOOLEAN DEFAULT TRUE,
    last_alert_sent TIMESTAMPTZ,
    alert_cooldown_minutes INTEGER DEFAULT 30, -- Minimum time between alerts
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global Slack webhook setting
INSERT INTO settings (key, value) 
VALUES ('google_ads_slack_webhook', '') 
ON CONFLICT (key) DO NOTHING;

-- Function to get last N click events for an offer
CREATE OR REPLACE FUNCTION get_recent_click_events(
    p_offer_name TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id BIGINT,
    suffix TEXT,
    target_country TEXT,
    click_timestamp TIMESTAMPTZ,
    trace_success BOOLEAN,
    trace_final_url TEXT,
    trace_error TEXT,
    response_time_ms INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ce.id,
        ce.suffix,
        ce.target_country,
        ce.click_timestamp,
        ce.trace_success,
        ce.trace_final_url,
        ce.trace_error,
        ce.response_time_ms
    FROM google_ads_click_events ce
    WHERE ce.offer_name = p_offer_name
    ORDER BY ce.click_timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to check if alert should be sent
CREATE OR REPLACE FUNCTION should_send_alert(
    p_offer_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_config RECORD;
    v_failure_count INTEGER;
    v_total_count INTEGER;
BEGIN
    -- Get alert config for this offer
    SELECT * INTO v_config
    FROM google_ads_alert_config
    WHERE offer_name = p_offer_name AND enabled = TRUE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Check cooldown period
    IF v_config.last_alert_sent IS NOT NULL AND 
       v_config.last_alert_sent > NOW() - (v_config.alert_cooldown_minutes || ' minutes')::INTERVAL THEN
        RETURN FALSE;
    END IF;
    
    -- Count failures in last N clicks
    SELECT 
        COUNT(*) FILTER (WHERE trace_success = FALSE),
        COUNT(*)
    INTO v_failure_count, v_total_count
    FROM (
        SELECT trace_success
        FROM google_ads_click_events
        WHERE offer_name = p_offer_name
          AND trace_attempted = TRUE
        ORDER BY click_timestamp DESC
        LIMIT v_config.check_last_n_clicks
    ) recent;
    
    -- Alert if threshold exceeded
    IF v_total_count >= v_config.check_last_n_clicks AND 
       v_failure_count >= v_config.alert_threshold THEN
        
        -- Update last alert timestamp
        UPDATE google_ads_alert_config
        SET last_alert_sent = NOW()
        WHERE offer_name = p_offer_name;
        
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to log click event
CREATE OR REPLACE FUNCTION log_click_event(
    p_offer_name TEXT,
    p_suffix TEXT,
    p_target_country TEXT DEFAULT NULL,
    p_user_ip TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_redirect_url TEXT DEFAULT NULL,
    p_response_time_ms INTEGER DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT AS $$
DECLARE
    v_event_id BIGINT;
BEGIN
    INSERT INTO google_ads_click_events (
        offer_name,
        suffix,
        target_country,
        user_ip,
        user_agent,
        referrer,
        redirect_url,
        response_time_ms,
        metadata
    ) VALUES (
        p_offer_name,
        p_suffix,
        p_target_country,
        p_user_ip,
        p_user_agent,
        p_referrer,
        p_redirect_url,
        p_response_time_ms,
        p_metadata
    )
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update trace result
CREATE OR REPLACE FUNCTION update_trace_result(
    p_event_id BIGINT,
    p_success BOOLEAN,
    p_final_url TEXT DEFAULT NULL,
    p_expected_domain TEXT DEFAULT NULL,
    p_hop_count INTEGER DEFAULT 0,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE google_ads_click_events
    SET 
        trace_attempted = TRUE,
        trace_success = p_success,
        trace_final_url = p_final_url,
        trace_expected_domain = p_expected_domain,
        trace_hop_count = p_hop_count,
        trace_error = p_error,
        trace_timestamp = NOW()
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old events (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_click_events()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM google_ads_click_events
    WHERE click_timestamp < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE google_ads_click_events IS 'Individual click events for Google Ads tracking and monitoring';
COMMENT ON TABLE google_ads_alert_config IS 'Slack alert configuration per offer for failed traces';
COMMENT ON FUNCTION get_recent_click_events IS 'Get last N click events for an offer';
COMMENT ON FUNCTION should_send_alert IS 'Check if Slack alert should be sent for an offer';
COMMENT ON FUNCTION log_click_event IS 'Log a new click event';
COMMENT ON FUNCTION update_trace_result IS 'Update trace result for a click event';
