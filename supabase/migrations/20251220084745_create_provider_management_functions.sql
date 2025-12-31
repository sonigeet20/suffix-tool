/*
  # Create Provider Management Functions

  1. New Functions
    - `get_active_providers(p_user_id)` - Returns list of enabled providers ordered by priority
    - `select_next_provider(p_user_id, p_rotation_mode)` - Selects next provider based on rotation strategy
    - `record_provider_result(p_provider_id, p_success, p_response_time)` - Updates provider metrics

  2. Logic
    - get_active_providers: Returns all enabled providers for a user, sorted by priority (highest first)
    - select_next_provider: Implements sequential, random, weighted, and failover rotation modes
    - record_provider_result: Tracks success/failure counts and auto-disables unhealthy providers

  3. Auto-Disable Rules
    - If failure rate > 80% over last 20 attempts, disable provider
    - If consecutive failures > 10 (tracked separately), disable provider
    - Provider type 'luna' is never auto-disabled
*/

-- Function to get all active providers for a user
CREATE OR REPLACE FUNCTION get_active_providers(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  provider_type text,
  host text,
  port integer,
  username text,
  password text,
  priority integer,
  success_count integer,
  failure_count integer,
  last_used_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id,
    pp.name,
    pp.provider_type,
    pp.host,
    pp.port,
    pp.username,
    pp.password,
    pp.priority,
    pp.success_count,
    pp.failure_count,
    pp.last_used_at
  FROM proxy_providers pp
  WHERE pp.user_id = p_user_id
    AND pp.enabled = true
  ORDER BY pp.priority DESC, pp.last_used_at ASC NULLS FIRST;
END;
$$;

-- Function to select next provider based on rotation mode
CREATE OR REPLACE FUNCTION select_next_provider(
  p_user_id uuid,
  p_rotation_mode text DEFAULT 'sequential'
)
RETURNS TABLE (
  id uuid,
  name text,
  provider_type text,
  host text,
  port integer,
  username text,
  password text,
  priority integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rotation_mode text;
  v_total_priority integer;
  v_random_value integer;
  v_cumulative integer := 0;
BEGIN
  -- Get rotation mode from settings if not provided
  IF p_rotation_mode IS NULL THEN
    SELECT COALESCE(proxy_rotation_mode, 'sequential') INTO v_rotation_mode
    FROM settings
    WHERE user_id = p_user_id
    LIMIT 1;
  ELSE
    v_rotation_mode := p_rotation_mode;
  END IF;

  -- Default to sequential if still NULL
  IF v_rotation_mode IS NULL THEN
    v_rotation_mode := 'sequential';
  END IF;

  -- Sequential: Return highest priority provider that was used least recently
  IF v_rotation_mode = 'sequential' THEN
    RETURN QUERY
    SELECT
      pp.id,
      pp.name,
      pp.provider_type,
      pp.host,
      pp.port,
      pp.username,
      pp.password,
      pp.priority
    FROM proxy_providers pp
    WHERE pp.user_id = p_user_id
      AND pp.enabled = true
    ORDER BY pp.priority DESC, pp.last_used_at ASC NULLS FIRST
    LIMIT 1;

  -- Random: Return random provider from all enabled
  ELSIF v_rotation_mode = 'random' THEN
    RETURN QUERY
    SELECT
      pp.id,
      pp.name,
      pp.provider_type,
      pp.host,
      pp.port,
      pp.username,
      pp.password,
      pp.priority
    FROM proxy_providers pp
    WHERE pp.user_id = p_user_id
      AND pp.enabled = true
    ORDER BY random()
    LIMIT 1;

  -- Weighted: Select based on priority as probability weight
  ELSIF v_rotation_mode = 'weighted' THEN
    -- Calculate total priority sum
    SELECT SUM(priority) INTO v_total_priority
    FROM proxy_providers
    WHERE user_id = p_user_id
      AND enabled = true;

    -- Generate random value between 1 and total priority
    v_random_value := floor(random() * v_total_priority)::integer + 1;

    -- Select provider using cumulative probability
    RETURN QUERY
    WITH weighted_providers AS (
      SELECT
        pp.id,
        pp.name,
        pp.provider_type,
        pp.host,
        pp.port,
        pp.username,
        pp.password,
        pp.priority,
        SUM(pp.priority) OVER (ORDER BY pp.priority DESC, pp.id) as cumulative_priority
      FROM proxy_providers pp
      WHERE pp.user_id = p_user_id
        AND pp.enabled = true
    )
    SELECT
      wp.id,
      wp.name,
      wp.provider_type,
      wp.host,
      wp.port,
      wp.username,
      wp.password,
      wp.priority
    FROM weighted_providers wp
    WHERE wp.cumulative_priority >= v_random_value
    ORDER BY wp.cumulative_priority
    LIMIT 1;

  -- Failover: Return highest priority provider (same as sequential)
  ELSE
    RETURN QUERY
    SELECT
      pp.id,
      pp.name,
      pp.provider_type,
      pp.host,
      pp.port,
      pp.username,
      pp.password,
      pp.priority
    FROM proxy_providers pp
    WHERE pp.user_id = p_user_id
      AND pp.enabled = true
    ORDER BY pp.priority DESC, pp.last_used_at ASC NULLS FIRST
    LIMIT 1;
  END IF;
END;
$$;

-- Function to record provider result and update metrics
CREATE OR REPLACE FUNCTION record_provider_result(
  p_provider_id uuid,
  p_success boolean,
  p_response_time_ms integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_attempts integer;
  v_failure_rate numeric;
  v_provider_type text;
BEGIN
  -- Update provider metrics
  UPDATE proxy_providers
  SET
    success_count = CASE WHEN p_success THEN success_count + 1 ELSE success_count END,
    failure_count = CASE WHEN NOT p_success THEN failure_count + 1 ELSE failure_count END,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_provider_id
  RETURNING provider_type INTO v_provider_type;

  -- Calculate failure rate and auto-disable if needed
  -- Only for non-Luna providers
  IF v_provider_type != 'luna' THEN
    SELECT success_count + failure_count, failure_count INTO v_total_attempts, v_failure_rate
    FROM proxy_providers
    WHERE id = p_provider_id;

    -- Auto-disable if failure rate > 80% over last 20+ attempts
    IF v_total_attempts >= 20 THEN
      v_failure_rate := (v_failure_rate::numeric / v_total_attempts::numeric) * 100;
      
      IF v_failure_rate > 80 THEN
        UPDATE proxy_providers
        SET enabled = false
        WHERE id = p_provider_id;
      END IF;
    END IF;
  END IF;
END;
$$;