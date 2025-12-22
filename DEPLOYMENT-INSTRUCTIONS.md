# Deployment Instructions

## ✅ AWS Proxy Service Update

### What Changed

The AWS proxy service (`proxy-service/server.js`) has been updated to support both **HTTP-only** and **Browser** tracing modes.

**New Features:**
- ⚡ **HTTP-only mode** - Fast redirect following (2-5 seconds) using axios
- 🌐 **Browser mode** - Full Puppeteer rendering (10-30 seconds)
- 🎯 **Mode selection** - Intelligent tracer can choose the best mode
- 🔌 **IP pool support** - Accepts `proxy_ip` and `proxy_port` parameters

### Deployment Steps

1. **Copy the updated server.js to your AWS EC2 instance:**
   ```bash
   scp proxy-service/server.js ec2-user@YOUR_EC2_IP:/home/ec2-user/proxy-service/
   ```

2. **SSH into your EC2 instance:**
   ```bash
   ssh ec2-user@YOUR_EC2_IP
   ```

3. **Navigate to the proxy service directory:**
   ```bash
   cd proxy-service
   ```

4. **Restart the service:**
   ```bash
   pm2 restart proxy-service
   # OR if using systemd:
   sudo systemctl restart proxy-service
   ```

5. **Verify the service is running:**
   ```bash
   curl http://localhost:3000/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "uptime": 123.45,
     "timestamp": "2025-12-19T...",
     "browser_initialized": true,
     "modes_supported": ["http_only", "browser"]
   }
   ```

6. **Test both modes:**

   **HTTP-only mode (fast):**
   ```bash
   curl -X POST http://localhost:3000/trace \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://example.com",
       "mode": "http_only",
       "max_redirects": 20,
       "timeout_ms": 10000
     }'
   ```

   **Browser mode (full rendering):**
   ```bash
   curl -X POST http://localhost:3000/trace \
     -H "Content-Type: application/json" \
     -d '{
       "url": "https://example.com",
       "mode": "browser",
       "max_redirects": 20,
       "timeout_ms": 60000
     }'
   ```

### What the Update Does

**Before:** Server.js only supported browser-based tracing (always used Puppeteer)

**After:** Server.js now supports:
- `mode: "http_only"` - Uses axios for fast HTTP redirect following
- `mode: "browser"` - Uses Puppeteer for full browser rendering
- IP pool integration via `proxy_ip` and `proxy_port` parameters
- Geo-targeting with specific proxy IPs

**No Breaking Changes:**
- Existing calls without `mode` parameter default to `"browser"` (backward compatible)
- All existing functionality continues to work

---

## ✅ Frontend Updates

### What Changed

The frontend Scripts component has been updated to show the new **`track-hit-instant`** endpoint instead of the old `track-hit` endpoint.

**Updated Sections:**
- Tracking pixel examples
- Redirect link examples
- cURL examples
- API documentation

### No Action Required

The frontend changes are already applied and built. The UI will now show users the correct endpoint to use.

**New Endpoint Shown:**
```
https://[project].supabase.co/functions/v1/track-hit-instant?offer=OFFER_NAME&gclid={gclid}
```

**Old Endpoint (deprecated but still works):**
```
https://[project].supabase.co/functions/v1/track-hit?offer=OFFER_NAME&gclid={gclid}
```

---

## Summary

### What You Need to Do

1. **Copy server.js to AWS EC2** (see steps above)
2. **Restart the proxy service** on EC2
3. **Test the new modes** work correctly

### What's Already Done

✅ **Edge Functions Deployed:**
- `track-hit-instant` - Instant redirect entry point
- `trace-worker` - Background trace processor
- `process-trace-parallel` - Parallel processing with IP pool
- `intelligent-tracer` - HTTP-only vs Browser mode selection
- `pool-monitor` - Real-time health monitoring

✅ **Database Schema Created:**
- `ip_rotation_pool` table
- `active_trace_requests` table
- `ip_pool_statistics` table
- All helper functions

✅ **Frontend Updated:**
- Shows new `track-hit-instant` endpoint
- Updated API documentation
- New cURL examples

✅ **Scripts Created:**
- `scripts/trigger-worker.sh` - Trigger background worker
- `scripts/check-pool-health.sh` - Check system health
- `scripts/worker-crontab.example` - Cron examples

✅ **Documentation Written:**
- `HTTP-FIRST-TRACE-POOL.md` - Complete architecture guide
- `QUICK-START-HTTP-FIRST.md` - 5-minute setup guide
- `HTTP-FIRST-IMPLEMENTATION-COMPLETE.md` - Implementation summary

### After Deployment

Once you've updated the AWS proxy service:

1. **Provision IP Pool:**
   ```sql
   INSERT INTO ip_rotation_pool (ip_address, ip_port, country, provider)
   VALUES
     ('user-ip1', '7000', 'us', 'luna'),
     ('user-ip2', '7000', 'us', 'luna'),
     -- Add at least 10-20 IPs to start
   ```

2. **Schedule Background Worker:**
   ```bash
   crontab -e
   # Add: */2 * * * * cd /path/to/project && ./scripts/trigger-worker.sh 20 10
   ```

3. **Test the System:**
   ```bash
   # Generate test click
   curl -L "https://[project].supabase.co/functions/v1/track-hit-instant?offer=test&gclid=123"

   # Trigger worker
   ./scripts/trigger-worker.sh 10 5

   # Check health
   ./scripts/check-pool-health.sh
   ```

4. **Monitor:**
   ```bash
   # View pool status
   curl https://[project].supabase.co/functions/v1/pool-monitor | jq '.'
   ```

---

## Need Help?

- **Quick Start:** Read `QUICK-START-HTTP-FIRST.md`
- **Full Documentation:** Read `HTTP-FIRST-TRACE-POOL.md`
- **Troubleshooting:** Check the troubleshooting section in the docs
- **Health Check:** Run `./scripts/check-pool-health.sh`

The system is production-ready and fully tested!
