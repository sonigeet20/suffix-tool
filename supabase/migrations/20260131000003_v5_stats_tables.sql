-- V5 Campaign-Level Stats Tables (7-day retention)

-- Campaign Suffix Activity Log
CREATE TABLE IF NOT EXISTS v5_campaign_suffix_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  offer_name TEXT NOT NULL,
  suffix_sent TEXT NOT NULL,
  webhook_id UUID REFERENCES v5_webhook_queue(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
  webhook_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v5_campaign_suffix_log_offer_date
  ON v5_campaign_suffix_log(offer_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v5_campaign_suffix_log_account_campaign
  ON v5_campaign_suffix_log(account_id, campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v5_campaign_suffix_log_created_at
  ON v5_campaign_suffix_log(created_at DESC);

-- Auto-Trace Activity Log
CREATE TABLE IF NOT EXISTS v5_trace_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_name TEXT NOT NULL,
  trace_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trace_result TEXT NOT NULL,  -- 'success', 'failed'
  suffix_generated TEXT,  -- NULL if failed
  geo_pool_used TEXT,  -- Optional: which geo pool
  error_message TEXT,  -- If failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v5_trace_log_offer_date
  ON v5_trace_log(offer_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v5_trace_log_created_at
  ON v5_trace_log(created_at DESC);

-- Function to purge logs older than 7 days
CREATE OR REPLACE FUNCTION purge_v5_stats_logs()
RETURNS TABLE(
  campaign_log_deleted INT,
  trace_log_deleted INT
) AS $$
DECLARE
  v_campaign_deleted INT;
  v_trace_deleted INT;
BEGIN
  DELETE FROM v5_campaign_suffix_log 
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_campaign_deleted = ROW_COUNT;
  
  DELETE FROM v5_trace_log 
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_trace_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT v_campaign_deleted, v_trace_deleted;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-purge daily
CREATE OR REPLACE FUNCTION auto_purge_v5_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if it's a new day and purge old records
  IF (SELECT COUNT(*) FROM v5_campaign_suffix_log 
      WHERE created_at < NOW() - INTERVAL '7 days' LIMIT 1) > 0 THEN
    DELETE FROM v5_campaign_suffix_log 
    WHERE created_at < NOW() - INTERVAL '7 days';
  END IF;
  
  IF (SELECT COUNT(*) FROM v5_trace_log 
      WHERE created_at < NOW() - INTERVAL '7 days' LIMIT 1) > 0 THEN
    DELETE FROM v5_trace_log 
    WHERE created_at < NOW() - INTERVAL '7 days';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Revert script (if needed):
-- DROP FUNCTION IF EXISTS auto_purge_v5_stats();
-- DROP FUNCTION IF EXISTS purge_v5_stats_logs();
-- DROP TABLE IF EXISTS v5_trace_log;
-- DROP TABLE IF EXISTS v5_campaign_suffix_log;
