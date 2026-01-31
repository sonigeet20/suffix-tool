-- Test GCLID Tracking Setup for NAZWA_PL_SHEET_314_SKIM

-- Step 1: Apply the migration (creates tables and columns)
-- Run this first if not already applied
\i supabase/migrations/20260201000001_add_gclid_tracking_tables.sql

-- Step 2: Configure the offer for GCLID tracking
UPDATE google_ads_config
SET 
  -- Enable silent fetch mode
  silent_fetch_enabled = true,
  
  -- Set the affiliate network click ID parameter name
  -- For Skimlinks, use 'xcust'
  gclid_param_token = 'xcust',
  
  -- Set the tracking URL (this is where GCLID will be sent)
  -- Replace with your actual Skimlinks tracking URL
  silent_fetch_tracking_url = 'https://go.skimresources.com?id=124588X1613321&xs=1&url=https://example.com',
  
  -- Set trace mode (http_only for speed, browser if needed)
  trace_mode = 'http_only',
  
  -- Enable residential proxy for realistic traffic
  use_residential_proxy_for_tracking = true

WHERE offer_name = 'NAZWA_PL_SHEET_314_SKIM';

-- Step 3: Verify configuration
SELECT 
  offer_name,
  silent_fetch_enabled,
  gclid_param_token,
  silent_fetch_tracking_url,
  trace_mode,
  use_residential_proxy_for_tracking
FROM google_ads_config
WHERE offer_name = 'NAZWA_PL_SHEET_314_SKIM';

-- Expected output:
-- offer_name: NAZWA_PL_SHEET_314_SKIM
-- silent_fetch_enabled: true
-- gclid_param_token: xcust
-- silent_fetch_tracking_url: https://go.skimresources.com?id=124588X1613321&xs=1&url=https://example.com
-- trace_mode: http_only
-- use_residential_proxy_for_tracking: true
