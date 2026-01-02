-- Add service role bypass policy for proxy_providers table
-- This allows edge functions using SERVICE_ROLE_KEY to access the table

CREATE POLICY "Service role can manage all providers"
  ON proxy_providers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
