# User Agent Rotation & Freshness Setup

## Overview
The tracer now uses a **hybrid remote-first** strategy for user agent rotation:
- **Primary**: Remote UA feed (hourly refresh, 500+ curated recent UAs)
- **Fallback**: Local generation (survives feed outages)
- **Session stickiness**: Same UA per session; new UA per session
- **Per-trace freshness**: Each `/trace` call gets a new UA (or cached session UA)

## Environment Configuration

### Remote Feed Setup (Optional but Recommended)
```bash
# URL to your remote UA feed (JSON array of UA strings)
export UA_FEED_URL="https://your-service.com/ua-pool.json"

# Optional: auth header for feed service
export UA_FEED_AUTH_HEADER="Bearer your-token-here"

# Minimum valid UAs in feed (default 50)
export UA_FEED_MIN_COUNT="100"

# Refresh interval in hours (default 1 = hourly)
export USER_AGENT_REFRESH_INTERVAL_HOURS="1"

# Admin key for force-refresh and debug endpoints
export UA_ADMIN_KEY="your-secret-admin-key"
```

### Default Mode
```bash
# Default is now 'hybrid-remote-first'
export USER_AGENT_MODE="hybrid-remote-first"
# Options: dynamic, pool, hybrid, hybrid-remote-first
```

## How It Works

### Per-Trace UA Assignment
Each `/trace` request gets a fresh user agent:

```bash
# New UA per trace (no session)
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Same UA per session (session-stickiness)
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://example.com",
    "session_id":"my-client-session-123"
  }'
```

### Session Stickiness
- **Without `session_id`**: New random UA per request
- **With `session_id`**: Same UA for 24 hours (or until session expires)
- **Use case**: Maintain UA cohesion within a client session; rotate between sessions

### Trace Response
```json
{
  "success": true,
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "session_id": "my-client-session-123",
  "chain": [...],
  ...
}
```

## Monitoring & Stats

### Check UA Rotation Health
```bash
curl http://localhost:3000/user-agent-stats
```

**Output includes:**
- `mode`: Current rotation mode
- `poolSize`: Active pool size
- `remotePool`: Feed status (healthy, size, last fetch time, failures)
- `localFallback`: Backup pool status
- `validation`: Accepted/rejected UAs and rejection reasons
- `sessionStickiness`: Active sessions, hit rate, TTL
- `repetitionRate`: How often UAs are repeated (lower = better)

### Example Stats Response
```json
{
  "mode": "hybrid-remote-first",
  "poolSize": 1500,
  "remotePool": {
    "size": 1500,
    "healthy": true,
    "lastFetchTime": "2025-01-15T10:30:00Z",
    "lastSuccessTime": "2025-01-15T10:30:00Z",
    "cacheAgeMinutes": 15,
    "failureCount": 0
  },
  "localFallback": {
    "poolSize": 200,
    "available": true
  },
  "validation": {
    "totalChecked": 1600,
    "accepted": 1500,
    "rejected": 100,
    "rejectionReasons": {
      "format_invalid": 80,
      "deprecated_os_version": 20
    }
  },
  "sessionStickiness": {
    "activeSessions": 234,
    "sessionHitRate": "78%",
    "sessionTTLHours": 24,
    "maxSessions": 10000
  },
  "repetitionRate": "0.27%"
}
```

## Admin Endpoints

### Force Immediate Remote Refresh
Trigger UA pool refresh from remote feed right now:

```bash
curl -X POST http://localhost:3000/ua-admin/force-refresh \
  -H "x-admin-key: your-secret-admin-key"
```

**Response:**
```json
{
  "success": true,
  "message": "Pool refreshed and swapped",
  "poolSize": 1500,
  "stats": { ... }
}
```

### Fallback to Local-Only Mode
Emergency: disable remote feed and use local generation only:

```bash
curl -X POST http://localhost:3000/ua-admin/fallback-local \
  -H "x-admin-key: your-secret-admin-key"
```

### Debug: Pool Sample & Validation Log
View first 20 UAs and validation statistics:

```bash
curl http://localhost:3000/ua-debug/pool-sample \
  -H "x-admin-key: your-secret-admin-key"
```

## Remote UA Feed Format

If you provide your own remote feed, it should return a JSON array of UA strings:

```json
[
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  ...
]
```

Or with metadata:
```json
[
  {
    "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
    "browser": "Chrome 132",
    "os": "Windows 10",
    "device": "desktop"
  },
  ...
]
```

## Fallback Behavior

**Remote feed unreachable?** The system automatically:
1. Logs warning after first failure
2. Retries with exponential backoff (5s, 10s, 20s)
3. Falls back to local pool after 3 failed attempts (or 2+ hours)
4. Logs alert for ops to investigate
5. Returns to remote-first once feed recovers

**Local pool empty?** Uses dynamic generation (fresh UA per request)

## Performance & Load Impact

- **Per-trace overhead**: <5ms (session map lookup)
- **Remote fetch**: ~500ms every hour (background, non-blocking)
- **Pool validation**: <1s per 1500 UAs
- **Session map memory**: ~1 MB per 10,000 active sessions

## Troubleshooting

### Pool keeps failing validation
- Check remote feed format (must be JSON array of strings)
- Verify all UAs match `Mozilla/5.0` format
- Check rejection reasons in `/user-agent-stats`

### High repetition rate
- Increase pool size (default 10k)
- Lower refresh interval (default 1h)
- Ensure session IDs are passed for multi-request flows

### Session stickiness not working
- Verify `session_id` is passed in trace request
- Check `sessionStickiness.sessionHitRate` in stats
- Sessions expire after 24 hours by default

### Remote feed not updating
- Check `remotePool.lastFetchTime` and `lastSuccessTime`
- Check failure count and reasons in stats
- Use `/ua-admin/force-refresh` to trigger manual refresh
- Verify `UA_FEED_URL` env var is set correctly

## Summary

✅ **Fresh UAs**: Per trace or per session  
✅ **Always available**: Remote + local fallback  
✅ **Observable**: Detailed stats endpoint  
✅ **Resilient**: Automatic fallback on feed failure  
✅ **Flexible**: Session stickiness optional via `session_id`  
✅ **Safe**: Validation rules, atomic swaps, no request blocking
