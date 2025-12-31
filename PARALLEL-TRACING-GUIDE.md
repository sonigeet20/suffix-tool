# Parallel Tracing with IP Pool Over-Provisioning

## Overview

This system handles **real-time Google Ad clicks** with parallel trace processing. Each click gets a dedicated IP address from a pre-provisioned pool, enabling simultaneous tracing of multiple offers without conflicts or rate limiting.

## Architecture

```
Google Ad Click → track-hit → Create Trace Request → Spawn Parallel Worker
                                                    ↓
                                        Lock Available IP from Pool
                                                    ↓
                                        Trace with Dedicated IP (60-90s)
                                                    ↓
                                        Extract Params → Release IP → Redirect User
```

## Key Features

1. **Over-Provisioned IP Pool**: 100+ IPs ready for immediate use
2. **Optimistic Locking**: Sub-100ms IP acquisition with no blocking
3. **Automatic Cooldowns**: 60-second cooldown between IP uses
4. **Health Monitoring**: Failed IPs automatically marked unhealthy
5. **Graceful Fallbacks**: Timeout handling with default redirects
6. **Real-Time Stats**: Pool utilization and performance metrics

## Database Tables

### `ip_rotation_pool`
Manages the pool of available proxy IPs:
- `ip_address`: The proxy IP (from Luna or other provider)
- `ip_port`: Proxy port (default: 7000)
- `country`: Target country for geo-targeting (us, uk, ca, etc.)
- `status`: Current state (available, locked, cooldown, failed)
- `locked_until`: Expiration time for locks/cooldowns
- `is_healthy`: Health status based on consecutive failures

### `active_trace_requests`
Tracks currently processing traces:
- `request_id`: Unique identifier
- `offer_id`: Associated offer
- `tracking_url`: URL being traced
- `ip_assigned`: Which IP is locked for this request
- `status`: pending → processing → completed/failed/timeout
- `extracted_params`: Final URL parameters

### `ip_pool_statistics`
Historical metrics for monitoring:
- Pool utilization percentages
- Active request counts
- Success/failure rates
- Average response times

## Provisioning IPs

### Option 1: Manual Provisioning (for testing)

```sql
-- Add 10 USA IPs
INSERT INTO ip_rotation_pool (ip_address, ip_port, country, provider)
SELECT
  '185.199.228.' || generate_series(1, 10),
  '7000',
  'us',
  'luna';

-- Add 5 UK IPs
INSERT INTO ip_rotation_pool (ip_address, ip_port, country, provider)
SELECT
  '185.199.229.' || generate_series(1, 5),
  '7000',
  'uk',
  'luna';
```

### Option 2: Bulk Import from Luna API

Create a script to fetch your Luna residential proxy IPs:

```javascript
// provision-ips.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function provisionIPs() {
  // Luna provides rotating residential IPs
  // Each request to the proxy uses a different IP from their pool
  // We'll create "virtual" IPs representing Luna proxy endpoints

  const countries = ['us', 'uk', 'ca', 'au', 'de'];
  const ipsPerCountry = 30; // 30 concurrent traces per country

  for (const country of countries) {
    const ips = [];
    for (let i = 1; i <= ipsPerCountry; i++) {
      ips.push({
        ip_address: `luna-${country}-${i}`,
        ip_port: '7000',
        country: country,
        provider: 'luna',
      });
    }

    const { error } = await supabase
      .from('ip_rotation_pool')
      .insert(ips);

    if (error) {
      console.error(`Failed to provision ${country} IPs:`, error);
    } else {
      console.log(`✅ Provisioned ${ipsPerCountry} IPs for ${country}`);
    }
  }

  console.log('🎉 IP provisioning complete!');
}

provisionIPs();
```

### Recommended Pool Sizes

Based on expected concurrent traffic:

- **Low Traffic** (0-10 concurrent): 20-30 IPs total
- **Medium Traffic** (10-50 concurrent): 100-150 IPs total
- **High Traffic** (50-200 concurrent): 300-500 IPs total
- **Distribution**: 60% USA, 20% UK, 20% other countries

## How It Works

### 1. Google Ad Click Arrives

```
User clicks ad → https://your-domain.com/functions/v1/track-hit?offer=summer-sale&gclid=abc123
```

### 2. Track-Hit Creates Trace Request

```typescript
// Creates pending request in active_trace_requests
const traceRequest = {
  offer_id: offer.id,
  tracking_url: offer.final_url,
  target_country: 'us',
  inbound_params: { gclid: 'abc123' },
  status: 'pending'
};
```

### 3. Parallel Worker Spawned

```typescript
// Async, non-blocking call to process-trace-parallel
fetch('/functions/v1/process-trace-parallel', {
  method: 'POST',
  body: JSON.stringify(traceRequest)
});
```

### 4. IP Locked from Pool

```sql
-- Atomic operation using optimistic locking
UPDATE ip_rotation_pool
SET
  status = 'locked',
  locked_by_request = 'abc-123',
  locked_until = now() + INTERVAL '90 seconds'
WHERE id = (
  SELECT id FROM ip_rotation_pool
  WHERE status = 'available' AND country = 'us'
  ORDER BY last_used_at ASC NULLS FIRST
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING ip_address;
```

### 5. Trace Executed

```typescript
// Call AWS proxy service with dedicated IP
const result = await fetch(`${AWS_PROXY_URL}/trace`, {
  method: 'POST',
  body: JSON.stringify({
    url: trackingUrl,
    proxy_ip: lockedIP,
    target_country: 'us'
  })
});
```

### 6. IP Released with Cooldown

```sql
-- 60-second cooldown before IP can be reused
UPDATE ip_rotation_pool
SET
  status = 'cooldown',
  locked_until = now() + INTERVAL '60 seconds',
  success_count = success_count + 1
WHERE ip_address = lockedIP;
```

### 7. User Redirected

```typescript
// User redirected to final URL with extracted params
const finalUrl = new URL(traceResult.final_url);
finalUrl.searchParams.set('gclid', 'abc123');
// Redirect user (they waited ~5-10 seconds)
```

## Timeout Handling

If trace doesn't complete within 10 seconds:

1. **Fallback Redirect**: User sent to tracking URL with inbound params
2. **Background Processing**: Trace continues in background
3. **Stats Updated**: Hit still counted for analytics

## Monitoring

### Real-Time Pool Status

```sql
SELECT
  status,
  COUNT(*) as count,
  country
FROM ip_rotation_pool
WHERE is_healthy = true
GROUP BY status, country
ORDER BY country, status;
```

### Active Traces

```sql
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (now() - started_at))) as avg_duration_seconds
FROM active_trace_requests
WHERE started_at > now() - INTERVAL '5 minutes'
GROUP BY status;
```

### Pool Utilization

```sql
SELECT
  total_ips,
  available_ips,
  locked_ips,
  pool_utilization_percent,
  active_requests
FROM ip_pool_statistics
ORDER BY recorded_at DESC
LIMIT 1;
```

## Maintenance

### Automatic Maintenance (Every Minute)

Call the maintenance edge function via cron or manually:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/ip-pool-maintenance
```

This performs:
1. Releases expired IP locks
2. Cleans up timed-out requests
3. Records pool statistics
4. Reports unhealthy IPs

### Manual IP Health Reset

```sql
-- Reset unhealthy IPs after fixing issues
UPDATE ip_rotation_pool
SET
  is_healthy = true,
  consecutive_failures = 0,
  status = 'available'
WHERE is_healthy = false;
```

## Testing

### 1. Provision Test IPs

```sql
INSERT INTO ip_rotation_pool (ip_address, ip_port, country)
VALUES
  ('test-ip-1', '7000', 'us'),
  ('test-ip-2', '7000', 'us'),
  ('test-ip-3', '7000', 'us');
```

### 2. Test Parallel Traces

```bash
# Simulate 5 concurrent clicks
for i in {1..5}; do
  curl "https://your-project.supabase.co/functions/v1/track-hit?offer=test-offer&gclid=test-$i" &
done
wait
```

### 3. Check Results

```sql
-- View recent traces
SELECT
  request_id,
  status,
  ip_assigned,
  trace_time_ms,
  created_at
FROM active_trace_requests
ORDER BY created_at DESC
LIMIT 10;
```

## Performance Targets

- **IP Lock Acquisition**: < 100ms
- **Trace Completion**: 5-15 seconds (depending on redirect chain)
- **User Wait Time**: 5-10 seconds (with fallback at 10s)
- **Pool Utilization**: 50-80% (buffer for traffic spikes)
- **IP Cooldown**: 60 seconds between uses

## Scaling Guidelines

### When to Add More IPs

- Pool utilization consistently > 80%
- Frequent timeout fallbacks (> 10%)
- Active requests frequently exceed available IPs

### When to Add More Countries

- Offers targeting specific regions
- Better geo-targeting performance needed
- Ad networks detecting wrong-country traffic

## Troubleshooting

### "No available IP" errors

**Cause**: All IPs locked or in cooldown
**Solution**:
- Provision more IPs
- Reduce cooldown period (risk detection)
- Check for stuck locks (run maintenance)

### High failure rates

**Cause**: IPs marked unhealthy
**Solution**:
- Check AWS proxy service logs
- Verify Luna credentials
- Reset unhealthy IPs after investigation

### Traces timing out

**Cause**: Slow redirect chains or proxy issues
**Solution**:
- Increase timeout from 10s to 15s
- Check AWS proxy service performance
- Verify network connectivity

## Cost Optimization

### Luna Residential Proxy Costs

- **Per GB**: $3-10/GB depending on plan
- **Average Trace**: 50-200 KB
- **Estimated**: $0.0005-0.002 per trace

### Optimization Strategies

1. **Reuse IPs Aggressively**: Reduce cooldown from 60s to 30s (risk detection)
2. **Country-Specific Pools**: Only provision countries you need
3. **Health-Based Routing**: Prioritize healthy, fast IPs
4. **Batch Processing**: Group low-priority traces (if acceptable)

## Next Steps

1. **Provision IPs**: Start with 50-100 IPs for testing
2. **Configure AWS Proxy**: Ensure proxy service accepts IP parameters
3. **Test with Real Offers**: Run parallel traces with actual offers
4. **Monitor Performance**: Watch pool utilization and timeout rates
5. **Scale Up**: Add more IPs based on traffic patterns
