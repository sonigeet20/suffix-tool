# HTTP-First Trace Pool System

## Overview

The HTTP-First Trace Pool System provides instant HTTP responses to Google Ads clicks while processing URL traces asynchronously in the background. This architecture eliminates the bottleneck of synchronous trace waiting and enables true parallel processing with dedicated IP addresses.

## Architecture

### 1. HTTP-First Entry Point

**Edge Function:** `track-hit-instant`

**Flow:**
1. User clicks Google Ad → Instant redirect (< 200ms)
2. Redirect to tracking URL with inbound params (gclid, etc.)
3. Create background trace request in database
4. Fire-and-forget async worker call
5. Return HTTP 302 redirect immediately

**Benefits:**
- Sub-200ms response time guaranteed
- No waiting for trace completion
- No user-facing failures if trace fails
- Google Ads gets instant click confirmation

### 2. Background Trace Processing

**Edge Function:** `trace-worker`

**Flow:**
1. Batch fetch pending trace requests (configurable size)
2. Process requests concurrently (configurable parallelism)
3. Each request gets dedicated IP from pool
4. Intelligent tracer executes (HTTP-only or Browser)
5. Results stored in database for analytics
6. IP released back to pool with cooldown

**Benefits:**
- Unlimited parallelism (scales with IP pool size)
- Resilient to individual failures
- Automatic retry logic
- Detailed error tracking

### 3. IP Rotation Pool

**Database:** `ip_rotation_pool` table

**Features:**
- Over-provisioned IP pool (2-3x peak concurrency)
- Optimistic locking (< 100ms lock acquisition)
- Automatic cooldown periods (60s default)
- Health tracking per IP
- Country-specific pools (80% USA, 20% other)

**Status States:**
- `available`: Ready to use
- `locked`: Currently in use by a trace
- `cooldown`: Recently used, waiting for cooldown
- `failed`: Marked unhealthy after consecutive failures

### 4. Intelligent Tracer Integration

**Edge Function:** `intelligent-tracer` (existing)

**Modes:**
- **HTTP-Only:** Fast redirect following (2-5 seconds)
- **Browser:** Full JavaScript rendering (10-30 seconds)
- **Auto:** Try HTTP-only first, fallback to browser

**Selection Logic:**
1. Try HTTP-only trace first (5 second timeout)
2. If no redirects detected → use Browser
3. If JavaScript framework detected → use Browser
4. If parameters missing → use Browser
5. Otherwise → HTTP-only sufficient

## Database Schema

### `active_trace_requests`
Tracks all in-flight trace requests.

```sql
request_id         | uuid (primary key)
offer_id           | uuid (foreign key)
tracking_url       | text
target_country     | text
inbound_params     | jsonb
status             | enum (pending, processing, completed, failed, timeout)
ip_assigned        | text (foreign key to ip_rotation_pool)
final_url          | text
extracted_params   | jsonb
redirect_chain     | jsonb
error_message      | text
retry_count        | integer
started_at         | timestamptz
completed_at       | timestamptz
timeout_at         | timestamptz
trace_time_ms      | integer
tracer_mode_used   | text (http_only, browser)
detection_reason   | text
```

### `ip_rotation_pool`
Manages available proxy IPs.

```sql
id                    | uuid (primary key)
ip_address            | text (unique)
ip_port               | text (default '7000')
country               | text (default 'us')
provider              | text (luna, other)
status                | enum (available, locked, cooldown, failed)
locked_until          | timestamptz
locked_by_request     | uuid
last_used_at          | timestamptz
total_uses            | bigint
success_count         | bigint
failure_count         | bigint
avg_response_time_ms  | integer
is_healthy            | boolean
consecutive_failures  | integer
```

### `ip_pool_statistics`
Historical metrics for monitoring.

```sql
recorded_at               | timestamptz
total_ips                 | integer
available_ips             | integer
locked_ips                | integer
cooldown_ips              | integer
active_requests           | integer
avg_wait_time_ms          | integer
pool_utilization_percent  | integer
```

## Key Functions

### `lock_available_ip(country, request_id, duration)`
Atomically locks an available IP for a trace request.
- Uses optimistic locking (FOR UPDATE SKIP LOCKED)
- Selects least-recently-used healthy IP
- Returns NULL if no IP available
- Sub-100ms execution time

### `release_ip(ip_address, success, response_time_ms)`
Releases an IP back to the pool.
- Applies 60-second cooldown period
- Updates health metrics
- Marks unhealthy after 5 consecutive failures
- Tracks average response time

### `release_expired_ip_locks()`
Cleanup function for expired locks.
- Releases IPs where locked_until < now()
- Called automatically by worker
- Prevents IP pool exhaustion

### `cleanup_timed_out_requests()`
Marks timed-out requests as failed.
- Finds requests where timeout_at < now()
- Releases their IPs
- Called automatically by worker

## Edge Functions

### `track-hit-instant`
**URL:** `https://[project].supabase.co/functions/v1/track-hit-instant?offer=myoffer&gclid=123`

**Purpose:** HTTP-first entry point for Google Ads clicks

**Response Time:** < 200ms guaranteed

**Returns:** HTTP 302 redirect to tracking URL

### `trace-worker`
**URL:** `https://[project].supabase.co/functions/v1/trace-worker`

**Purpose:** Background batch processor for pending traces

**Request Body:**
```json
{
  "batch_size": 10,
  "max_concurrent": 5
}
```

**Response:**
```json
{
  "success": true,
  "processed": 10,
  "succeeded": 9,
  "failed": 1,
  "errors": ["request-id: error message"]
}
```

### `process-trace-parallel`
**URL:** `https://[project].supabase.co/functions/v1/process-trace-parallel`

**Purpose:** Process a single trace request with IP pool

**Request Body:**
```json
{
  "request_id": "uuid",
  "offer_id": "uuid",
  "tracking_url": "https://...",
  "target_country": "us",
  "inbound_params": {"gclid": "123"},
  "referrer": "https://..."
}
```

**Flow:**
1. Lock available IP from pool
2. Get offer settings and AWS proxy URL
3. Call intelligent-tracer with locked IP
4. Store results in database
5. Release IP back to pool

### `pool-monitor`
**URL:** `https://[project].supabase.co/functions/v1/pool-monitor`

**Purpose:** Real-time health monitoring and diagnostics

**Response:**
```json
{
  "timestamp": "2025-12-19T...",
  "pool_summary": {
    "us": {
      "total": 100,
      "available": 75,
      "locked": 15,
      "cooldown": 10,
      "healthy": 98,
      "unhealthy": 2
    }
  },
  "active_requests": {
    "total": 15,
    "pending": 5,
    "processing": 10,
    "by_country": {"us": 12, "ca": 3}
  },
  "performance": {
    "completed_last_5min": 50,
    "avg_trace_time_ms": 3500,
    "http_only_count": 45,
    "browser_count": 5
  },
  "health": {
    "pool_utilization_percent": 25,
    "available_ips": 75,
    "queue_depth": 5,
    "success_rate_5min": 98
  },
  "warnings": [],
  "recommendation": "System operating normally"
}
```

## Scheduling the Worker

### Option 1: Cron (Recommended for Production)

```bash
# Run every 2 minutes for high-frequency processing
*/2 * * * * cd /path/to/project && ./scripts/trigger-worker.sh 20 10

# Check health every 10 minutes
*/10 * * * * cd /path/to/project && ./scripts/check-pool-health.sh
```

### Option 2: GitHub Actions (CI/CD)

```yaml
name: Trace Worker
on:
  schedule:
    - cron: '*/2 * * * *'  # Every 2 minutes
  workflow_dispatch:

jobs:
  run-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Trigger Worker
        run: |
          curl -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/trace-worker" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -d '{"batch_size": 20, "max_concurrent": 10}'
```

### Option 3: Supabase pg_cron (Database-level)

```sql
-- Schedule worker to run every 2 minutes
SELECT cron.schedule(
  'trace-worker',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := '[SUPABASE_URL]/functions/v1/trace-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [SUPABASE_ANON_KEY]'
    ),
    body := jsonb_build_object(
      'batch_size', 20,
      'max_concurrent', 10
    )
  );
  $$
);
```

## Performance Targets

### HTTP-First Entry Point
- **Target:** < 200ms response time
- **Includes:** Database writes, async worker spawn, redirect
- **SLA:** 99.9% under 500ms

### Background Worker
- **Throughput:** 50-100 traces per minute (with 100 IPs)
- **Concurrency:** Limited by IP pool size
- **Retry:** Up to 2 retries per request
- **Timeout:** 90 seconds per trace

### IP Pool Utilization
- **Target:** 60-80% utilization during peak
- **Over-provisioning:** 2-3x peak concurrent requests
- **Cooldown:** 60 seconds between uses

### Intelligent Tracer
- **HTTP-Only:** 2-5 seconds average
- **Browser:** 10-30 seconds average
- **Auto Detection:** 80% HTTP-only success rate

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Pool Utilization**
   - Alert if > 80% for > 5 minutes
   - Action: Add more IPs to pool

2. **Queue Depth**
   - Alert if > 20 pending requests
   - Action: Increase worker frequency

3. **Success Rate**
   - Alert if < 90% over 5 minutes
   - Action: Check AWS proxy health

4. **Unhealthy IPs**
   - Alert if > 10% of pool unhealthy
   - Action: Review IP provider status

5. **Average Trace Time**
   - Alert if > 10 seconds average
   - Action: Check AWS proxy performance

### Health Check Script

```bash
# Run this script periodically
./scripts/check-pool-health.sh

# Returns exit code 0 if healthy, 1 if warnings
```

### Manual Monitoring

```bash
# Check pool status
curl https://[project].supabase.co/functions/v1/pool-monitor

# Trigger worker manually
./scripts/trigger-worker.sh 10 5

# View recent traces
psql $DATABASE_URL -c "
  SELECT request_id, status, trace_time_ms, tracer_mode_used
  FROM active_trace_requests
  WHERE started_at > NOW() - INTERVAL '5 minutes'
  ORDER BY started_at DESC
  LIMIT 20;
"
```

## IP Pool Management

### Adding IPs to Pool

```sql
-- Add USA residential IPs (Luna provider)
INSERT INTO ip_rotation_pool (ip_address, ip_port, country, provider)
VALUES
  ('user-12345678', '7000', 'us', 'luna'),
  ('user-23456789', '7000', 'us', 'luna'),
  ('user-34567890', '7000', 'us', 'luna');

-- Add country-specific IPs
INSERT INTO ip_rotation_pool (ip_address, ip_port, country, provider)
VALUES
  ('user-canada1', '7000', 'ca', 'luna'),
  ('user-uk1', '7000', 'gb', 'luna');
```

### Removing Unhealthy IPs

```sql
-- Find consistently failing IPs
SELECT ip_address, consecutive_failures, success_count, failure_count
FROM ip_rotation_pool
WHERE is_healthy = false
ORDER BY consecutive_failures DESC;

-- Remove permanently failed IPs
DELETE FROM ip_rotation_pool
WHERE consecutive_failures > 10
  AND (success_count::float / NULLIF(total_uses, 0)) < 0.5;
```

### Pool Provisioning Guidelines

**Target Pool Size:**
- Identify peak concurrent requests (e.g., 50)
- Multiply by 2-3x for over-provisioning (100-150 IPs)
- Add 20% buffer for cooldown rotation (120-180 IPs)

**Country Distribution:**
- 80% USA IPs (if primary market)
- 20% other countries (distributed by target markets)

**Example for 50 peak requests:**
- 120 USA IPs
- 15 Canada IPs
- 10 UK IPs
- 10 Australia IPs
- 5 other countries
- **Total: 160 IPs**

## Troubleshooting

### "No available IP" errors
**Symptom:** Requests failing with "No available IP in pool"

**Causes:**
1. Pool utilization at 100%
2. Too many IPs in cooldown
3. Many unhealthy IPs

**Solutions:**
1. Add more IPs to pool
2. Reduce cooldown period (if safe)
3. Remove unhealthy IPs and replace
4. Increase worker frequency

### High queue depth
**Symptom:** Many requests stuck in "pending" status

**Causes:**
1. Worker not running frequently enough
2. IP pool exhausted
3. High failure rate causing retries

**Solutions:**
1. Increase worker frequency (cron schedule)
2. Add more IPs to pool
3. Check AWS proxy service health
4. Review error logs for patterns

### Slow trace times
**Symptom:** avg_trace_time_ms > 10 seconds

**Causes:**
1. AWS proxy service slow
2. Browser mode being used too often
3. Network issues

**Solutions:**
1. Check AWS EC2 proxy service
2. Review tracer mode detection logic
3. Optimize proxy service (see proxy-service docs)

### IP pool exhaustion
**Symptom:** Most IPs in "cooldown" or "locked" status

**Causes:**
1. Insufficient over-provisioning
2. Traffic spike
3. Cooldown period too long
4. Stuck locks not being released

**Solutions:**
1. Add more IPs immediately
2. Run cleanup functions manually
3. Reduce cooldown period temporarily
4. Check for hung trace requests

## Best Practices

1. **Over-Provision IPs:** Always maintain 2-3x peak capacity
2. **Monitor Continuously:** Run health checks every 5-10 minutes
3. **Schedule Worker Frequently:** Every 1-2 minutes for responsiveness
4. **Set Up Alerts:** Integrate with monitoring systems (PagerDuty, etc.)
5. **Regular Cleanup:** Archive old completed traces (> 7 days)
6. **Review Metrics Weekly:** Look for trends in failure rates, trace times
7. **Test During Off-Peak:** Validate changes when traffic is low
8. **Document IP Sources:** Keep track of where IPs come from
9. **Rotate Credentials:** Update proxy credentials quarterly
10. **Backup Configuration:** Keep IP list backed up externally

## Migration from Old System

If migrating from the old synchronous `track-hit` function:

1. **Parallel Operation:**
   - Keep old `track-hit` function active
   - Deploy new `track-hit-instant` function
   - Test with new offers using new endpoint

2. **Gradual Migration:**
   - Move low-volume offers first
   - Monitor for 24-48 hours
   - Migrate high-volume offers last

3. **Update Offer URLs:**
   ```
   Old: https://[project].supabase.co/functions/v1/track-hit?offer=test
   New: https://[project].supabase.co/functions/v1/track-hit-instant?offer=test
   ```

4. **Provision IP Pool:**
   - Start with 50 IPs for testing
   - Scale to 2-3x peak after validation
   - Monitor utilization for 1 week

5. **Schedule Worker:**
   - Start with 5-minute intervals
   - Reduce to 2 minutes after validation
   - Consider 1 minute for high-volume

6. **Decommission Old System:**
   - Wait 30 days with no traffic
   - Archive old `track-hit` function
   - Keep migration documentation

## Support & Resources

- **IP Pool Status:** `https://[project].supabase.co/functions/v1/pool-monitor`
- **Trigger Worker:** `./scripts/trigger-worker.sh [batch_size] [max_concurrent]`
- **Health Check:** `./scripts/check-pool-health.sh`
- **Database Queries:** See `scripts/` directory for SQL examples
- **AWS Proxy Service:** See `proxy-service/` directory for setup
