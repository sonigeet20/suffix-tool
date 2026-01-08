-- Add total_clicks and unique_landing_pages columns to daily_trace_counts
-- These are sent from Google Ads script for interval calculation

ALTER TABLE daily_trace_counts 
ADD COLUMN IF NOT EXISTS total_clicks INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS unique_landing_pages INT DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN daily_trace_counts.total_clicks IS 'Total clicks from Google Ads yesterday report';
COMMENT ON COLUMN daily_trace_counts.unique_landing_pages IS 'Unique landing pages from Google Ads yesterday report';
