-- EMERGENCY: Disable Trackier Processing
-- Run this in Supabase SQL Editor to stop high CPU immediately

-- Disable the active Trackier offer
UPDATE trackier_offers 
SET enabled = false 
WHERE id = '16176089-e436-4781-8c92-cb3475203582';

-- Verify it's disabled
SELECT 
  id,
  offer_name,
  enabled,
  webhook_count,
  update_count,
  url2_last_updated_at
FROM trackier_offers
WHERE id = '16176089-e436-4781-8c92-cb3475203582';

-- Expected result: enabled = false
