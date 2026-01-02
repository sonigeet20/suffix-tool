-- Migration: Change provider_id from UUID to TEXT to support sentinel values
-- This allows storing "USE_SETTINGS_LUNA" or other special values alongside UUIDs

DO $$ 
BEGIN
    -- Drop the foreign key constraint first
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'offers_provider_id_fkey'
    ) THEN
        ALTER TABLE offers DROP CONSTRAINT offers_provider_id_fkey;
    END IF;
    
    -- Change column type from UUID to TEXT
    ALTER TABLE offers ALTER COLUMN provider_id TYPE TEXT USING provider_id::TEXT;
    
    -- Add a check constraint to ensure provider_id is either NULL, a UUID, or 'USE_SETTINGS_LUNA'
    ALTER TABLE offers ADD CONSTRAINT provider_id_valid_format 
    CHECK (
        provider_id IS NULL OR 
        provider_id = 'USE_SETTINGS_LUNA' OR
        provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );
    
    COMMENT ON COLUMN offers.provider_id IS 'Provider override: UUID from proxy_providers table, "USE_SETTINGS_LUNA" for settings-based Luna, or NULL for default rotation';
END $$;
