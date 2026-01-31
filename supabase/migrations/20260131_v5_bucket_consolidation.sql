-- V5 Bucket Consolidation: Move from (account_id, offer_name) to offer_name only
-- All accounts share suffix bucket per offer

-- Step 1: Create consolidated bucket table
CREATE TABLE IF NOT EXISTS v5_suffix_bucket_consolidated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_name TEXT NOT NULL,
  suffix TEXT NOT NULL,
  suffix_hash TEXT NOT NULL,
  source TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  times_used INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  original_clicks INT DEFAULT 0,
  original_impressions INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(offer_name, suffix_hash)
);

CREATE INDEX IF NOT EXISTS idx_v5_bucket_consolidated_offer 
  ON v5_suffix_bucket_consolidated(offer_name, is_valid, times_used, id);

-- Step 2: Migrate data from old bucket to consolidated bucket
-- This consolidates all suffixes from all accounts into offer-level buckets
INSERT INTO v5_suffix_bucket_consolidated (
  offer_name, suffix, suffix_hash, source, is_valid, times_used, 
  last_used_at, original_clicks, original_impressions, created_at, updated_at
)
SELECT 
  account_id || '::' || offer_name as offer_name,  -- Preserve offer_name
  suffix, 
  suffix_hash, 
  source, 
  is_valid, 
  times_used, 
  last_used_at, 
  original_clicks, 
  original_impressions, 
  created_at, 
  updated_at
FROM v5_suffix_bucket
ON CONFLICT(offer_name, suffix_hash) DO UPDATE SET
  times_used = GREATEST(EXCLUDED.times_used, v5_suffix_bucket_consolidated.times_used),
  is_valid = v5_suffix_bucket_consolidated.is_valid OR EXCLUDED.is_valid
WHERE NOT EXISTS (
  SELECT 1 FROM v5_suffix_bucket_consolidated 
  WHERE offer_name = v5_suffix_bucket_consolidated.offer_name 
    AND suffix_hash = v5_suffix_bucket_consolidated.suffix_hash
);

-- Step 3: Verify migration success
-- SELECT offer_name, COUNT(*) as suffix_count FROM v5_suffix_bucket_consolidated GROUP BY offer_name;

-- Step 4: Rename tables (old becomes backup, new becomes live)
-- NOTE: This will be done after verification
-- ALTER TABLE v5_suffix_bucket RENAME TO v5_suffix_bucket_backup_jan31;
-- ALTER TABLE v5_suffix_bucket_consolidated RENAME TO v5_suffix_bucket;

-- Revert script (if needed):
-- DROP TABLE IF EXISTS v5_suffix_bucket;
-- ALTER TABLE v5_suffix_bucket_backup_jan31 RENAME TO v5_suffix_bucket;
-- DROP TABLE IF EXISTS v5_suffix_bucket_consolidated;
