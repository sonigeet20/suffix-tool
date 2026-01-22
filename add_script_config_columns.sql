-- Run this in Supabase SQL Editor to add script configuration tracking columns
-- These store the values the script is CURRENTLY using (from script code)
-- Separate from the override columns which are user-editable overrides

ALTER TABLE daily_trace_counts
ADD COLUMN IF NOT EXISTS script_min_interval_ms INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS script_max_interval_ms INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS script_target_repeat_ratio DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS script_min_repeat_ratio DECIMAL(5,2) DEFAULT NULL;

COMMENT ON COLUMN daily_trace_counts.script_min_interval_ms IS 'Current MIN_INTERVAL_MS from script (for reference)';
COMMENT ON COLUMN daily_trace_counts.script_max_interval_ms IS 'Current MAX_INTERVAL_MS from script (for reference)';
COMMENT ON COLUMN daily_trace_counts.script_target_repeat_ratio IS 'Current TARGET_REPEAT_RATIO from script (for reference)';
COMMENT ON COLUMN daily_trace_counts.script_min_repeat_ratio IS 'Current MIN_REPEAT_RATIO from script (for reference)';

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'daily_trace_counts' 
  AND column_name IN ('script_min_interval_ms', 'script_max_interval_ms', 'script_target_repeat_ratio', 'script_min_repeat_ratio')
ORDER BY column_name;
