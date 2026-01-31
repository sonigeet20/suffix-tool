-- V5 Trace Overrides Restructure: Move from (account_id, offer_name) to offer_name only
-- Add daily counter and trace scheduling columns

-- Step 1: Create new trace overrides table (offer-only)
CREATE TABLE IF NOT EXISTS v5_trace_overrides_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_name TEXT NOT NULL UNIQUE,
  trace_on_webhook BOOLEAN NOT NULL DEFAULT TRUE,
  traces_per_day INT,
  trace_speed_multiplier NUMERIC(5,2) DEFAULT 1.0,
  traces_count_today INT NOT NULL DEFAULT 0,
  last_trace_reset_utc DATE DEFAULT CURRENT_DATE,
  last_trace_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v5_trace_overrides_v2_offer 
  ON v5_trace_overrides_v2(offer_name);

-- Step 2: Migrate data from old table (take most recent config per offer)
INSERT INTO v5_trace_overrides_v2 (
  offer_name, trace_on_webhook, traces_per_day, trace_speed_multiplier, 
  created_at, updated_at
)
SELECT DISTINCT ON (offer_name)
  offer_name,
  trace_also_on_webhook as trace_on_webhook,  -- Rename column
  traces_per_day,
  speed_multiplier as trace_speed_multiplier,
  created_at,
  updated_at
FROM v5_trace_overrides
ORDER BY offer_name, updated_at DESC
ON CONFLICT(offer_name) DO UPDATE SET
  trace_on_webhook = EXCLUDED.trace_on_webhook,
  traces_per_day = EXCLUDED.traces_per_day,
  trace_speed_multiplier = EXCLUDED.trace_speed_multiplier,
  updated_at = NOW();

-- Step 3: Verify migration
-- SELECT * FROM v5_trace_overrides_v2 ORDER BY offer_name;

-- Step 4: Rename tables (after verification)
-- NOTE: This will be done after testing
-- ALTER TABLE v5_trace_overrides RENAME TO v5_trace_overrides_backup_jan31;
-- ALTER TABLE v5_trace_overrides_v2 RENAME TO v5_trace_overrides;

-- Revert script (if needed):
-- DROP TABLE IF EXISTS v5_trace_overrides;
-- ALTER TABLE v5_trace_overrides_backup_jan31 RENAME TO v5_trace_overrides;
-- DROP TABLE IF EXISTS v5_trace_overrides_v2;
