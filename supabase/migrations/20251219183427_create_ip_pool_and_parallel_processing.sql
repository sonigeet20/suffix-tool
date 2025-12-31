/*
  # Create IP Pool and Parallel Processing System

  ## Overview
  This migration creates the infrastructure for high-concurrency parallel tracing
  using an over-provisioned IP pool. Each Google Ad click gets traced in real-time
  with a dedicated IP address.

  ## 1. New Tables

  ### `ip_rotation_pool`
  Manages the pool of available proxy IPs:
  - IP address and country targeting
  - Real-time availability status
  - Lock management for concurrent access
  - Usage statistics and health metrics
  - Cooldown period tracking

  ### `active_trace_requests`
  Tracks currently processing trace requests:
  - Request ID and metadata
  - Assigned IP address
  - Processing status and timing
  - Error tracking and retry management

  ### `ip_pool_statistics`
  Aggregated metrics for monitoring:
  - Pool utilization rates
  - Average wait times
  - Success/failure rates
  - Performance metrics per country

  ## 2. Design Principles

  ### Optimistic Locking
  - Fast IP acquisition using UPDATE...RETURNING
  - No blocking locks, fails fast if unavailable
  - Sub-100ms lock acquisition time

  ### Over-Provisioning Strategy
  - Maintain 2-3x peak concurrent requests
  - Example: 50 peak requests → 100-150 IPs provisioned
  - Country-specific pools (80% USA, 20% other)

  ### Auto-Cleanup
  - Expired locks released automatically
  - Failed requests cleaned up after timeout
  - IP cooldown periods enforced

  ## 3. Security
  - RLS enabled on all tables
  - Service role access for edge functions
  - Authenticated user read access for monitoring

  ## 4. Performance Indexes
  - Fast IP availability lookups
  - Efficient status filtering
  - Quick lock expiration queries
*/

-- Create IP rotation pool table
CREATE TABLE IF NOT EXISTS ip_rotation_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text UNIQUE NOT NULL,
  ip_port text DEFAULT '7000',
  country text NOT NULL DEFAULT 'us',
  provider text DEFAULT 'luna' CHECK (provider IN ('luna', 'other')),

  -- Real-time status
  status text DEFAULT 'available' CHECK (status IN ('available', 'locked', 'cooldown', 'failed')),
  locked_until timestamptz,
  locked_by_request uuid,

  -- Usage tracking
  last_used_at timestamptz,
  total_uses bigint DEFAULT 0,
  success_count bigint DEFAULT 0,
  failure_count bigint DEFAULT 0,

  -- Health metrics
  avg_response_time_ms integer DEFAULT 0,
  last_health_check timestamptz,
  is_healthy boolean DEFAULT true,
  consecutive_failures integer DEFAULT 0,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  notes text
);

-- Create active trace requests table
CREATE TABLE IF NOT EXISTS active_trace_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request details
  offer_id uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  tracking_url text NOT NULL,
  target_country text NOT NULL,
  inbound_params jsonb DEFAULT '{}'::jsonb,

  -- IP assignment
  ip_assigned text REFERENCES ip_rotation_pool(ip_address),
  ip_locked_at timestamptz,

  -- Processing status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'timeout')),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  timeout_at timestamptz DEFAULT now() + INTERVAL '90 seconds',

  -- Results
  final_url text,
  extracted_params jsonb,
  redirect_chain jsonb,
  error_message text,

  -- Performance metrics
  wait_time_ms integer,
  trace_time_ms integer,
  total_time_ms integer,

  -- Retry tracking
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 2,

  created_at timestamptz DEFAULT now()
);

-- Create IP pool statistics table (for monitoring dashboard)
CREATE TABLE IF NOT EXISTS ip_pool_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz DEFAULT now(),

  -- Pool metrics
  total_ips integer,
  available_ips integer,
  locked_ips integer,
  cooldown_ips integer,
  failed_ips integer,

  -- Usage metrics
  active_requests integer,
  completed_requests_1h integer,
  failed_requests_1h integer,
  avg_wait_time_ms integer,
  avg_trace_time_ms integer,

  -- Per-country breakdown
  country_breakdown jsonb DEFAULT '{}'::jsonb,

  -- Health
  pool_utilization_percent integer,
  requests_queued integer
);

-- Enable RLS on all tables
ALTER TABLE ip_rotation_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_trace_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_pool_statistics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ip_rotation_pool
-- Service role can manage the pool
CREATE POLICY "Service role full access to IP pool"
  ON ip_rotation_pool FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view pool status (for monitoring)
CREATE POLICY "Users can view IP pool status"
  ON ip_rotation_pool FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for active_trace_requests
-- Service role can manage requests
CREATE POLICY "Service role full access to trace requests"
  ON active_trace_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own trace requests
CREATE POLICY "Users can view own trace requests"
  ON active_trace_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = active_trace_requests.offer_id
      AND offers.user_id = auth.uid()
    )
  );

-- RLS Policies for ip_pool_statistics
-- Service role can write statistics
CREATE POLICY "Service role full access to statistics"
  ON ip_pool_statistics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view statistics
CREATE POLICY "Users can view IP pool statistics"
  ON ip_pool_statistics FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ip_pool_status ON ip_rotation_pool(status, country);
CREATE INDEX IF NOT EXISTS idx_ip_pool_available ON ip_rotation_pool(status, country) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_ip_pool_locked_until ON ip_rotation_pool(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ip_pool_health ON ip_rotation_pool(is_healthy, status);

CREATE INDEX IF NOT EXISTS idx_active_requests_status ON active_trace_requests(status, started_at);
CREATE INDEX IF NOT EXISTS idx_active_requests_timeout ON active_trace_requests(timeout_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_active_requests_offer ON active_trace_requests(offer_id, status);

CREATE INDEX IF NOT EXISTS idx_ip_statistics_time ON ip_pool_statistics(recorded_at DESC);

-- Create function to automatically release expired IP locks
CREATE OR REPLACE FUNCTION release_expired_ip_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ip_rotation_pool
  SET
    status = 'available',
    locked_by_request = NULL,
    locked_until = NULL,
    updated_at = now()
  WHERE
    status = 'locked'
    AND locked_until < now();
END;
$$;

-- Create function to mark timed-out requests as failed
CREATE OR REPLACE FUNCTION cleanup_timed_out_requests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark timed out requests
  UPDATE active_trace_requests
  SET
    status = 'timeout',
    completed_at = now(),
    error_message = 'Request exceeded timeout limit'
  WHERE
    status IN ('pending', 'processing')
    AND timeout_at < now();

  -- Release IPs from timed out requests
  UPDATE ip_rotation_pool
  SET
    status = 'available',
    locked_by_request = NULL,
    locked_until = NULL,
    updated_at = now()
  WHERE
    locked_by_request IN (
      SELECT request_id
      FROM active_trace_requests
      WHERE status = 'timeout'
    );
END;
$$;

-- Create function to get available IP (fast optimistic locking)
CREATE OR REPLACE FUNCTION lock_available_ip(
  p_country text,
  p_request_id uuid,
  p_lock_duration_seconds integer DEFAULT 90
)
RETURNS TABLE(
  ip_address text,
  ip_port text,
  provider text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked_ip RECORD;
BEGIN
  -- Try to lock an available IP atomically
  UPDATE ip_rotation_pool
  SET
    status = 'locked',
    locked_by_request = p_request_id,
    locked_until = now() + (p_lock_duration_seconds || ' seconds')::interval,
    last_used_at = now(),
    total_uses = total_uses + 1,
    updated_at = now()
  WHERE id = (
    SELECT id
    FROM ip_rotation_pool
    WHERE
      status = 'available'
      AND country = p_country
      AND is_healthy = true
    ORDER BY last_used_at ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    ip_rotation_pool.ip_address,
    ip_rotation_pool.ip_port,
    ip_rotation_pool.provider
  INTO v_locked_ip;

  IF v_locked_ip IS NOT NULL THEN
    RETURN QUERY SELECT
      v_locked_ip.ip_address,
      v_locked_ip.ip_port,
      v_locked_ip.provider;
  END IF;
END;
$$;

-- Create function to release IP back to pool
CREATE OR REPLACE FUNCTION release_ip(
  p_ip_address text,
  p_success boolean DEFAULT true,
  p_response_time_ms integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cooldown_seconds integer := 60; -- 60 second cooldown between uses
BEGIN
  UPDATE ip_rotation_pool
  SET
    status = 'cooldown',
    locked_by_request = NULL,
    locked_until = now() + (v_cooldown_seconds || ' seconds')::interval,
    success_count = CASE WHEN p_success THEN success_count + 1 ELSE success_count END,
    failure_count = CASE WHEN NOT p_success THEN failure_count + 1 ELSE failure_count END,
    consecutive_failures = CASE WHEN NOT p_success THEN consecutive_failures + 1 ELSE 0 END,
    is_healthy = CASE WHEN (consecutive_failures + CASE WHEN NOT p_success THEN 1 ELSE 0 END) > 5 THEN false ELSE true END,
    avg_response_time_ms = CASE
      WHEN p_response_time_ms IS NOT NULL THEN
        ((avg_response_time_ms * total_uses) + p_response_time_ms) / (total_uses + 1)
      ELSE avg_response_time_ms
    END,
    updated_at = now()
  WHERE ip_address = p_ip_address;
END;
$$;

-- Create function to record pool statistics
CREATE OR REPLACE FUNCTION record_pool_statistics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats RECORD;
BEGIN
  -- Calculate current pool statistics
  SELECT
    COUNT(*) as total_ips,
    COUNT(*) FILTER (WHERE status = 'available') as available_ips,
    COUNT(*) FILTER (WHERE status = 'locked') as locked_ips,
    COUNT(*) FILTER (WHERE status = 'cooldown') as cooldown_ips,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_ips
  INTO v_stats
  FROM ip_rotation_pool;

  -- Insert statistics record
  INSERT INTO ip_pool_statistics (
    total_ips,
    available_ips,
    locked_ips,
    cooldown_ips,
    failed_ips,
    active_requests,
    completed_requests_1h,
    failed_requests_1h,
    pool_utilization_percent
  )
  SELECT
    v_stats.total_ips,
    v_stats.available_ips,
    v_stats.locked_ips,
    v_stats.cooldown_ips,
    v_stats.failed_ips,
    (SELECT COUNT(*) FROM active_trace_requests WHERE status IN ('pending', 'processing')),
    (SELECT COUNT(*) FROM active_trace_requests WHERE status = 'completed' AND completed_at > now() - INTERVAL '1 hour'),
    (SELECT COUNT(*) FROM active_trace_requests WHERE status = 'failed' AND completed_at > now() - INTERVAL '1 hour'),
    CASE WHEN v_stats.total_ips > 0 THEN
      ROUND(((v_stats.locked_ips + v_stats.cooldown_ips)::numeric / v_stats.total_ips) * 100)
    ELSE 0 END;
END;
$$;

-- Add helpful comments
COMMENT ON TABLE ip_rotation_pool IS 'Pool of proxy IPs available for parallel trace operations with real-time locking';
COMMENT ON TABLE active_trace_requests IS 'Currently processing trace requests with IP assignments and status tracking';
COMMENT ON TABLE ip_pool_statistics IS 'Historical metrics for monitoring IP pool utilization and performance';

COMMENT ON FUNCTION lock_available_ip IS 'Atomically locks an available IP for a trace request using optimistic locking';
COMMENT ON FUNCTION release_ip IS 'Releases an IP back to the pool with cooldown period and health tracking';
COMMENT ON FUNCTION release_expired_ip_locks IS 'Cleanup function to release IPs from expired locks';
COMMENT ON FUNCTION cleanup_timed_out_requests IS 'Marks timed-out requests as failed and releases their IPs';
COMMENT ON FUNCTION record_pool_statistics IS 'Records current pool statistics for monitoring dashboard';
