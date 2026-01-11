-- Fix: Add missing columns to trackier_offers table
-- Run this if you get "column does not exist" errors

-- Make url1_tracking_url and url2_tracking_url nullable (populated after campaign creation)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'url1_tracking_url'
  ) THEN
    ALTER TABLE trackier_offers ALTER COLUMN url1_tracking_url DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'url2_tracking_url'
  ) THEN
    ALTER TABLE trackier_offers ALTER COLUMN url2_tracking_url DROP NOT NULL;
  END IF;
END $$;

-- Add sub_id_values if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'sub_id_values'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN sub_id_values JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add sub_id_mapping if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'sub_id_mapping'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN sub_id_mapping JSONB DEFAULT '{
      "p1": "gclid",
      "p2": "fbclid",
      "p3": "msclkid",
      "p4": "ttclid",
      "p5": "clickid",
      "p6": "utm_source",
      "p7": "utm_medium",
      "p8": "utm_campaign",
      "p9": "custom1",
      "p10": "custom2"
    }'::jsonb;
  END IF;
END $$;

-- Add macro_mapping if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'macro_mapping'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN macro_mapping JSONB DEFAULT '{
      "clickid": "{clickid}",
      "gclid": "{gclid}",
      "fbclid": "{fbclid}",
      "ttclid": "{ttclid}",
      "campaign": "{campaign_id}",
      "source": "{source}",
      "publisher": "{publisher_id}",
      "medium": "{medium}",
      "keyword": "{keyword}",
      "adgroup": "{adgroup}",
      "creative": "{creative}"
    }'::jsonb;
  END IF;
END $$;

-- Add url1_campaign_name if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'url1_campaign_name'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN url1_campaign_name TEXT DEFAULT 'Passthrough Campaign (URL 1)';
  END IF;
END $$;

-- Add url2_campaign_name if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'url2_campaign_name'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN url2_campaign_name TEXT DEFAULT 'Final Campaign (URL 2)';
  END IF;
END $$;

-- Add webhookUrl if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'webhook_url'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN webhook_url TEXT;
  END IF;
END $$;

-- Add publisher_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = 'publisher_id'
  ) THEN
    ALTER TABLE trackier_offers ADD COLUMN publisher_id TEXT DEFAULT '2';
  END IF;
END $$;

-- Create index on sub_id_values if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_trackier_offers_sub_id_values ON trackier_offers USING gin (sub_id_values);

-- Drop and recreate get_trackier_stats function with correct parameter name
DROP FUNCTION IF EXISTS get_trackier_stats(uuid);

CREATE OR REPLACE FUNCTION get_trackier_stats(offer_id_param UUID)
RETURNS TABLE(
  total_webhooks BIGINT,
  total_updates BIGINT,
  avg_trace_duration_ms NUMERIC,
  success_rate NUMERIC,
  last_update TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_webhooks,
    (SELECT COUNT(*) FROM trackier_trace_history WHERE trackier_offer_id = offer_id_param)::BIGINT as total_updates,
    (SELECT AVG(trace_duration_ms) FROM trackier_trace_history WHERE trackier_offer_id = offer_id_param AND success = true) as avg_trace_duration_ms,
    (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE (COUNT(CASE WHEN success THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC * 100) END FROM trackier_trace_history WHERE trackier_offer_id = offer_id_param) as success_rate,
    MAX(created_at) as last_update
  FROM trackier_webhook_logs
  WHERE trackier_offer_id = offer_id_param;
END;
$$ LANGUAGE plpgsql;

-- Verify columns exist
DO $$
DECLARE
  missing_cols TEXT[];
BEGIN
  SELECT ARRAY_AGG(col) INTO missing_cols
  FROM (
    SELECT unnest(ARRAY['sub_id_mapping', 'sub_id_values', 'macro_mapping', 'url1_campaign_name', 'url2_campaign_name', 'webhook_url', 'publisher_id']) AS col
  ) required
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trackier_offers' AND column_name = required.col
  );
  
  IF missing_cols IS NOT NULL THEN
    RAISE NOTICE 'Still missing columns: %', missing_cols;
  ELSE
    RAISE NOTICE 'All required columns present in trackier_offers table';
  END IF;
END $$;
