-- Migration: Add GCLID trace monitoring columns and auto-cleanup
-- Created: 2026-02-01
-- Purpose: Add trace_selected_geo, final_url_params columns and auto-cleanup to keep only last 50 records per offer

-- Add new columns to gclid_click_mapping if they don't exist
ALTER TABLE gclid_click_mapping 
ADD COLUMN IF NOT EXISTS trace_selected_geo TEXT,
ADD COLUMN IF NOT EXISTS final_url_params TEXT;

-- Add comments for new columns
COMMENT ON COLUMN gclid_click_mapping.trace_selected_geo IS 'Country code used for trace (clientCountry or random from pool)';
COMMENT ON COLUMN gclid_click_mapping.final_url_params IS 'Query parameters extracted from final URL after trace completes';

-- Create index on offer_name and created_at for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_gclid_click_mapping_offer_created 
ON gclid_click_mapping(offer_name, created_at DESC);

-- Create index on offer_name for faster filtering
CREATE INDEX IF NOT EXISTS idx_gclid_click_mapping_offer 
ON gclid_click_mapping(offer_name);

-- Create view for easy stats querying
CREATE OR REPLACE VIEW gclid_trace_stats AS
SELECT 
    offer_name,
    COUNT(*) as total_traces,
    COUNT(CASE WHEN tracking_trace_status = 'completed' THEN 1 END) as completed_traces,
    COUNT(CASE WHEN tracking_trace_status IN ('failed', 'error') THEN 1 END) as failed_traces,
    COUNT(CASE WHEN tracking_trace_status IS NULL OR tracking_trace_status = 'pending' THEN 1 END) as pending_traces,
    AVG(tracking_trace_hops) as avg_hops,
    MAX(created_at) as last_trace_at,
    MIN(created_at) as oldest_trace_at
FROM gclid_click_mapping
GROUP BY offer_name;

-- Function to keep only last 50 records per offer
CREATE OR REPLACE FUNCTION cleanup_gclid_traces()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete old records keeping only the last 50 per offer
    DELETE FROM gclid_click_mapping
    WHERE id IN (
        SELECT id 
        FROM gclid_click_mapping
        WHERE offer_name = NEW.offer_name
        ORDER BY created_at DESC
        OFFSET 50
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-delete old records on insert
DROP TRIGGER IF EXISTS trigger_cleanup_gclid_traces ON gclid_click_mapping;
CREATE TRIGGER trigger_cleanup_gclid_traces
    AFTER INSERT ON gclid_click_mapping
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_gclid_traces();

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'GCLID trace monitoring enhancement completed successfully';
    RAISE NOTICE 'New columns added: trace_selected_geo, final_url_params';
    RAISE NOTICE 'Auto-cleanup enabled: Keeps only last 50 records per offer';
    RAISE NOTICE 'View created: gclid_trace_stats for aggregated statistics';
    RAISE NOTICE 'Indexes created for performance optimization';
END $$;
