/*
  # Add Luna Residential Proxy Credentials
  
  1. Changes
    - Add `luna_proxy_host` column for proxy server hostname
    - Add `luna_proxy_port` column for proxy server port
    - Add `luna_proxy_username` column for proxy authentication username
    - Add `luna_proxy_password` column for proxy authentication password
    - These fields support direct Luna residential proxy usage (cheaper than API)
    
  2. Notes
    - Luna residential proxy format: customer-USERNAME-sessid-SESSION.proxy.lunaproxy.com:PORT
    - Keeps existing `luna_api_token` for backward compatibility
    - Users can choose between API or residential proxy
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'luna_proxy_host'
  ) THEN
    ALTER TABLE settings ADD COLUMN luna_proxy_host text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'luna_proxy_port'
  ) THEN
    ALTER TABLE settings ADD COLUMN luna_proxy_port integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'luna_proxy_username'
  ) THEN
    ALTER TABLE settings ADD COLUMN luna_proxy_username text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'luna_proxy_password'
  ) THEN
    ALTER TABLE settings ADD COLUMN luna_proxy_password text;
  END IF;
END $$;