-- Create table for tracking Trackier click count polling
CREATE TABLE IF NOT EXISTS trackier_polling_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to offer
  trackier_offer_id UUID NOT NULL,
  campaign_id TEXT NOT NULL,
  
  -- Click count comparison
  previous_count INTEGER DEFAULT 0,
  current_count INTEGER DEFAULT 0,
  clicks_detected INTEGER DEFAULT 0,
  
  -- Processing status
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_trackier_polling_logs_offer_id 
  ON trackier_polling_logs(trackier_offer_id);
CREATE INDEX IF NOT EXISTS idx_trackier_polling_logs_campaign_id 
  ON trackier_polling_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_trackier_polling_logs_processed 
  ON trackier_polling_logs(processed);
CREATE INDEX IF NOT EXISTS idx_trackier_polling_logs_created_at 
  ON trackier_polling_logs(created_at DESC);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_trackier_polling_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trackier_polling_logs_updated_at_trigger ON trackier_polling_logs;
CREATE TRIGGER trackier_polling_logs_updated_at_trigger
BEFORE UPDATE ON trackier_polling_logs
FOR EACH ROW
EXECUTE FUNCTION update_trackier_polling_logs_updated_at();
