-- Add BrightData API configuration columns to settings table
-- NOTE: brightdata_admin_api_token is for zone management API, NOT for proxy/browser authentication
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS brightdata_admin_api_token TEXT,
ADD COLUMN IF NOT EXISTS brightdata_customer_id TEXT,
ADD COLUMN IF NOT EXISTS brightdata_zone_name TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN settings.brightdata_admin_api_token IS 'BrightData ADMIN API token for zone management (whitelisting IPs) - separate from browser/proxy credentials (get from https://brightdata.com/cp/api_tokens)';
COMMENT ON COLUMN settings.brightdata_customer_id IS 'BrightData customer ID (e.g., hl_a908b07a)';
COMMENT ON COLUMN settings.brightdata_zone_name IS 'BrightData zone name to whitelist IPs in (e.g., testing_softality_1)';
