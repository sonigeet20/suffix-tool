-- Add function to get bucket inventory for all accounts at once
-- Used by V5WebhookManager to auto-load suffix data on script startup

CREATE OR REPLACE FUNCTION v5_get_bucket_inventory_all_accounts()
RETURNS TABLE(
  account_id TEXT,
  offer_name TEXT,
  total_suffixes BIGINT,
  unused_suffixes BIGINT,
  used_suffixes BIGINT,
  traced_count BIGINT,
  zero_click_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vsb.account_id,
    vsb.offer_name,
    COUNT(*) AS total_suffixes,
    COUNT(*) FILTER (WHERE vsb.times_used = 0) AS unused_suffixes,
    COUNT(*) FILTER (WHERE vsb.times_used > 0) AS used_suffixes,
    COUNT(*) FILTER (WHERE vsb.source = 'traced') AS traced_count,
    COUNT(*) FILTER (WHERE vsb.source = 'zero_click') AS zero_click_count
  FROM v5_suffix_bucket vsb
  WHERE vsb.is_valid = TRUE
  GROUP BY vsb.account_id, vsb.offer_name
  ORDER BY vsb.account_id, vsb.offer_name;
END;
$$ LANGUAGE plpgsql STABLE;
