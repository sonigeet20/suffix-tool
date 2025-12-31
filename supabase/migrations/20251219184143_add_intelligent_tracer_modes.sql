/*
  # Add Intelligent Tracer Modes to Offers

  ## Overview
  Adds intelligent tracer mode selection to offers, allowing users to choose between:
  - AUTO: Automatically detect best tracer (HTTP-only vs Browser)
  - HTTP_ONLY: Fast, lightweight HTTP redirect following
  - BROWSER: Full browser rendering with JavaScript execution

  ## Changes

  ### 1. New Columns in `offers` Table
  - `tracer_mode`: Mode selection (auto, http_only, browser)
  - `tracer_detection_result`: Last auto-detection result for transparency
  - `block_resources`: Whether to block images/css/fonts in browser mode
  - `extract_only`: Only extract params, don't render full page

  ## Design Principles

  ### HTTP-Only Tracer (Fast)
  - Follows HTTP 301/302 redirects
  - Parses meta refresh tags
  - Extracts JavaScript redirects from HTML
  - 10-50x faster than browser
  - 99% less bandwidth
  - Best for: Simple redirect chains, affiliate links

  ### Browser Tracer (Complex)
  - Full Chromium/Playwright execution
  - Handles JavaScript, AJAX, dynamic content
  - Waits for redirects and network idle
  - Resource blocking for speed (images, fonts, css)
  - Best for: Complex tracking, CPA networks, dynamic pages

  ### Auto Detection
  - Tries HTTP-only first (5 seconds)
  - Falls back to browser if:
    - No redirects detected
    - JavaScript redirects found but not extracted
    - Meta refresh with dynamic content
    - AJAX/fetch calls detected

  ## Performance Targets

  HTTP-Only Mode:
  - Average: 2-5 seconds
  - Bandwidth: 10-50 KB per trace
  - Cost: ~$0.0001 per trace

  Browser Mode:
  - Average: 10-30 seconds
  - Bandwidth: 500 KB - 2 MB per trace
  - Cost: ~$0.002 per trace

  Auto Mode:
  - Average: 3-8 seconds (HTTP success) or 12-35 seconds (fallback)
  - Adapts to offer complexity
*/

-- Add tracer mode columns to offers table
ALTER TABLE offers
ADD COLUMN IF NOT EXISTS tracer_mode text DEFAULT 'auto' CHECK (tracer_mode IN ('auto', 'http_only', 'browser')),
ADD COLUMN IF NOT EXISTS tracer_detection_result jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS block_resources boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS extract_only boolean DEFAULT true;

-- Add tracer mode to active_trace_requests for tracking
ALTER TABLE active_trace_requests
ADD COLUMN IF NOT EXISTS tracer_mode_used text,
ADD COLUMN IF NOT EXISTS detection_reason text;

-- Add tracer performance metrics to ip_pool_statistics
ALTER TABLE ip_pool_statistics
ADD COLUMN IF NOT EXISTS http_only_traces integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS browser_traces integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_http_only_time_ms integer,
ADD COLUMN IF NOT EXISTS avg_browser_time_ms integer;

-- Create index for tracer mode queries
CREATE INDEX IF NOT EXISTS idx_offers_tracer_mode ON offers(tracer_mode, is_active);
CREATE INDEX IF NOT EXISTS idx_active_requests_tracer_mode ON active_trace_requests(tracer_mode_used, status);

-- Add helpful comments
COMMENT ON COLUMN offers.tracer_mode IS 'Tracer mode: auto (intelligent detection), http_only (fast), browser (complex)';
COMMENT ON COLUMN offers.tracer_detection_result IS 'Last auto-detection result with reasoning and performance metrics';
COMMENT ON COLUMN offers.block_resources IS 'Block images/css/fonts in browser mode for faster tracing';
COMMENT ON COLUMN offers.extract_only IS 'Only extract parameters without full page rendering';

COMMENT ON COLUMN active_trace_requests.tracer_mode_used IS 'Which tracer mode was actually used for this request';
COMMENT ON COLUMN active_trace_requests.detection_reason IS 'Why auto-detection chose this mode';
