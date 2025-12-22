-- IP Pool Monitoring Queries
-- Run these queries to monitor the parallel tracing system

-- ============================================
-- 1. CURRENT POOL STATUS
-- ============================================
SELECT
  status,
  country,
  COUNT(*) as count,
  ROUND(AVG(avg_response_time_ms)) as avg_response_ms
FROM ip_rotation_pool
WHERE is_healthy = true
GROUP BY status, country
ORDER BY country, status;

-- ============================================
-- 2. POOL UTILIZATION SUMMARY
-- ============================================
SELECT
  COUNT(*) as total_ips,
  COUNT(*) FILTER (WHERE status = 'available') as available,
  COUNT(*) FILTER (WHERE status = 'locked') as locked,
  COUNT(*) FILTER (WHERE status = 'cooldown') as cooldown,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE is_healthy = false) as unhealthy,
  ROUND(
    (COUNT(*) FILTER (WHERE status IN ('locked', 'cooldown'))::numeric /
    NULLIF(COUNT(*), 0) * 100), 1
  ) as utilization_percent
FROM ip_rotation_pool;

-- ============================================
-- 3. ACTIVE TRACE REQUESTS
-- ============================================
SELECT
  status,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)))) as avg_duration_sec,
  MIN(started_at) as oldest_request
FROM active_trace_requests
WHERE started_at > NOW() - INTERVAL '1 hour'
GROUP BY status
ORDER BY status;

-- ============================================
-- 4. RECENT COMPLETED TRACES
-- ============================================
SELECT
  request_id,
  offer_id,
  target_country,
  ip_assigned,
  status,
  trace_time_ms,
  EXTRACT(EPOCH FROM (completed_at - started_at)) as total_duration_sec,
  completed_at
FROM active_trace_requests
WHERE status IN ('completed', 'failed', 'timeout')
ORDER BY completed_at DESC
LIMIT 20;

-- ============================================
-- 5. IP PERFORMANCE RANKING
-- ============================================
SELECT
  ip_address,
  country,
  total_uses,
  success_count,
  failure_count,
  ROUND((success_count::numeric / NULLIF(total_uses, 0) * 100), 1) as success_rate,
  avg_response_time_ms,
  consecutive_failures,
  is_healthy,
  last_used_at
FROM ip_rotation_pool
ORDER BY total_uses DESC, success_rate DESC
LIMIT 20;

-- ============================================
-- 6. POOL STATISTICS HISTORY (Last 24 Hours)
-- ============================================
SELECT
  recorded_at,
  total_ips,
  available_ips,
  locked_ips,
  cooldown_ips,
  pool_utilization_percent,
  active_requests,
  completed_requests_1h,
  failed_requests_1h
FROM ip_pool_statistics
WHERE recorded_at > NOW() - INTERVAL '24 hours'
ORDER BY recorded_at DESC;

-- ============================================
-- 7. UNHEALTHY IPS REPORT
-- ============================================
SELECT
  ip_address,
  country,
  status,
  consecutive_failures,
  failure_count,
  total_uses,
  last_used_at,
  notes
FROM ip_rotation_pool
WHERE is_healthy = false
ORDER BY consecutive_failures DESC;

-- ============================================
-- 8. STUCK/EXPIRED LOCKS
-- ============================================
SELECT
  ip_address,
  country,
  status,
  locked_by_request,
  locked_until,
  EXTRACT(EPOCH FROM (NOW() - locked_until)) as expired_by_seconds
FROM ip_rotation_pool
WHERE
  status IN ('locked', 'cooldown')
  AND locked_until < NOW()
ORDER BY locked_until;

-- ============================================
-- 9. TIMEOUT ANALYSIS
-- ============================================
SELECT
  target_country,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'timeout') as timeouts,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'timeout')::numeric /
    NULLIF(COUNT(*), 0) * 100), 1
  ) as timeout_rate_percent
FROM active_trace_requests
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY target_country
ORDER BY total_requests DESC;

-- ============================================
-- 10. PEAK CONCURRENCY ANALYSIS
-- ============================================
SELECT
  date_trunc('hour', started_at) as hour,
  MAX(concurrent_requests) as peak_concurrent,
  AVG(concurrent_requests) as avg_concurrent
FROM (
  SELECT
    started_at,
    COUNT(*) OVER (
      ORDER BY started_at
      RANGE BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
    ) as concurrent_requests
  FROM active_trace_requests
  WHERE started_at > NOW() - INTERVAL '24 hours'
) subquery
GROUP BY hour
ORDER BY hour DESC;

-- ============================================
-- 11. MAINTENANCE CHECK
-- ============================================
-- Run this before manual maintenance to see what needs cleanup
SELECT
  'Expired Locks' as check_type,
  COUNT(*) as count
FROM ip_rotation_pool
WHERE status = 'locked' AND locked_until < NOW()

UNION ALL

SELECT
  'Timed Out Requests',
  COUNT(*)
FROM active_trace_requests
WHERE status IN ('pending', 'processing') AND timeout_at < NOW()

UNION ALL

SELECT
  'Old Completed Requests (>24h)',
  COUNT(*)
FROM active_trace_requests
WHERE status IN ('completed', 'failed', 'timeout')
AND completed_at < NOW() - INTERVAL '24 hours';

-- ============================================
-- CLEANUP COMMANDS (Run if needed)
-- ============================================

-- Release expired locks
-- SELECT release_expired_ip_locks();

-- Cleanup timed-out requests
-- SELECT cleanup_timed_out_requests();

-- Record current statistics
-- SELECT record_pool_statistics();

-- Reset unhealthy IPs (use with caution)
-- UPDATE ip_rotation_pool
-- SET is_healthy = true, consecutive_failures = 0
-- WHERE is_healthy = false;

-- Archive old completed requests (optional)
-- DELETE FROM active_trace_requests
-- WHERE status IN ('completed', 'failed', 'timeout')
-- AND completed_at < NOW() - INTERVAL '7 days';
