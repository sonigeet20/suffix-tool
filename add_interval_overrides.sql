-- Run this in Supabase SQL Editor to add interval override columns

ALTER TABLE daily_trace_counts
ADD COLUMN IF NOT EXISTS min_interval_override_ms INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_interval_override_ms INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS target_repeat_ratio DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS min_repeat_ratio DECIMAL(5,2) DEFAULT NULL;

COMMENT ON COLUMN daily_trace_counts.min_interval_override_ms IS 'Minimum interval override (ms). Overrides script MIN_INTERVAL_MS.';
COMMENT ON COLUMN daily_trace_counts.max_interval_override_ms IS 'Maximum interval override (ms). Overrides script MAX_INTERVAL_MS.';
COMMENT ON COLUMN daily_trace_counts.target_repeat_ratio IS 'Target repeats/page override. Overrides script TARGET_REPEAT_RATIO.';
COMMENT ON COLUMN daily_trace_counts.min_repeat_ratio IS 'Min repeats/page override (slowdown trigger). Overrides script MIN_REPEAT_RATIO.';

CREATE INDEX IF NOT EXISTS idx_daily_trace_counts_config_lookup 
ON daily_trace_counts(offer_id, account_id, min_interval_override_ms, max_interval_override_ms);

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'daily_trace_counts' 
  AND column_name IN ('min_interval_override_ms', 'max_interval_override_ms', 'target_repeat_ratio', 'min_repeat_ratio')
ORDER BY column_name;
