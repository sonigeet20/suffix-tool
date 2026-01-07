-- New table to track daily successful trace counts per offer/account
-- Instead of keeping individual trace rows, we maintain a 7-day rolling count

CREATE TABLE daily_trace_counts (
  id BIGSERIAL PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  date DATE NOT NULL,
  trace_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(offer_id, account_id, date)
);

-- Index for efficient daily lookups
CREATE INDEX idx_daily_trace_counts_offer_date ON daily_trace_counts(offer_id, date DESC);
CREATE INDEX idx_daily_trace_counts_account_date ON daily_trace_counts(offer_id, account_id, date DESC);

-- Function to increment daily trace count (called by get-suffix)
CREATE OR REPLACE FUNCTION increment_daily_trace_count(
  p_offer_id UUID,
  p_account_id TEXT
)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- Upsert: increment or create today's record
  INSERT INTO daily_trace_counts (offer_id, account_id, date, trace_count, updated_at)
  VALUES (
    p_offer_id,
    p_account_id,
    CURRENT_DATE,
    1,
    NOW()
  )
  ON CONFLICT (offer_id, account_id, date) DO UPDATE
  SET 
    trace_count = trace_count + 1,
    updated_at = NOW()
  RETURNING trace_count INTO v_count;
  
  -- Clean up traces older than 7 days
  DELETE FROM daily_trace_counts
  WHERE offer_id = p_offer_id
    AND date < CURRENT_DATE - INTERVAL '7 days';
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get trace count for a specific date
CREATE OR REPLACE FUNCTION get_daily_trace_count(
  p_offer_id UUID,
  p_account_id TEXT,
  p_date DATE
)
RETURNS INT AS $$
BEGIN
  RETURN COALESCE(
    (SELECT trace_count FROM daily_trace_counts
     WHERE offer_id = p_offer_id
       AND account_id = p_account_id
       AND date = p_date),
    0
  );
END;
$$ LANGUAGE plpgsql;
