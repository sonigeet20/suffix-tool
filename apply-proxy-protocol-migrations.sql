-- Apply proxy_protocol migrations
-- Run this against your Supabase database

-- Migration 1: Add proxy_protocol to proxy_providers
ALTER TABLE proxy_providers ADD COLUMN IF NOT EXISTS proxy_protocol VARCHAR(10) DEFAULT 'http';
ALTER TABLE proxy_providers DROP CONSTRAINT IF EXISTS proxy_providers_proxy_protocol_check;
ALTER TABLE proxy_providers ADD CONSTRAINT proxy_providers_proxy_protocol_check CHECK (proxy_protocol IN ('http', 'socks5'));
UPDATE proxy_providers SET proxy_protocol = 'http' WHERE proxy_protocol IS NULL;

-- Migration 2: Add proxy_protocol to offers  
ALTER TABLE offers ADD COLUMN IF NOT EXISTS proxy_protocol VARCHAR(10) DEFAULT 'http';
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_proxy_protocol_check;
ALTER TABLE offers ADD CONSTRAINT offers_proxy_protocol_check CHECK (proxy_protocol IN ('http', 'socks5'));
UPDATE offers SET proxy_protocol = 'http' WHERE proxy_protocol IS NULL;
COMMENT ON COLUMN offers.proxy_protocol IS 'Proxy protocol: http or socks5. Overrides provider default. Use socks5 for TLS fingerprint bypass.';

-- Verification queries
SELECT COUNT(*) as proxy_providers_count FROM proxy_providers WHERE proxy_protocol IS NOT NULL;
SELECT COUNT(*) as offers_count FROM offers WHERE proxy_protocol IS NOT NULL;
