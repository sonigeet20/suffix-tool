-- Complete Trackier Integration Migration
-- Combines trackier_tables, sub_id_fields, and macro_mapping

-- ========================================
-- PART 1: Trackier Tables
-- ========================================

-- Table 1: Trackier Offers Configuration
CREATE TABLE IF NOT EXISTS trackier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Soft link to offers (NOT a foreign key - won't break if offer deleted)
  offer_id UUID,
  offer_name TEXT NOT NULL,
  
  -- Trackier Credentials
  api_key TEXT NOT NULL,
  api_base_url TEXT DEFAULT 'https://api.trackier.com',
  advertiser_id TEXT NOT NULL,
  
  -- URL 1 (Passthrough - fires webhook)
  url1_campaign_id TEXT NOT NULL,
  url1_campaign_name TEXT DEFAULT 'Passthrough Campaign (URL 1)',
  url1_campaign_hash TEXT,
  url1_tracking_url TEXT NOT NULL,
  
  -- URL 2 (Final destination with pre-loaded suffix)
  url2_campaign_id TEXT NOT NULL,
  url2_campaign_name TEXT DEFAULT 'Final Campaign (URL 2)',
  url2_campaign_hash TEXT,
  url2_tracking_url TEXT NOT NULL,
  url2_destination_url TEXT NOT NULL,
  url2_last_suffix TEXT,
  url2_last_updated_at TIMESTAMPTZ,
  
  -- Google Ads Template (generated)
  google_ads_template TEXT NOT NULL,
  
  -- Tracing Configuration (copied from offer, independent)
  final_url TEXT NOT NULL,
  suffix_pattern TEXT NOT NULL,
  tracer_mode TEXT DEFAULT 'http_only',
  use_proxy BOOLEAN DEFAULT TRUE,
  max_redirects INTEGER DEFAULT 20,
  timeout_ms INTEGER DEFAULT 45000,
  
  -- Sub-ID Mapping (p1-p10 parameter mapping)
  sub_id_mapping JSONB DEFAULT '{
    "p1": "gclid",
    "p2": "fbclid",
    "p3": "msclkid",
    "p4": "ttclid",
    "p5": "clickid",
    "p6": "utm_source",
    "p7": "utm_medium",
    "p8": "utm_campaign",
    "p9": "custom1",
    "p10": "custom2"
  }'::jsonb,
  
  -- Sub-ID Values (current traced values)
  sub_id_values JSONB DEFAULT '{}'::jsonb,
  
  -- Macro Mapping (for Trackier macros)
  macro_mapping JSONB DEFAULT '{
    "clickid": "{clickid}",
    "gclid": "{gclid}",
    "fbclid": "{fbclid}",
    "ttclid": "{ttclid}",
    "campaign": "{campaign_id}",
    "source": "{source}",
    "publisher": "{publisher_id}",
    "medium": "{medium}",
    "keyword": "{keyword}",
    "adgroup": "{adgroup}",
    "creative": "{creative}"
  }'::jsonb,
  
  -- Update Configuration
  update_interval_seconds INTEGER DEFAULT 300,
  min_time_between_updates_seconds INTEGER DEFAULT 5,
  
  -- Statistics
  last_webhook_at TIMESTAMPTZ,
  webhook_count INTEGER DEFAULT 0,
  update_count INTEGER DEFAULT 0,
  last_update_duration_ms INTEGER,
  total_update_time_ms BIGINT DEFAULT 0,
  
  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT trackier_offers_unique_url1 UNIQUE(url1_campaign_id),
  CONSTRAINT trackier_offers_unique_url2 UNIQUE(url2_campaign_id),
  CONSTRAINT trackier_offers_check_interval CHECK (update_interval_seconds >= 5)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trackier_offers_offer_id ON trackier_offers(offer_id);
CREATE INDEX IF NOT EXISTS idx_trackier_offers_enabled ON trackier_offers(enabled);
CREATE INDEX IF NOT EXISTS idx_trackier_offers_url1_campaign_id ON trackier_offers(url1_campaign_id);
CREATE INDEX IF NOT EXISTS idx_trackier_offers_created_at ON trackier_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trackier_offers_sub_id_values ON trackier_offers USING gin (sub_id_values);

-- Table 2: Trackier Webhook Logs
CREATE TABLE IF NOT EXISTS trackier_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trackier_offer_id UUID NOT NULL,
  
  -- Webhook Payload
  campaign_id TEXT,
  click_id TEXT,
  publisher_id TEXT,
  ip TEXT,
  country TEXT,
  device TEXT,
  os TEXT,
  browser TEXT,
  payload JSONB,
  
  -- Processing Status
  processed BOOLEAN DEFAULT FALSE,
  queued_for_update BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  trace_duration_ms INTEGER,
  update_duration_ms INTEGER,
  error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trackier_webhook_logs_offer_id ON trackier_webhook_logs(trackier_offer_id);
CREATE INDEX IF NOT EXISTS idx_trackier_webhook_logs_processed ON trackier_webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_trackier_webhook_logs_created_at ON trackier_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trackier_webhook_logs_campaign_id ON trackier_webhook_logs(campaign_id);

-- Table 3: Trackier Trace History
CREATE TABLE IF NOT EXISTS trackier_trace_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trackier_offer_id UUID NOT NULL,
  webhook_log_id UUID,
  
  -- Trace Details
  traced_url TEXT NOT NULL,
  traced_suffix TEXT,
  params_extracted JSONB,
  params_filtered JSONB,
  
  -- Performance
  trace_duration_ms INTEGER,
  success BOOLEAN DEFAULT FALSE,
  error TEXT,
  
  -- Proxy & Geo
  proxy_ip TEXT,
  geo_country TEXT,
  geo_city TEXT,
  geo_region TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trackier_trace_history_offer_id ON trackier_trace_history(trackier_offer_id);
CREATE INDEX IF NOT EXISTS idx_trackier_trace_history_success ON trackier_trace_history(success);
CREATE INDEX IF NOT EXISTS idx_trackier_trace_history_created_at ON trackier_trace_history(created_at DESC);

-- Table 4: Trackier API Call Log
CREATE TABLE IF NOT EXISTS trackier_api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trackier_offer_id UUID NOT NULL,
  
  -- API Request
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_body JSONB,
  
  -- API Response
  status_code INTEGER,
  response_body JSONB,
  success BOOLEAN DEFAULT FALSE,
  error TEXT,
  duration_ms INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trackier_api_calls_offer_id ON trackier_api_calls(trackier_offer_id);
CREATE INDEX IF NOT EXISTS idx_trackier_api_calls_success ON trackier_api_calls(success);
CREATE INDEX IF NOT EXISTS idx_trackier_api_calls_created_at ON trackier_api_calls(created_at DESC);

-- ========================================
-- PART 2: Functions & Triggers
-- ========================================

-- Trigger: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trackier_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trackier_offers_updated_at_trigger ON trackier_offers;
CREATE TRIGGER trackier_offers_updated_at_trigger
  BEFORE UPDATE ON trackier_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_trackier_offers_updated_at();

-- Function: Get Trackier stats for offer
CREATE OR REPLACE FUNCTION get_trackier_stats(offer_id_param UUID)
RETURNS TABLE(
  total_webhooks BIGINT,
  total_updates BIGINT,
  avg_trace_duration_ms NUMERIC,
  success_rate NUMERIC,
  last_update TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_webhooks,
    (SELECT COUNT(*) FROM trackier_trace_history WHERE trackier_offer_id = offer_id_param)::BIGINT as total_updates,
    (SELECT AVG(trace_duration_ms) FROM trackier_trace_history WHERE trackier_offer_id = offer_id_param AND success = true) as avg_trace_duration_ms,
    (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE (COUNT(CASE WHEN success THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC * 100) END FROM trackier_trace_history WHERE trackier_offer_id = offer_id_param) as success_rate,
    MAX(created_at) as last_update
  FROM trackier_webhook_logs
  WHERE trackier_offer_id = offer_id_param;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- PART 3: Comments
-- ========================================

COMMENT ON TABLE trackier_offers IS 'Trackier dual-URL tracking configuration with p1-p10 parameter mapping';
COMMENT ON TABLE trackier_webhook_logs IS 'Logs all webhook calls from Trackier URL 1';
COMMENT ON TABLE trackier_trace_history IS 'Separate trace history for Trackier updates';
COMMENT ON TABLE trackier_api_calls IS 'Logs all API calls to Trackier for debugging';

COMMENT ON COLUMN trackier_offers.sub_id_mapping IS 'Maps Trackier p fields (p1-p10) to actual parameter names for dynamic URL construction';
COMMENT ON COLUMN trackier_offers.sub_id_values IS 'Stores current traced values for each sub_id field, updated by webhook';
COMMENT ON COLUMN trackier_offers.macro_mapping IS 'Maps traced URL parameters to Trackier macros for dynamic replacement';
