-- Migration: Add account_id to url_traces for multi-account support
-- This allows the same offer to be run from multiple Google Ads accounts
-- Identifier: offer_name + account_id

-- Add account_id column to url_traces
ALTER TABLE url_traces 
ADD COLUMN IF NOT EXISTS account_id TEXT;

-- Create index for efficient queries by offer_id + account_id + date
CREATE INDEX IF NOT EXISTS idx_url_traces_account_lookup 
ON url_traces(offer_id, account_id, visited_at DESC);

-- Create index for efficient yesterday queries with account_id
CREATE INDEX IF NOT EXISTS idx_url_traces_account_interval_lookup 
ON url_traces(offer_id, account_id, visited_at, interval_used_ms) 
WHERE interval_used_ms IS NOT NULL;

-- Comment the columns
COMMENT ON COLUMN url_traces.account_id IS 'Google Ads account ID (customer ID) for multi-account support per offer';
