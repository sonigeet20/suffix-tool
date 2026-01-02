/*
  # Add Bright Data Browser Tracer Mode

  1. Changes
    - Update tracer_mode constraint to include 'brightdata_browser' option
    - Enables using Bright Data's Browser API for advanced redirect tracing
  
  2. Security
    - No RLS changes needed (existing policies apply)
*/

-- Update the tracer_mode constraint to include brightdata_browser
-- First, set any NULL or invalid tracer_mode values to 'auto' to avoid constraint violation
UPDATE offers
SET tracer_mode = 'auto'
WHERE tracer_mode IS NULL OR tracer_mode NOT IN ('auto', 'http_only', 'browser', 'anti_cloaking', 'brightdata_browser');

ALTER TABLE offers
DROP CONSTRAINT IF EXISTS offers_tracer_mode_check;

ALTER TABLE offers
ADD CONSTRAINT offers_tracer_mode_check 
CHECK (tracer_mode IN ('auto', 'http_only', 'browser', 'anti_cloaking', 'brightdata_browser'));
