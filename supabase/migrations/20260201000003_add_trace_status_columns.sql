-- Migration: Add trace status tracking columns to gclid_click_mapping
-- Created: 2026-02-01
-- Purpose: Track completion status of tracking URL traces for GCLID clicks

ALTER TABLE gclid_click_mapping
ADD COLUMN IF NOT EXISTS tracking_trace_status TEXT,
ADD COLUMN IF NOT EXISTS tracking_trace_hops INTEGER,
ADD COLUMN IF NOT EXISTS tracking_trace_final_url TEXT,
ADD COLUMN IF NOT EXISTS tracking_trace_proxy_ip TEXT,
ADD COLUMN IF NOT EXISTS tracking_trace_error TEXT;

-- Add index for querying by trace status
CREATE INDEX IF NOT EXISTS idx_gclid_click_mapping_trace_status ON gclid_click_mapping(tracking_trace_status);

-- Add comments
COMMENT ON COLUMN gclid_click_mapping.tracking_trace_status IS 'Status of tracking URL trace: completed, failed, error, or null (pending)';
COMMENT ON COLUMN gclid_click_mapping.tracking_trace_hops IS 'Number of redirect hops in the trace';
COMMENT ON COLUMN gclid_click_mapping.tracking_trace_final_url IS 'Final URL reached by the trace';
COMMENT ON COLUMN gclid_click_mapping.tracking_trace_proxy_ip IS 'Residential proxy IP used for the trace';
COMMENT ON COLUMN gclid_click_mapping.tracking_trace_error IS 'Error message if trace failed';
