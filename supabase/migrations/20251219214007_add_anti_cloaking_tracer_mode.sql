/*
  # Add Anti-Cloaking Tracer Mode

  1. Changes
    - Update tracer_mode constraint to include 'anti_cloaking' option
    - Extends intelligent tracer system with advanced stealth capabilities
  
  2. Security
    - No RLS changes needed (existing policies apply)
*/

-- Update the tracer_mode constraint to include anti_cloaking
ALTER TABLE offers
DROP CONSTRAINT IF EXISTS offers_tracer_mode_check;

ALTER TABLE offers
ADD CONSTRAINT offers_tracer_mode_check 
CHECK (tracer_mode IN ('auto', 'http_only', 'browser', 'anti_cloaking'));