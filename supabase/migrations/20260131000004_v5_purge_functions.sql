-- V5 Auto-purge functions for 7-day TTL cleanup

-- RPC to purge campaign suffix logs older than 7 days
CREATE OR REPLACE FUNCTION v5_purge_campaign_logs()
RETURNS TABLE(purged_count INT) AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM v5_campaign_suffix_log
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted as purged_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- RPC to purge trace logs older than 7 days
CREATE OR REPLACE FUNCTION v5_purge_trace_logs()
RETURNS TABLE(purged_count INT) AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM v5_trace_log
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted as purged_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- RPC to purge old suffix bucket entries (keep only 7 days of traced/zero-click)
CREATE OR REPLACE FUNCTION v5_purge_old_bucket_entries()
RETURNS TABLE(purged_count INT) AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM v5_suffix_bucket
  WHERE source IN ('traced', 'zero_click')
    AND created_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted as purged_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Master purge function - calls all three
CREATE OR REPLACE FUNCTION v5_purge_all_old_data()
RETURNS TABLE(campaign_logs_purged INT, trace_logs_purged INT, bucket_entries_purged INT) AS $$
DECLARE
  v_campaign_purged INT := 0;
  v_trace_purged INT := 0;
  v_bucket_purged INT := 0;
BEGIN
  -- Purge campaign logs
  DELETE FROM v5_campaign_suffix_log
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_campaign_purged = ROW_COUNT;
  
  -- Purge trace logs
  DELETE FROM v5_trace_log
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_trace_purged = ROW_COUNT;
  
  -- Purge old suffix bucket entries
  DELETE FROM v5_suffix_bucket
  WHERE source IN ('traced', 'zero_click')
    AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_bucket_purged = ROW_COUNT;
  
  RETURN QUERY SELECT v_campaign_purged, v_trace_purged, v_bucket_purged;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Create index for efficient purge queries (created_at)
CREATE INDEX IF NOT EXISTS idx_v5_campaign_suffix_log_created 
  ON v5_campaign_suffix_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v5_trace_log_created 
  ON v5_trace_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_v5_suffix_bucket_created 
  ON v5_suffix_bucket(created_at DESC);
