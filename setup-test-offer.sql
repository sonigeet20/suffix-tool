-- Create test offer for silent fetch mode testing
-- Run this in Supabase SQL Editor

-- First, delete if exists
DELETE FROM offers WHERE offer_name = 'TEST_SILENT_FETCH';

-- Insert test offer with silent fetch enabled
INSERT INTO offers (
  offer_name,
  url,
  geo_pool,
  google_ads_config
) VALUES (
  'TEST_SILENT_FETCH',
  'https://www.nazwa.pl',
  ARRAY[]::text[],
  '{
    "silent_fetch_enabled": true,
    "silent_fetch_url": "https://go.skimresources.com/?id=124588X1613321&xs=1&url=https%3A%2F%2Fwww.nazwa.pl"
  }'::jsonb
);

-- Verify the offer was created
SELECT 
  offer_name,
  url,
  google_ads_config->'silent_fetch_enabled' as silent_fetch_enabled,
  google_ads_config->'silent_fetch_url' as silent_fetch_url
FROM offers 
WHERE offer_name = 'TEST_SILENT_FETCH';
