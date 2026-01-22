/*
  # Add Proxy Protocol Selection to Offers

  1. Changes
    - Add `proxy_protocol` column to offers table
    - Supports 'http' (default, HTTP/HTTPS CONNECT) and 'socks5' protocols
    - Per-offer protocol selection for TLS fingerprinting bypass
  
  2. Migration Strategy
    - Defaults existing offers to 'http' protocol
    - Users can change to 'socks5' via UI when needed
*/

-- Add proxy_protocol column to offers
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'offers' AND column_name = 'proxy_protocol'
    ) THEN
        ALTER TABLE offers 
        ADD COLUMN proxy_protocol TEXT NOT NULL DEFAULT 'http'
        CHECK (proxy_protocol IN ('http', 'socks5'));
        
        COMMENT ON COLUMN offers.proxy_protocol IS 
        'Proxy protocol for this offer: http (HTTP/HTTPS CONNECT) or socks5 (SOCKS5 protocol). Use socks5 to bypass TLS fingerprinting.';
    END IF;
END $$;

-- Set default protocol for existing offers
UPDATE offers 
SET proxy_protocol = 'http' 
WHERE proxy_protocol IS NULL;

-- Create index for filtering by protocol (optional)
CREATE INDEX IF NOT EXISTS idx_offers_proxy_protocol ON offers(proxy_protocol);
