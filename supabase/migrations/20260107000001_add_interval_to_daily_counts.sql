-- Add interval_used_ms to daily_trace_counts for iterative calculation
ALTER TABLE daily_trace_counts ADD COLUMN IF NOT EXISTS interval_used_ms INT;

-- Update the increment function to also store the interval
CREATE OR REPLACE FUNCTION increment_daily_trace_count(
  p_offer_id UUID,
  p_account_id TEXT,
  p_interval_used_ms INT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- Upsert: increment or create today's record
  INSERT INTO daily_trace_counts (offer_id, account_id, date, trace_count, interval_used_ms, updated_at)
  VALUES (
    p_offer_id,
    p_account_id,
    CURRENT_DATE,
    1,
    p_interval_used_ms,
    NOW()
  )
  ON CONFLICT (offer_id, account_id, date) DO UPDATE
  SET 
    trace_count = daily_trace_counts.trace_count + 1,
    interval_used_ms = COALESCE(p_interval_used_ms, daily_trace_counts.interval_used_ms),
    updated_at = NOW()
  RETURNING trace_count INTO v_count;
  
  -- Clean up traces older than 7 days
  DELETE FROM daily_trace_counts
  WHERE offer_id = p_offer_id
    AND date < CURRENT_DATE - INTERVAL '7 days';
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
