# Quick Start: Fresh User Agents Per Trace

## TL;DR

Your tracer now gets a **fresh user agent per trace** with optional session stickiness.

```bash
# Each request = new UA
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Same session = same UA for 24h
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com", "session_id":"my-client"}'
```

## What Changed

| Before | Now |
|--------|-----|
| UA rotation every 12h | **Fresh UA per trace** |
| Single global pool | **Hybrid: remote feed + local fallback** |
| No session tracking | **Optional session stickiness** (24h TTL) |
| Basic stats | **Detailed feed health, validation, session metrics** |
| No admin control | **Force refresh & emergency fallback endpoints** |

## How It Works

```
Per-Trace Request
    ↓
1. Check for session_id in request
    ↓
2. If session_id exists:
   → Return cached UA for session (if not expired)
   → Create new entry if session is new
    ↓
3. If no session_id:
   → Return random UA from pool
    ↓
4. Pool sources (in order):
   → Remote feed (hourly refresh, ~1500 UAs)
   → Local fallback (200 UAs, always available)
   → Dynamic generation (infinite, fresh per request)
```

## Default Behavior

**Without Remote Feed URL:**
- Uses local generated pool (10,000 UAs)
- Refreshes locally every 12 hours
- Sessions remain sticky for 24h
- Falls back to fresh generation if needed

**With Remote Feed URL:**
- Fetches fresh pool hourly from your feed
- Falls back to local pool if feed unavailable
- Better freshness (UAs <1h old on average)

## Configuration (All Optional)

No config needed—works out of the box!

If you have a UA feed service:
```bash
export UA_FEED_URL="https://your-service/ua-pool.json"
export UA_ADMIN_KEY="your-secret-key"  # For admin endpoints
```

## Check Your Setup

```bash
# See all stats: mode, pool size, feed health, validation, sessions
curl http://localhost:3000/user-agent-stats

# Expected output:
# {
#   "mode": "hybrid-remote-first",
#   "poolSize": 10000,
#   "remotePool": {
#     "healthy": false,  # if no feed configured
#     "size": 0
#   },
#   "localFallback": {
#     "poolSize": 10000,
#     "available": true
#   },
#   "sessionStickiness": {
#     "activeSessions": 0,
#     "sessionHitRate": "0%"
#   },
#   ...
# }
```

## Using Sessions

**Scenario 1: Each request = new UA** (default)
```bash
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.example.com/page1"}'

# Different request = different UA
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.example.com/page2"}'
```

**Scenario 2: Multi-request session = same UA**
```bash
# Request 1: session_id = "user-123"
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://api.example.com/login",
    "session_id":"user-123"
  }'
# Response: user_agent = "Mozilla/5.0 ...Chrome/132...", session_id = "user-123"

# Request 2: same session_id
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://api.example.com/profile",
    "session_id":"user-123"
  }'
# Response: user_agent = "Mozilla/5.0 ...Chrome/132..." (SAME!)

# Request 3: different session = different UA
curl -X POST http://localhost:3000/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://api.example.com/other",
    "session_id":"user-456"
  }'
# Response: user_agent = "Mozilla/5.0 ...Safari/..." (NEW!)
```

## Admin Commands

**Force refresh now** (instead of waiting 1 hour):
```bash
curl -X POST http://localhost:3000/ua-admin/force-refresh \
  -H "x-admin-key: your-secret-key"
```

**Emergency: fallback to local only** (if feed is down):
```bash
curl -X POST http://localhost:3000/ua-admin/fallback-local \
  -H "x-admin-key: your-secret-key"
```

**Debug: see pool sample & validation stats:**
```bash
curl http://localhost:3000/ua-debug/pool-sample \
  -H "x-admin-key: your-secret-key"
```

## FAQ

**Q: How fresh are the user agents?**
- Local: Generated at startup + periodic refresh (default 12h)
- Remote feed: Updated hourly (you control freshness)
- Dynamic: Always brand new

**Q: Will this slow down my traces?**
- No. Session lookup: <5ms. Remote fetch: background only.

**Q: What if the remote feed goes down?**
- Automatically falls back to local pool.
- If down for 2+ hours, switches to local-only mode.
- Logs alert for ops.

**Q: Should I use session IDs?**
- Use them if your client makes multiple requests.
- Skip them if each request is independent.
- Sessions last 24 hours.

**Q: Can I bring back remote mode if it failed?**
- Yes: Call `POST /ua-admin/force-refresh` once feed is back.

**Q: How many concurrent sessions can I have?**
- Up to 10,000 active sessions (LRU map).
- Old sessions auto-expire after 24 hours.

## Summary

✅ Fresh UA every trace (or per session)  
✅ Works without external feed (uses local generation)  
✅ Optional remote feed for maximum freshness  
✅ Session stickiness for multi-request flows  
✅ Detailed stats for monitoring  
✅ Admin endpoints for control  
✅ Zero performance impact on trace requests

**Start using it now—no config required!**
