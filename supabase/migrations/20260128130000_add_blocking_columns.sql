-- Add bot/IP blocking tracking columns to google_ads_click_events

ALTER TABLE google_ads_click_events
ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS block_reason TEXT;

-- Create index for blocked click analysis
CREATE INDEX IF NOT EXISTS idx_click_events_blocked 
  ON google_ads_click_events(offer_name, blocked, clicked_at DESC);

-- Add comment
COMMENT ON COLUMN google_ads_click_events.blocked IS 'Whether this click was blocked by bot/IP filtering';
COMMENT ON COLUMN google_ads_click_events.block_reason IS 'Reason for blocking (if blocked=true)';
