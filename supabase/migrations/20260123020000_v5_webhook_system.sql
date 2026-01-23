-- V5 webhook-based multi-offer system (additive)
-- Tables: v5_webhook_queue, v5_suffix_bucket, v5_campaign_offer_mapping,
--         v5_script_executions, v5_trace_overrides, v5_daily_offer_stats
-- RPC helpers: v5_get_multiple_suffixes, v5_mark_suffixes_used,
--              v5_cleanup_old_suffixes, v5_get_queue_stats,
--              v5_get_bucket_inventory

-- Queue of pending webhook updates (offer-level)
CREATE TABLE IF NOT EXISTS v5_webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  offer_name TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  new_suffix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  webhook_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error_at TIMESTAMPTZ,
  trackier_conversion_id TEXT,
  trackier_click_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v5_queue_pending
  ON v5_webhook_queue(account_id, offer_name, status, webhook_received_at);
CREATE INDEX IF NOT EXISTS idx_v5_queue_campaign
  ON v5_webhook_queue(account_id, campaign_id, status, webhook_received_at);

-- Offer-level bucket (shared across campaigns of the same offer/account)
CREATE TABLE IF NOT EXISTS v5_suffix_bucket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  offer_name TEXT NOT NULL,
  suffix TEXT NOT NULL,
  suffix_hash TEXT NOT NULL UNIQUE,
  source TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  times_used INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  original_clicks INT DEFAULT 0,
  original_impressions INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v5_bucket_offer
  ON v5_suffix_bucket(account_id, offer_name, is_valid, times_used, id);

-- Campaign-to-offer mappings (auto-created when missing)
CREATE TABLE IF NOT EXISTS v5_campaign_offer_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  offer_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  auto_created BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_v5_mapping_account_offer
  ON v5_campaign_offer_mapping(account_id, offer_name, is_active);

-- Script execution logs
CREATE TABLE IF NOT EXISTS v5_script_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  script_version TEXT NOT NULL DEFAULT 'V5',
  webhooks_processed INT NOT NULL DEFAULT 0,
  campaigns_updated INT NOT NULL DEFAULT 0,
  suffixes_traced INT NOT NULL DEFAULT 0,
  suffixes_stored INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  override_active BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  runtime_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Offer+account overrides for trace cadence
CREATE TABLE IF NOT EXISTS v5_trace_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  offer_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  traces_per_day INT,
  speed_multiplier NUMERIC(5,2),
  trace_also_on_webhook BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, offer_name)
);

-- Daily stats per offer+account (clicks, unique LPs, repeat ratio)
CREATE TABLE IF NOT EXISTS v5_daily_offer_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  offer_name TEXT NOT NULL,
  stats_date DATE NOT NULL,
  total_clicks INT NOT NULL DEFAULT 0,
  unique_landing_pages INT NOT NULL DEFAULT 0,
  repeat_ratio NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, offer_name, stats_date)
);

CREATE INDEX IF NOT EXISTS idx_v5_daily_offer
  ON v5_daily_offer_stats(account_id, offer_name, stats_date);

-- RPC: get multiple unused suffixes (FIFO)
CREATE OR REPLACE FUNCTION v5_get_multiple_suffixes(
  p_account_id TEXT,
  p_offer_name TEXT,
  p_count INT
)
RETURNS TABLE(id UUID, suffix TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT vsb.id, vsb.suffix
  FROM v5_suffix_bucket vsb
  WHERE vsb.account_id = p_account_id
    AND vsb.offer_name = p_offer_name
    AND vsb.is_valid = TRUE
    AND vsb.times_used = 0
  ORDER BY vsb.id ASC
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC: mark multiple suffixes as used
CREATE OR REPLACE FUNCTION v5_mark_suffixes_used(
  p_suffix_ids UUID[]
)
RETURNS INT AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE v5_suffix_bucket
  SET times_used = times_used + 1,
      last_used_at = NOW(),
      updated_at = NOW()
  WHERE id = ANY(p_suffix_ids);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- RPC: cleanup old/used suffixes
CREATE OR REPLACE FUNCTION v5_cleanup_old_suffixes(
  p_account_id TEXT,
  p_offer_name TEXT
)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM v5_suffix_bucket
  WHERE account_id = p_account_id
    AND offer_name = p_offer_name
    AND (
      (times_used > 0 AND last_used_at < NOW() - INTERVAL '3 days')
      OR (source = 'zero_click' AND created_at < NOW() - INTERVAL '7 days')
    );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- RPC: queue stats by offer
CREATE OR REPLACE FUNCTION v5_get_queue_stats(
  p_account_id TEXT
)
RETURNS TABLE(
  offer_name TEXT,
  pending_count BIGINT,
  processing_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vwq.offer_name,
    COUNT(*) FILTER (WHERE vwq.status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE vwq.status = 'processing') AS processing_count,
    COUNT(*) FILTER (WHERE vwq.status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE vwq.status = 'failed') AS failed_count
  FROM v5_webhook_queue vwq
  WHERE vwq.account_id = p_account_id
  GROUP BY vwq.offer_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC: bucket inventory by offer
CREATE OR REPLACE FUNCTION v5_get_bucket_inventory(
  p_account_id TEXT
)
RETURNS TABLE(
  offer_name TEXT,
  total_suffixes BIGINT,
  unused_suffixes BIGINT,
  used_suffixes BIGINT,
  traced_count BIGINT,
  zero_click_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vsb.offer_name,
    COUNT(*) AS total_suffixes,
    COUNT(*) FILTER (WHERE vsb.times_used = 0) AS unused_suffixes,
    COUNT(*) FILTER (WHERE vsb.times_used > 0) AS used_suffixes,
    COUNT(*) FILTER (WHERE vsb.source = 'traced') AS traced_count,
    COUNT(*) FILTER (WHERE vsb.source = 'zero_click') AS zero_click_count
  FROM v5_suffix_bucket vsb
  WHERE vsb.account_id = p_account_id
    AND vsb.is_valid = TRUE
  GROUP BY vsb.offer_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC: insert mapping if missing (best-effort helper)
CREATE OR REPLACE FUNCTION insert_v5_mapping_if_missing(
  p_account_id TEXT,
  p_campaign_id TEXT,
  p_offer_name TEXT,
  p_campaign_name TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO v5_campaign_offer_mapping(account_id, campaign_id, campaign_name, offer_name, auto_created)
  VALUES (p_account_id, p_campaign_id, p_campaign_name, p_offer_name, TRUE)
  ON CONFLICT (account_id, campaign_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
