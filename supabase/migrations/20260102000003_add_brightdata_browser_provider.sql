-- Migration: Add Bright Data Browser API support to proxy_providers
-- Extends provider types and adds API key storage

-- Update provider_type check constraint to include 'brightdata_browser'
DO $$ 
BEGIN
    -- Drop old constraint if exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'proxy_providers_provider_type_check'
    ) THEN
        ALTER TABLE proxy_providers DROP CONSTRAINT proxy_providers_provider_type_check;
    END IF;
    
    -- Add updated constraint with brightdata_browser
    ALTER TABLE proxy_providers 
    ADD CONSTRAINT proxy_providers_provider_type_check 
    CHECK (provider_type IN ('brightdata', 'brightdata_browser', 'oxylabs', 'smartproxy', 'luna', 'custom'));
END $$;

-- Add api_key column for storing Bright Data Browser API keys
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'proxy_providers' AND column_name = 'api_key'
    ) THEN
        ALTER TABLE proxy_providers ADD COLUMN api_key TEXT;
        COMMENT ON COLUMN proxy_providers.api_key IS 'API key for Bright Data Browser API (only used for brightdata_browser provider type)';
    END IF;
END $$;

-- Add check constraint to ensure api_key is provided for brightdata_browser type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_brightdata_browser_has_api_key'
    ) THEN
        ALTER TABLE proxy_providers 
        ADD CONSTRAINT check_brightdata_browser_has_api_key 
        CHECK (
            provider_type != 'brightdata_browser' OR 
            (provider_type = 'brightdata_browser' AND api_key IS NOT NULL)
        );
    END IF;
END $$;
