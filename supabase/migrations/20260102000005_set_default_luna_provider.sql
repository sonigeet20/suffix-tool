-- Migration: Set existing offers to use Luna by default and update constraint
-- This ensures existing offers stay on Luna when new providers are added

-- Update check constraint first to allow empty string and legacy values
DO $$
BEGIN
    -- Drop old constraint
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'provider_id_valid_format'
    ) THEN
        ALTER TABLE offers DROP CONSTRAINT provider_id_valid_format;
    END IF;
    
    -- Add updated constraint: NULL, empty string (Luna default), 'USE_ROTATION', legacy 'luna', or UUID
    ALTER TABLE offers ADD CONSTRAINT provider_id_valid_format 
    CHECK (
        provider_id IS NULL OR 
        provider_id = '' OR
        provider_id = 'USE_ROTATION' OR
        provider_id = 'USE_SETTINGS_LUNA' OR
        provider_id = 'luna' OR
        provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    );
    
    COMMENT ON COLUMN offers.provider_id IS 'Provider selection: empty string/"" or NULL for Luna default, "USE_ROTATION" for rotation, UUID for specific provider, "luna" (legacy)';
END $$;

-- Set all existing NULL and legacy 'luna' values to empty string (Luna default)
UPDATE offers 
SET provider_id = ''
WHERE provider_id IS NULL OR provider_id = 'luna';

