-- Remove mandatory api_key check for brightdata_browser providers
-- Allows saving provider without requiring api_key

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_brightdata_browser_has_api_key'
    ) THEN
        ALTER TABLE proxy_providers DROP CONSTRAINT check_brightdata_browser_has_api_key;
    END IF;
END $$;
