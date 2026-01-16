-- Webhook Suffix Update System - Database Schema
-- Independent system for webhook-triggered Google Ads suffix updates with zero-click recycling

-- Table 1: Campaign Mappings (Google Ads Campaign → Offer → Trackier Campaign)
CREATE TABLE IF NOT EXISTS webhook_campaign_mappings (
    id SERIAL PRIMARY KEY,
    
    -- Unique identifier for this mapping
    mapping_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    
    -- Google Ads Campaign Details
    account_id VARCHAR(50) NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    campaign_name VARCHAR(255),
    
    -- Offer Details
    offer_name VARCHAR(255) NOT NULL,
    offer_id VARCHAR(100),
    
    -- Trackier Campaign Details
    trackier_campaign_id INTEGER,
    trackier_webhook_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    webhook_configured BOOLEAN DEFAULT false, -- Has user added webhook URL to Trackier?
    first_webhook_received_at TIMESTAMP, -- When first webhook was received
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100),
    
    -- Unique constraint: One mapping per Google Ads campaign
    CONSTRAINT unique_google_campaign UNIQUE (account_id, campaign_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_offer ON webhook_campaign_mappings(offer_name);
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_active ON webhook_campaign_mappings(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_mapping_id ON webhook_campaign_mappings(mapping_id);
CREATE INDEX IF NOT EXISTS idx_webhook_mappings_configured ON webhook_campaign_mappings(webhook_configured);

-- Table 2: Zero-Click Suffix Bucket
CREATE TABLE IF NOT EXISTS webhook_suffix_bucket (
    id SERIAL PRIMARY KEY,
    
    -- Link to campaign mapping
    mapping_id UUID NOT NULL REFERENCES webhook_campaign_mappings(mapping_id) ON DELETE CASCADE,
    
    -- Suffix Details
    suffix TEXT NOT NULL,
    suffix_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA256 of suffix for deduplication
    
    -- Tracking
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    -- Metadata
    fetched_at TIMESTAMP DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'zero_click', -- 'zero_click', 'manual', 'generated'
    
    -- Zero-Click Context (when fetched from Google Ads)
    original_clicks INTEGER DEFAULT 0,
    original_impressions INTEGER DEFAULT 0,
    fetched_from_date DATE,
    
    -- Status
    is_valid BOOLEAN DEFAULT true,
    
    CONSTRAINT unique_suffix_per_mapping UNIQUE (mapping_id, suffix_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_suffix_bucket_mapping ON webhook_suffix_bucket(mapping_id);
CREATE INDEX IF NOT EXISTS idx_suffix_bucket_valid ON webhook_suffix_bucket(mapping_id, is_valid);
CREATE INDEX IF NOT EXISTS idx_suffix_bucket_usage ON webhook_suffix_bucket(mapping_id, times_used);

-- Table 3: Suffix Update Queue (Webhooks → Google Ads Updates)
CREATE TABLE IF NOT EXISTS webhook_suffix_update_queue (
    id SERIAL PRIMARY KEY,
    
    -- Link to campaign mapping
    mapping_id UUID NOT NULL REFERENCES webhook_campaign_mappings(mapping_id) ON DELETE CASCADE,
    
    -- Google Ads Target
    account_id VARCHAR(50) NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    
    -- New Suffix to Apply
    new_suffix TEXT NOT NULL,
    
    -- Queue Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Tracking
    webhook_received_at TIMESTAMP DEFAULT NOW(),
    processing_started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Error Handling
    error_message TEXT,
    last_error_at TIMESTAMP,
    
    -- Metadata
    webhook_data JSONB, -- Store original webhook payload
    priority INTEGER DEFAULT 5 -- 1-10, higher = more urgent
);

-- Indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_queue_status ON webhook_suffix_update_queue(status, webhook_received_at);
CREATE INDEX IF NOT EXISTS idx_queue_mapping ON webhook_suffix_update_queue(mapping_id);
CREATE INDEX IF NOT EXISTS idx_queue_pending ON webhook_suffix_update_queue(status, priority DESC);

-- Table 4: Suffix Usage Log (Audit Trail)
CREATE TABLE IF NOT EXISTS webhook_suffix_usage_log (
    id SERIAL PRIMARY KEY,
    
    -- Link to mapping and suffix
    mapping_id UUID NOT NULL REFERENCES webhook_campaign_mappings(mapping_id) ON DELETE CASCADE,
    suffix_id INTEGER REFERENCES webhook_suffix_bucket(id) ON DELETE SET NULL,
    
    -- Usage Details
    suffix TEXT NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'applied', 'fetched', 'invalidated', 'webhook_received'
    
    -- Context
    queue_id INTEGER REFERENCES webhook_suffix_update_queue(id) ON DELETE SET NULL,
    webhook_data JSONB,
    
    -- Tracking
    timestamp TIMESTAMP DEFAULT NOW(),
    account_id VARCHAR(50),
    campaign_id VARCHAR(50),
    
    -- Metadata
    metadata JSONB -- Additional context
);

-- Index for log queries
CREATE INDEX IF NOT EXISTS idx_usage_log_mapping ON webhook_suffix_usage_log(mapping_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_action ON webhook_suffix_usage_log(action, timestamp DESC);

-- Trigger to update updated_at on mappings
CREATE OR REPLACE FUNCTION update_webhook_mapping_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS webhook_mappings_update_timestamp ON webhook_campaign_mappings;

CREATE TRIGGER webhook_mappings_update_timestamp
    BEFORE UPDATE ON webhook_campaign_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_webhook_mapping_timestamp();

-- Function to get next suffix from bucket (sequential, unused only)
CREATE OR REPLACE FUNCTION get_next_suffix_from_bucket(p_mapping_id UUID)
RETURNS TABLE (
    suffix_id INTEGER,
    suffix TEXT,
    times_used INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT id, suffix, times_used
    FROM webhook_suffix_bucket
    WHERE mapping_id = p_mapping_id
      AND is_valid = true
      AND times_used = 0  -- Only get unused suffixes
    ORDER BY id ASC  -- Sequential order (oldest first)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to mark suffix as used
CREATE OR REPLACE FUNCTION mark_suffix_used(p_suffix_id INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE webhook_suffix_bucket
    SET times_used = times_used + 1,
        last_used_at = NOW()
    WHERE id = p_suffix_id;
END;
$$ LANGUAGE plpgsql;

-- Function to delete suffix from bucket
CREATE OR REPLACE FUNCTION delete_suffix_from_bucket(p_suffix_id INTEGER)
RETURNS VOID AS $$
BEGIN
    DELETE FROM webhook_suffix_bucket
    WHERE id = p_suffix_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean bucket before daily refresh (delete used suffixes + old zero-click suffixes)
-- Keeps only: unused traced suffixes that were never sent to Google
CREATE OR REPLACE FUNCTION clean_old_used_suffixes(p_mapping_id UUID)
RETURNS TABLE (
    deleted_count INTEGER
) AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_suffix_bucket
    WHERE mapping_id = p_mapping_id
      AND (
          times_used > 0  -- Delete suffixes already sent to Google
          OR source = 'zero_click'  -- Delete old zero-click fetch (will be replaced with fresh ones)
      );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get bucket status
CREATE OR REPLACE FUNCTION get_bucket_status(p_mapping_id UUID)
RETURNS TABLE (
    total_suffixes BIGINT,
    valid_suffixes BIGINT,
    avg_usage NUMERIC,
    last_fetch TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_suffixes,
        COUNT(*) FILTER (WHERE is_valid = true) as valid_suffixes,
        AVG(times_used) as avg_usage,
        MAX(fetched_at) as last_fetch
    FROM webhook_suffix_bucket
    WHERE mapping_id = p_mapping_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE webhook_campaign_mappings IS 'Maps Google Ads campaigns to offers with Trackier campaigns';
COMMENT ON TABLE webhook_suffix_bucket IS 'Stores zero-click suffixes for reuse per campaign mapping';
COMMENT ON TABLE webhook_suffix_update_queue IS 'Queue of pending suffix updates triggered by webhooks';
COMMENT ON TABLE webhook_suffix_usage_log IS 'Audit log of all suffix-related actions';
