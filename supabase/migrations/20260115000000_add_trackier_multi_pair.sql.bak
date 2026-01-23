-- ============================================================================
-- Trackier Multi-Pair Campaign Support
-- ============================================================================
-- Adds support for multiple campaign pairs per offer
-- Each pair has unique webhook token for independent webhook routing
-- Backwards compatible: existing single-pair offers continue working
-- ============================================================================

-- Add additional_pairs JSONB column to store N campaign pairs
ALTER TABLE trackier_offers ADD COLUMN IF NOT EXISTS additional_pairs JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for fast webhook token lookups
CREATE INDEX IF NOT EXISTS idx_trackier_offers_additional_pairs_gin 
  ON trackier_offers USING gin(additional_pairs);

-- Add pair tracking to webhook logs
ALTER TABLE trackier_webhook_logs 
  ADD COLUMN IF NOT EXISTS pair_index INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pair_webhook_token TEXT;

-- Create index for pair-specific log queries
CREATE INDEX IF NOT EXISTS idx_trackier_webhook_logs_pair_index 
  ON trackier_webhook_logs(pair_index);

CREATE INDEX IF NOT EXISTS idx_trackier_webhook_logs_pair_token 
  ON trackier_webhook_logs(pair_webhook_token);

-- ============================================================================
-- PostgreSQL Function: Update Pair Statistics
-- ============================================================================
-- Updates specific pair's stats in additional_pairs JSONB array
CREATE OR REPLACE FUNCTION update_trackier_pair_stats(
  p_offer_id UUID,
  p_pair_idx INTEGER,
  p_new_sub_id_values JSONB,
  p_trace_duration INTEGER,
  p_update_duration INTEGER
) RETURNS void AS $$
DECLARE
  v_current_webhook_count INTEGER;
  v_current_update_count INTEGER;
BEGIN
  -- Get current counts
  SELECT 
    COALESCE((additional_pairs->p_pair_idx->>'webhook_count')::int, 0),
    COALESCE((additional_pairs->p_pair_idx->>'update_count')::int, 0)
  INTO v_current_webhook_count, v_current_update_count
  FROM trackier_offers
  WHERE id = p_offer_id;

  -- Update multiple fields in the pair object
  UPDATE trackier_offers
  SET 
    additional_pairs = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              additional_pairs,
              array[p_pair_idx::text, 'sub_id_values'],
              p_new_sub_id_values
            ),
            array[p_pair_idx::text, 'webhook_count'],
            to_jsonb(v_current_webhook_count + 1)
          ),
          array[p_pair_idx::text, 'update_count'],
          to_jsonb(v_current_update_count + 1)
        ),
        array[p_pair_idx::text, 'last_webhook_at'],
        to_jsonb(NOW())
      ),
      array[p_pair_idx::text, 'last_update_duration_ms'],
      to_jsonb(p_update_duration)
    ),
    updated_at = NOW()
  WHERE id = p_offer_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PostgreSQL Function: Generic JSONB Update Helper
-- ============================================================================
CREATE OR REPLACE FUNCTION jsonb_set_value(
  p_table_name TEXT,
  p_id_value UUID,
  p_path TEXT,
  p_value TEXT
) RETURNS void AS $$
DECLARE
  v_path_array TEXT[];
BEGIN
  -- Convert path string to array (e.g., "{additional_pairs,0,pair_name}" -> ["additional_pairs", "0", "pair_name"])
  v_path_array := string_to_array(trim(both '{}' from p_path), ',');
  
  -- Dynamic update
  EXECUTE format('UPDATE %I SET additional_pairs = jsonb_set(additional_pairs, $1, $2, true) WHERE id = $3', p_table_name)
  USING v_path_array, p_value::jsonb, p_id_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Migrate Existing Single-Pair Offers to additional_pairs Array
-- ============================================================================
-- Copy existing single-pair data to additional_pairs[0] for backwards compatibility
-- Uses offer.id as webhook_token to preserve existing webhook URLs
DO $$
DECLARE
  v_offer_record RECORD;
BEGIN
  FOR v_offer_record IN 
    SELECT * FROM trackier_offers 
    WHERE additional_pairs = '[]'::jsonb 
      AND url1_campaign_id IS NOT NULL
  LOOP
    UPDATE trackier_offers
    SET additional_pairs = jsonb_build_array(
      jsonb_build_object(
        'pair_index', 1,
        'pair_name', 'Pair 1',
        'webhook_token', v_offer_record.id::text,
        'url1_campaign_id', COALESCE(v_offer_record.url1_campaign_id, ''),
        'url1_campaign_id_real', COALESCE(v_offer_record.url1_campaign_id_real, v_offer_record.url1_campaign_id, ''),
        'url2_campaign_id', COALESCE(v_offer_record.url2_campaign_id, ''),
        'url2_campaign_id_real', COALESCE(v_offer_record.url2_campaign_id_real, v_offer_record.url2_campaign_id, ''),
        'google_ads_template', COALESCE(v_offer_record.google_ads_template, ''),
        'webhook_url', 'https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=' || v_offer_record.id || '&campaign_id={campaign_id}&click_id={click_id}',
        'sub_id_values', COALESCE(v_offer_record.sub_id_values, '{}'::jsonb),
        'enabled', true,
        'webhook_count', COALESCE(v_offer_record.webhook_count, 0),
        'update_count', COALESCE(v_offer_record.update_count, 0),
        'last_webhook_at', v_offer_record.last_webhook_at,
        'last_update_duration_ms', v_offer_record.last_update_duration_ms,
        'created_at', NOW()
      )
    )
    WHERE id = v_offer_record.id;
  END LOOP;
  
  RAISE NOTICE 'Migrated % existing offers to additional_pairs format', 
    (SELECT COUNT(*) FROM trackier_offers WHERE additional_pairs != '[]'::jsonb);
END $$;

-- ============================================================================
-- Create Materialized View for Aggregate Statistics
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS trackier_offer_aggregate_stats AS
SELECT 
  id AS offer_id,
  offer_name,
  jsonb_array_length(COALESCE(additional_pairs, '[]'::jsonb)) AS pair_count,
  (
    SELECT SUM((pair->>'webhook_count')::int)
    FROM jsonb_array_elements(COALESCE(additional_pairs, '[]'::jsonb)) AS pair
    WHERE (pair->>'enabled')::boolean = true
  ) AS total_webhook_count,
  (
    SELECT SUM((pair->>'update_count')::int)
    FROM jsonb_array_elements(COALESCE(additional_pairs, '[]'::jsonb)) AS pair
    WHERE (pair->>'enabled')::boolean = true
  ) AS total_update_count,
  (
    SELECT MAX((pair->>'last_webhook_at')::timestamptz)
    FROM jsonb_array_elements(COALESCE(additional_pairs, '[]'::jsonb)) AS pair
    WHERE (pair->>'enabled')::boolean = true
  ) AS last_webhook_at,
  enabled,
  created_at,
  updated_at
FROM trackier_offers
WHERE enabled = true;

-- Create unique index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_trackier_aggregate_stats_offer_id 
  ON trackier_offer_aggregate_stats(offer_id);

-- ============================================================================
-- Comments for Documentation
-- ============================================================================
COMMENT ON COLUMN trackier_offers.additional_pairs IS 
  'JSONB array storing multiple campaign pairs. Each pair has unique webhook_token for independent routing. Structure: [{pair_index: 1, pair_name: "Pair 1", webhook_token: "uuid", url1_campaign_id, url2_campaign_id, google_ads_template, sub_id_values, enabled, webhook_count, update_count, last_webhook_at}]';

COMMENT ON FUNCTION update_trackier_pair_stats IS 
  'Updates statistics for specific campaign pair in additional_pairs array. Increments webhook_count, update_count, updates sub_id_values and timestamps.';

COMMENT ON FUNCTION jsonb_set_value IS 
  'Generic helper for updating JSONB values in additional_pairs array. Used for pair name updates, enable/disable toggles.';

COMMENT ON MATERIALIZED VIEW trackier_offer_aggregate_stats IS 
  'Aggregate statistics across all campaign pairs per offer. Refresh periodically for performance.';

-- ============================================================================
-- Rollback Instructions (for reference, not executed)
-- ============================================================================
-- To rollback this migration:
-- ALTER TABLE trackier_offers DROP COLUMN IF EXISTS additional_pairs;
-- ALTER TABLE trackier_webhook_logs DROP COLUMN IF EXISTS pair_index, DROP COLUMN IF EXISTS pair_webhook_token;
-- DROP MATERIALIZED VIEW IF EXISTS trackier_offer_aggregate_stats;
-- DROP FUNCTION IF EXISTS update_trackier_pair_stats(UUID, INTEGER, JSONB, INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS jsonb_set_value(TEXT, UUID, TEXT, TEXT);
