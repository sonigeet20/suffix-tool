# Trackier Dual-URL Integration

**COMPLETELY ISOLATED MODULE - Does not affect existing functionality**

## Overview

This module enables automatic tracking parameter updates through Trackier's webhook system, eliminating the need for constant Google Ads API updates. Users get instant redirects while suffix updates happen asynchronously in the background.

## Architecture

```
Google Ads (Set Once) → Trackier URL 1 (Passthrough) → Trackier URL 2 (With Fresh Suffix) → Final Destination
                              ↓
                         Your Webhook
                              ↓
                    Background Trace (12s)
                              ↓
                    Update URL 2 via API
                              ↓
                    Ready for Next Click
```

### Key Benefits

1. **User Experience**: Instant redirects (no 12-30s wait)
2. **Pre-loading**: URL 2 always has fresh suffix ready
3. **Scalability**: No Google Ads API rate limits
4. **Flexibility**: Per-offer update intervals (prevent Trackier rate limits)
5. **Isolation**: Zero impact on existing manual tracing

## Files Created

### Database Schema
- **`/supabase/migrations/20260109_trackier_tables.sql`** (268 lines)
  - 4 new tables: `trackier_offers`, `trackier_webhook_logs`, `trackier_trace_history`, `trackier_api_calls`
  - Complete isolation: No foreign key constraints
  - Helper functions: Cleanup, statistics, auto-timestamps
  - Soft links only: Won't cascade delete existing data

### Backend
- **`/proxy-service/routes/trackier-webhook.js`** (670 lines)
  - POST `/api/trackier-webhook` - Receives click notifications from Trackier
  - GET `/api/trackier-status` - Health check and statistics
  - POST `/api/trackier-trigger/:offerId` - Manual testing endpoint
  - Background processing: Trace + Trackier API update
  - Complete error handling and logging

### Frontend
- **`/src/components/TrackierSetup.tsx`** (650 lines)
  - Configuration UI for Trackier integration
  - API key management
  - Campaign ID setup (URL 1 & URL 2)
  - Google Ads template generation
  - Real-time statistics display
  - Test webhook functionality

### Integration (Minimal Changes)
- **`/proxy-service/server.js`** (+3 lines)
  - Import: `const trackierRoutes = require('./routes/trackier-webhook');`
  - Mount: `app.use('/api', trackierRoutes);`
  
- **`/src/components/OfferList.tsx`** (+15 lines)
  - Import: `TrackierSetup` component and `Webhook` icon
  - State: `trackierOffer` for modal
  - Button: Webhook icon next to Edit/Delete
  - Modal: Render `<TrackierSetup />` when open

## Setup Instructions

### 1. Database Migration

Run the migration to create isolated tables:

```bash
# Option A: Supabase CLI
supabase db push

# Option B: SQL Editor in Supabase Dashboard
# Copy contents of /supabase/migrations/20260109_trackier_tables.sql
# Paste into SQL Editor → Run
```

### 2. Environment Variables

Add to `.env` (backend):

```env
# Trackier Feature Flag (default: enabled)
TRACKIER_ENABLED=true

# Supabase credentials (already configured)
SUPABASE_URL=https://rfhuqenntxiqurplenjn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Restart Proxy Service

```bash
cd proxy-service
pm2 restart all
# or
npm run start
```

### 4. Create Trackier Campaigns

In Trackier dashboard:

**URL 1 (Passthrough Campaign)**
- Name: "Google Ads Webhook Trigger - [Offer Name]"
- Destination: URL 2 (created below)
- Webhook: `https://18.206.90.98:3000/api/trackier-webhook`
- Webhook Events: Click
- Note campaign ID (e.g., `abc123`)

**URL 2 (Final Campaign)**
- Name: "Final Destination - [Offer Name]"
- Destination: Your affiliate URL (will be updated automatically)
- Note campaign ID (e.g., `xyz789`)

### 5. Configure in UI

1. Navigate to Offers page
2. Click **Webhook icon** (⚡) next to any offer
3. Fill in configuration:
   - **API Key**: Your Trackier API key
   - **URL 1 Campaign ID**: `abc123` (from step 4)
   - **URL 2 Campaign ID**: `xyz789` (from step 4)
   - **Update Interval**: 300 seconds (5 minutes) recommended
   - **Tracer Mode**: `http_only` (fast) recommended
4. Click **Create Configuration**
5. Copy generated Google Ads tracking template
6. Click **Test Update** to verify

### 6. Google Ads Setup

Use the generated tracking template in your Google Ads campaigns:

```
https://gotrackier.com/click?campaign_id=abc123&pub_id={lpurl}&source=google_ads&gclid={gclid}&webhook=https%3A%2F%2F18.206.90.98%3A3000%2Fapi%2Ftrackier-webhook
```

**Set once - never change it!**

## How It Works

### Flow Diagram

```
1. User clicks Google Ad
   ↓
2. Redirects to Trackier URL 1 (passthrough)
   ↓
3. Trackier fires webhook to your server
   ↓
4. URL 1 redirects to URL 2 (user gets instant redirect)
   ↓
5. Your server receives webhook (async)
   ↓
6. Check update interval (prevent rate limits)
   ↓
7. Trace affiliate URL (12-30 seconds)
   ↓
8. Update URL 2 via Trackier API
   ↓
9. Next click gets fresh suffix
```

### Update Throttling

- **Update Interval**: Configurable per offer (default: 300 seconds)
- **Purpose**: Prevent Trackier API rate limits
- **Behavior**: 
  - Webhook received → Check last update time
  - If interval elapsed → Trigger update
  - If too soon → Log but skip update
  - User always gets instant redirect regardless

### Logging & Monitoring

All events logged to database:

- **`trackier_webhook_logs`**: Every click received
- **`trackier_trace_history`**: Every trace performed
- **`trackier_api_calls`**: Every Trackier API request
- **`trackier_offers`**: Statistics aggregated

Access stats via:
- UI: Statistics panel in TrackierSetup component
- API: `GET /api/trackier-status`
- Database: `SELECT * FROM get_trackier_stats('offer-uuid');`

## Testing

### Test Update Endpoint

Trigger manual update (bypasses interval check):

```bash
# Get offer ID from trackier_offers table
curl -X POST http://localhost:3000/api/trackier-trigger/OFFER_UUID
```

Response:
```json
{
  "success": true,
  "message": "Update triggered successfully",
  "result": {
    "success": true,
    "duration_ms": 12450
  }
}
```

### Health Check

```bash
curl http://localhost:3000/api/trackier-status
```

Response:
```json
{
  "enabled": true,
  "active_offers": 5,
  "offers": [...],
  "stats_last_hour": {
    "webhooks": 142,
    "traces": 28,
    "success_rate": "96.4%"
  }
}
```

### UI Testing

1. Configure offer via Trackier Setup modal
2. Click **Test Update** button
3. Check success message with duration
4. Verify stats updated (webhook count, last update time)
5. Check Trackier dashboard for URL 2 update

## Monitoring

### Database Queries

**Recent webhooks:**
```sql
SELECT * FROM trackier_webhook_logs 
ORDER BY created_at DESC 
LIMIT 100;
```

**Trace success rate:**
```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
FROM trackier_trace_history
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Average trace duration:**
```sql
SELECT 
  offer_name,
  COUNT(*) as traces,
  ROUND(AVG(trace_duration_ms) / 1000, 1) as avg_seconds
FROM trackier_trace_history
JOIN trackier_offers ON trackier_offers.id = trackier_trace_history.trackier_offer_id
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY offer_name
ORDER BY traces DESC;
```

**API errors:**
```sql
SELECT * FROM trackier_api_calls 
WHERE success = false 
ORDER BY created_at DESC 
LIMIT 50;
```

### Logs

**Backend logs:**
```bash
# PM2
pm2 logs

# Or check files
tail -f proxy-service/combined.log
tail -f proxy-service/error.log
```

**Search for Trackier events:**
```bash
grep "Trackier" proxy-service/combined.log | tail -100
```

## Troubleshooting

### Webhook Not Received

1. Check Trackier webhook configuration:
   - URL: `https://18.206.90.98:3000/api/trackier-webhook`
   - Events: Click enabled
   - Campaign: URL 1 (passthrough) has webhook

2. Check firewall:
   ```bash
   # Test from external server
   curl -X POST https://18.206.90.98:3000/api/trackier-webhook \
     -H "Content-Type: application/json" \
     -d '{"campaign_id":"test123"}'
   ```

3. Check backend status:
   ```bash
   curl http://localhost:3000/api/trackier-status
   ```

### Updates Not Working

1. **Check API credentials:**
   - UI: TrackierSetup → API Key field
   - Database: `SELECT api_key FROM trackier_offers WHERE id = 'uuid';`

2. **Check interval:**
   - May be throttled if too many requests
   - View: `SELECT url2_last_updated_at, update_interval_seconds FROM trackier_offers;`
   - Solution: Increase `update_interval_seconds`

3. **Check trace errors:**
   ```sql
   SELECT * FROM trackier_trace_history 
   WHERE success = false 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

4. **Check API errors:**
   ```sql
   SELECT * FROM trackier_api_calls 
   WHERE success = false 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

### Slow Traces

Normal: 12-30 seconds (acceptable for async updates)

If consistently >30s:
1. Check proxy service health
2. Check Bright Data account status
3. Try different tracer mode:
   - `http_only` - Fastest (recommended)
   - `browser` - Slower but handles JavaScript
   - `anti_cloaking` - Slowest but most reliable

### Database Cleanup

Built-in cleanup function (runs automatically via trigger):

```sql
-- Manual cleanup of old logs (older than 30 days)
SELECT cleanup_old_trackier_webhooks();
```

## Isolation Guarantees

### What WON'T be affected:

✅ Existing `offers` table - No modifications
✅ Existing `traces` table - Separate `trackier_trace_history`
✅ Existing Edge Functions - Independent calls
✅ Google Ads scripts (V1/V2/V3) - Unrelated systems
✅ Manual tracing - Different workflow
✅ Analytics - Separate tracking

### How to disable:

**Option 1: Feature flag**
```env
TRACKIER_ENABLED=false
```

**Option 2: Per-offer toggle**
UI: TrackierSetup → Toggle "Enable Trackier Integration" to OFF

**Option 3: Complete removal**
```sql
-- Drop all Trackier tables
DROP TABLE IF EXISTS trackier_api_calls CASCADE;
DROP TABLE IF EXISTS trackier_trace_history CASCADE;
DROP TABLE IF EXISTS trackier_webhook_logs CASCADE;
DROP TABLE IF EXISTS trackier_offers CASCADE;

-- Remove functions
DROP FUNCTION IF EXISTS update_trackier_offers_updated_at CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_trackier_webhooks CASCADE;
DROP FUNCTION IF EXISTS get_trackier_stats CASCADE;
```

Remove integration lines:
- `proxy-service/server.js`: Delete 3 lines (require + use)
- `src/components/OfferList.tsx`: Delete 15 lines (import + state + button + modal)

**Existing system continues working perfectly.**

## Performance Metrics

### Expected Performance

- **Webhook response**: <100ms (immediate 200 OK)
- **Trace duration**: 12-30 seconds (background, user doesn't wait)
- **API update**: <500ms (Trackier API call)
- **Total background**: 13-31 seconds per update
- **User experience**: Instant redirect (0s wait)

### Optimization Tips

1. **Tracer Mode Selection:**
   - `http_only`: 10-15s (recommended for simple redirects)
   - `browser`: 20-30s (needed for JavaScript-heavy sites)
   - `anti_cloaking`: 25-40s (maximum stealth)

2. **Update Intervals:**
   - Frequent changes: 300s (5 min)
   - Moderate changes: 600s (10 min)
   - Stable parameters: 1800s (30 min)

3. **Proxy Settings:**
   - `use_proxy: true` - More reliable, slower
   - `use_proxy: false` - Faster, may get blocked

## API Reference

### POST /api/trackier-webhook

Receives webhook from Trackier URL 1.

**Request:**
```json
{
  "campaign_id": "abc123",
  "click_id": "xyz789",
  "publisher_id": "pub123",
  "ip": "1.2.3.4",
  "country": "US",
  "device": "mobile"
}
```

**Response (Immediate):**
```json
{
  "success": true,
  "message": "Webhook received",
  "timestamp": "2024-01-09T12:34:56.789Z"
}
```

**Background Processing:**
- Checks update interval
- Triggers trace if needed
- Updates Trackier URL 2
- Logs to database

### POST /api/trackier-trigger/:offerId

Manual update trigger (testing).

**Response:**
```json
{
  "success": true,
  "message": "Update triggered successfully",
  "result": {
    "success": true,
    "duration_ms": 12450
  }
}
```

### GET /api/trackier-status

Health check and statistics.

**Response:**
```json
{
  "enabled": true,
  "active_offers": 5,
  "offers": [
    {
      "id": "uuid",
      "offer_name": "Example",
      "enabled": true,
      "webhook_count": 142,
      "update_count": 28,
      "url2_last_updated_at": "2024-01-09T12:00:00Z",
      "last_webhook_at": "2024-01-09T12:34:56Z"
    }
  ],
  "stats_last_hour": {
    "webhooks": 142,
    "traces": 28,
    "success_rate": "96.4%"
  }
}
```

## Security

### API Key Storage

- Stored encrypted in `trackier_offers.api_key`
- Never logged to webhook_logs or trace_history
- Only visible in API call logs for debugging
- Consider using Row Level Security (RLS) policies:

```sql
-- Enable RLS
ALTER TABLE trackier_offers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own offers
CREATE POLICY "Users can view own trackier offers"
  ON trackier_offers FOR SELECT
  USING (auth.uid() = user_id);
```

### Webhook Validation

Current: Open endpoint (Trackier doesn't sign webhooks)

To add IP whitelist:
```javascript
// In trackier-webhook.js
const ALLOWED_IPS = ['trackier-ip-1', 'trackier-ip-2'];
if (!ALLOWED_IPS.includes(req.ip)) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

### HTTPS

Production webhook URL must use HTTPS:
```
https://your-domain.com/api/trackier-webhook
```

Update EC2 with SSL certificate or use reverse proxy (Nginx).

## Support & Contact

For issues related to:
- **Trackier Platform**: Contact Trackier support
- **This Integration**: Check logs, database, and this README
- **Existing Functionality**: This module is isolated - won't affect it

## License

Same as parent project.

---

**Last Updated:** 2024-01-09
**Version:** 1.0.0
**Status:** Production Ready (Isolated, Safe to Deploy)
