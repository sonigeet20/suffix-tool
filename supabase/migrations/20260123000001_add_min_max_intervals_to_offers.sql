-- Add min and max interval override columns to daily_trace_counts
-- These allow per-account, per-offer override of script-level MIN_INTERVAL_MS and MAX_INTERVAL_MS
-- If set, these values override the script-level values
-- Keyed by (offer_id, account_id) - already the unique identifier in this table

ALTER TABLE daily_trace_counts
ADD COLUMN min_interval_override_ms INTEGER DEFAULT NULL,
ADD COLUMN max_interval_override_ms INTEGER DEFAULT NULL,
ADD COLUMN target_repeat_ratio DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN min_repeat_ratio DECIMAL(5,2) DEFAULT NULL;

-- Add comments explaining the purpose
COMMENT ON COLUMN daily_trace_counts.min_interval_override_ms IS 'Minimum interval in milliseconds. If set, overrides script-level MIN_INTERVAL_MS for this offer+account combo. Controls how slow the script can go.';
COMMENT ON COLUMN daily_trace_counts.max_interval_override_ms IS 'Maximum interval in milliseconds. If set, overrides script-level MAX_INTERVAL_MS for this offer+account combo. Controls how fast the script can go.';
COMMENT ON COLUMN daily_trace_counts.target_repeat_ratio IS 'Target repeats per landing page. If set, overrides script-level TARGET_REPEAT_RATIO.';
COMMENT ON COLUMN daily_trace_counts.min_repeat_ratio IS 'Minimum repeats per landing page (slowdown trigger). If set, overrides script-level MIN_REPEAT_RATIO.';

-- Create index for efficient lookups when fetching interval config
CREATE INDEX IF NOT EXISTS idx_daily_trace_counts_config_lookup 
ON daily_trace_counts(offer_id, account_id, min_interval_override_ms, max_interval_override_ms);
