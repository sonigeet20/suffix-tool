-- Add user agent and referrer to silent fetch stats for cookie tracking verification
ALTER TABLE google_ads_silent_fetch_stats 
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS request_headers JSONB DEFAULT '{}'::jsonb;

-- Add index for user agent analysis
CREATE INDEX IF NOT EXISTS idx_silent_fetch_user_agent 
  ON google_ads_silent_fetch_stats(user_agent, created_at DESC);

-- Add index for referrer analysis
CREATE INDEX IF NOT EXISTS idx_silent_fetch_referrer
  ON google_ads_silent_fetch_stats(referrer, created_at DESC);

COMMENT ON COLUMN google_ads_silent_fetch_stats.user_agent IS 'User agent of the client making the request - helps identify real users vs bots';
COMMENT ON COLUMN google_ads_silent_fetch_stats.referrer IS 'HTTP Referer header - shows where the click came from';
COMMENT ON COLUMN google_ads_silent_fetch_stats.request_headers IS 'Full request headers for debugging cookie drops';
