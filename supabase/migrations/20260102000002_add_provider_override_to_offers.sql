-- Migration: Add provider override support to offers table
-- This allows users to select a specific provider per offer instead of using default rotation

-- Add provider_id column (nullable FK to proxy_providers)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'offers' AND column_name = 'provider_id'
    ) THEN
        ALTER TABLE offers ADD COLUMN provider_id UUID REFERENCES proxy_providers(id) ON DELETE SET NULL;
        COMMENT ON COLUMN offers.provider_id IS 'Optional: Override default provider rotation for this offer';
    END IF;
END $$;

-- Create index for better query performance
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'offers' AND indexname = 'idx_offers_provider_id'
    ) THEN
        CREATE INDEX idx_offers_provider_id ON offers(provider_id);
    END IF;
END $$;
