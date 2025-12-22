/*
  # Update release_ip Function with Configurable Cooldown

  1. Changes
    - Modify release_ip function to read cooldown from settings table
    - If settings.ip_cooldown_seconds is NULL or not set, use 60 seconds (current default)
    - No changes to function signature or parameters
    - Backwards compatible with existing callers

  2. Logic
    - Query settings table for user's ip_cooldown_seconds
    - Use COALESCE to fallback to 60 if NULL
    - Apply cooldown when releasing IP back to pool
*/

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
  v_cooldown_seconds integer;
  v_user_id uuid;
BEGIN
  -- Get the user_id from the IP pool entry
  SELECT user_id INTO v_user_id
  FROM ip_rotation_pool
  WHERE ip_address = p_ip_address
  LIMIT 1;

  -- Get cooldown from settings, default to 60 seconds if NULL or not set
  SELECT COALESCE(ip_cooldown_seconds, 60) INTO v_cooldown_seconds
  FROM settings
  WHERE user_id = v_user_id
  LIMIT 1;

  -- If no settings found, use default 60 seconds
  IF v_cooldown_seconds IS NULL THEN
    v_cooldown_seconds := 60;
  END IF;

  -- Update the IP status with configurable cooldown
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