# Quick Start: HTTP-First Trace Pool System

Get up and running with the HTTP-First Trace Pool in 5 minutes.

## Prerequisites

- Supabase project with database migrations applied
- AWS EC2 proxy service deployed and configured
- Luna Proxy residential IPs provisioned

## Step 1: Provision IP Pool (2 minutes)

Add at least 10 IPs to get started (scale to 50-100+ for production):

```sql
-- Connect to your Supabase database
-- Run this SQL to add 10 USA residential IPs

INSERT INTO ip_rotation_pool (ip_address, ip_port, country, provider)
VALUES
  ('user-ip1', '7000', 'us', 'luna'),
  ('user-ip2', '7000', 'us', 'luna'),
  ('user-ip3', '7000', 'us', 'luna'),
  ('user-ip4', '7000', 'us', 'luna'),
  ('user-ip5', '7000', 'us', 'luna'),
  ('user-ip6', '7000', 'us', 'luna'),
  ('user-ip7', '7000', 'us', 'luna'),
  ('user-ip8', '7000', 'us', 'luna'),
  ('user-ip9', '7000', 'us', 'luna'),
  ('user-ip10', '7000', 'us', 'luna');
```

Replace `user-ip1`, `user-ip2`, etc. with your actual Luna Proxy IP addresses.

## Step 2: Verify Edge Functions (30 seconds)

All edge functions should already be deployed. Verify they're active:

```bash
# Check if functions are deployed
curl https://[your-project].supabase.co/functions/v1/track-hit-instant
# Should return 400 with "offer parameter is required"

curl https://[your-project].supabase.co/functions/v1/pool-monitor
# Should return JSON with pool status
```

## Step 3: Update Offer URL (30 seconds)

Change your Google Ads click tracking URL from:

```
https://[project].supabase.co/functions/v1/track-hit?offer=myoffer&gclid={gclid}
```

To:

```
https://[project].supabase.co/functions/v1/track-hit-instant?offer=myoffer&gclid={gclid}
```

That's it! The new endpoint returns instantly while processing traces in the background.

## Step 4: Schedule Background Worker (1 minute)

### Option A: Manual Testing (Start Here)

Trigger the worker manually to process any pending traces:

```bash
cd /path/to/your/project
chmod +x scripts/trigger-worker.sh
./scripts/trigger-worker.sh 10 5
```

This processes up to 10 traces with 5 concurrent requests.

### Option B: Automated Scheduling (Production)

Add to your crontab for automatic processing every 2 minutes:

```bash
crontab -e

# Add this line (update the path):
*/2 * * * * cd /path/to/url-tracker && ./scripts/trigger-worker.sh 20 10 >> /var/log/trace-worker.log 2>&1
```

## Step 5: Test the System (1 minute)

1. **Create a test click:**
   ```bash
   curl -L "https://[project].supabase.co/functions/v1/track-hit-instant?offer=myoffer&gclid=test123"
   ```

2. **Verify instant response:**
   - Should redirect immediately (< 200ms)
   - No waiting for trace completion

3. **Check background processing:**
   ```bash
   ./scripts/trigger-worker.sh 10 5
   ```

4. **View results:**
   ```sql
   SELECT request_id, status, trace_time_ms, tracer_mode_used
   FROM active_trace_requests
   WHERE started_at > NOW() - INTERVAL '5 minutes'
   ORDER BY started_at DESC;
   ```

## Step 6: Monitor Health

Check system health anytime:

```bash
./scripts/check-pool-health.sh
```

Or view detailed metrics:

```bash
curl https://[project].supabase.co/functions/v1/pool-monitor | jq '.'
```

## Scaling for Production

Once you validate the system works:

1. **Scale IP Pool:**
   - Calculate: Peak concurrent clicks × 2.5 = target IP count
   - Example: 50 peak clicks → 125 IPs
   - Add IPs using the SQL from Step 1

2. **Increase Worker Frequency:**
   - Start: Every 2 minutes
   - Medium volume: Every 1 minute
   - High volume: Every 30 seconds

3. **Set Up Monitoring:**
   - Schedule health checks every 10 minutes
   - Configure alerts for pool utilization > 80%
   - Monitor queue depth and success rates

4. **Geographic Distribution:**
   - 80% USA IPs (if USA is primary market)
   - 20% distributed across other target countries

## Troubleshooting

### "No available IP" errors

**Problem:** Pool exhausted, all IPs locked or in cooldown

**Solution:**
```bash
# 1. Check pool status
curl https://[project].supabase.co/functions/v1/pool-monitor | jq '.pool_summary'

# 2. Add more IPs (see Step 1)

# 3. Force cleanup of expired locks
psql $DATABASE_URL -c "SELECT release_expired_ip_locks();"
```

### Traces stuck in "pending"

**Problem:** Worker not running or not running frequently enough

**Solution:**
```bash
# Trigger worker manually
./scripts/trigger-worker.sh 20 10

# Check if cron is running
crontab -l | grep trigger-worker
```

### High failure rates

**Problem:** AWS proxy service issues or IP quality problems

**Solution:**
```bash
# 1. Check AWS proxy health
curl http://[aws-proxy-ip]:3000/health

# 2. Test individual IPs
# Check ip_rotation_pool for unhealthy IPs
psql $DATABASE_URL -c "
  SELECT ip_address, consecutive_failures, is_healthy
  FROM ip_rotation_pool
  WHERE is_healthy = false;
"

# 3. Remove bad IPs
psql $DATABASE_URL -c "
  DELETE FROM ip_rotation_pool
  WHERE consecutive_failures > 10;
"
```

## Next Steps

- Read [HTTP-FIRST-TRACE-POOL.md](./HTTP-FIRST-TRACE-POOL.md) for complete documentation
- Review [PARALLEL-TRACING-GUIDE.md](./PARALLEL-TRACING-GUIDE.md) for architecture details
- Check [proxy-service/](./proxy-service/) for AWS proxy optimization
- Set up automated monitoring and alerts

## Key URLs to Bookmark

- **Pool Monitor:** `https://[project].supabase.co/functions/v1/pool-monitor`
- **New Entry Point:** `https://[project].supabase.co/functions/v1/track-hit-instant`
- **Worker Trigger:** `./scripts/trigger-worker.sh`
- **Health Check:** `./scripts/check-pool-health.sh`

## Support

If you encounter issues:

1. Check pool monitor for warnings
2. Review recent trace requests in database
3. Verify AWS proxy service is healthy
4. Check worker logs for errors
5. Ensure IP pool has available IPs

The system is designed to be resilient - even if traces fail, users always get instant redirects!
