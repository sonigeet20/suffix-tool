# Parallel Tracking & Conversion Verification Guide

## Overview
This guide explains how to:
1. **Verify Google Ads parallel tracking hits are being logged**
2. **Confirm conversions are being tracked**
3. **Analyze the data to prove the system is working**

---

## 1. Parallel Tracking Detection

### What is Parallel Tracking?
When users click your Google Ad, Google uses **parallel tracking**:
- User's browser → Goes directly to landing page (fast UX)
- Google's servers → Send background request to your tracking URL
- **Both happen simultaneously** (hence "parallel")

### How We Detect It

The system automatically detects parallel tracking hits by checking:

✅ **User Agent patterns:**
- `Googlebot`
- `AdsBot-Google` 
- `Google-Ads`
- `Google-adwords`

✅ **Missing referrer:** Parallel tracking requests often have no referrer

✅ **Google-specific headers:**
- `x-google-ads-id`
- `x-google-gclid`
- `google-cloud-trace-context`

✅ **Cloudflare bot scores:** Low scores indicate bot traffic

### Deployment Steps

#### Step 1: Deploy Database Migration

```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2

# Deploy the parallel tracking migration
supabase db push --db-url "postgresql://postgres.yrmnvzocnwxqdhcdqoej:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
```

Or use the Supabase Dashboard:
1. Go to SQL Editor
2. Paste contents of `supabase/migrations/20260130_parallel_tracking_logging.sql`
3. Run query

#### Step 2: Deploy Updated Click Handler

```bash
# Test the changes locally first
cd proxy-service
npm install
npm start

# Test endpoint
curl "http://localhost:3000/click?offer_name=TRIVAGO_UK_SHEET_MOB&force_transparent=true&meta_refresh=true&redirect_url=https://www.trivago.co.uk/"
```

#### Step 3: Deploy to Production (All 7 EC2 Instances)

```bash
KEY_PATH="$HOME/Downloads/suffix-server.pem"
FILE="google-ads-click.js"

for IP in 44.201.31.131 3.238.164.22 3.238.218.35 3.228.19.13 98.92.196.253 98.84.115.27 18.207.111.101; do
  echo "=== Deploying to $IP ==="
  
  # Backup
  ssh -i "$KEY_PATH" ec2-user@$IP "cp /home/ec2-user/proxy-service/routes/$FILE /home/ec2-user/proxy-service/routes/${FILE}.bak_$(date +%Y%m%d_%H%M%S)"
  
  # Upload
  scp -i "$KEY_PATH" "proxy-service/routes/$FILE" "ec2-user@$IP:/home/ec2-user/proxy-service/routes/$FILE"
  
  # Restart
  ssh -i "$KEY_PATH" ec2-user@$IP "cd /home/ec2-user/proxy-service && pm2 restart all"
  
  # Verify
  ssh -i "$KEY_PATH" ec2-user@$IP "pm2 status"
done
```

### Verify Parallel Tracking Logging

#### Check the Logs (Real-time)

```bash
# SSH into any EC2 instance
ssh -i ~/Downloads/suffix-server.pem ec2-user@44.201.31.131

# Watch PM2 logs for parallel tracking detection
pm2 logs --lines 100 | grep "parallel_tracking"
```

You should see logs like:
```
[google-ads-click] ✓ Logged click: parallel_tracking=true, click_id=click_1738252800_abc123
[google-ads-click] ✓ Logged click: parallel_tracking=false, click_id=1234567890.abcdef
```

#### Query Database for Parallel Tracking Stats

**Option A: Supabase SQL Editor**

```sql
-- View recent parallel tracking hits
SELECT 
  offer_name,
  clicked_at,
  user_agent,
  is_parallel_tracking,
  parallel_tracking_indicators,
  user_ip,
  click_id
FROM google_ads_click_events
WHERE clicked_at >= NOW() - INTERVAL '1 hour'
ORDER BY clicked_at DESC
LIMIT 20;
```

**Option B: Use the Stats Function**

```sql
-- Get parallel tracking statistics by offer
SELECT * FROM get_parallel_tracking_stats('TRIVAGO_UK_SHEET_MOB', 7);
```

Expected output:
```
offer_name              | total_clicks | parallel_tracking_clicks | parallel_tracking_percentage | with_conversions | conversion_rate
------------------------|--------------|--------------------------|------------------------------|------------------|----------------
TRIVAGO_UK_SHEET_MOB   | 1500         | 1200                     | 80.00                        | 45               | 3.00
```

**Option C: Use the Dashboard View**

```sql
-- View daily conversion tracking dashboard
SELECT * FROM conversion_tracking_dashboard
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC, offer_name;
```

---

## 2. Conversion Tracking

### How Conversions Work

When a user completes a conversion (purchase, signup, etc.), the affiliate network sends a **postback** to your server with the conversion details.

### Setup Conversion Postback Endpoint

#### Step 1: Add Route to server.js

Add this to your `proxy-service/server.js`:

```javascript
// Import conversion tracking routes
const conversionRoutes = require('./routes/conversion-postback');

// Add conversion postback endpoints
app.get('/postback', conversionRoutes.handlePostback);
app.get('/conversion-stats', conversionRoutes.handleConversionStats);
```

#### Step 2: Deploy conversion-postback.js

```bash
KEY_PATH="$HOME/Downloads/suffix-server.pem"

for IP in 44.201.31.131 3.238.164.22 3.238.218.35 3.228.19.13 98.92.196.253 98.84.115.27 18.207.111.101; do
  echo "=== Deploying conversion tracking to $IP ==="
  
  # Upload new file
  scp -i "$KEY_PATH" "proxy-service/routes/conversion-postback.js" "ec2-user@$IP:/home/ec2-user/proxy-service/routes/"
  
  # Upload updated server.js (after adding the routes above)
  scp -i "$KEY_PATH" "proxy-service/server.js" "ec2-user@$IP:/home/ec2-user/proxy-service/"
  
  # Restart
  ssh -i "$KEY_PATH" ec2-user@$IP "cd /home/ec2-user/proxy-service && pm2 restart all"
done
```

### Configure Postback URL in Affiliate Network

In your affiliate network dashboard (e.g., Awin, CJ, Impact), set your postback URL to:

```
https://ads.day24.online/postback?click_id={CLICK_ID}&payout={PAYOUT}&conversion_id={TRANSACTION_ID}
```

**Replace placeholders** with your network's macros:
- `{CLICK_ID}` → Network's click ID macro (e.g., `{awin_click_ref}`)
- `{PAYOUT}` → Commission value macro (e.g., `{commission_amount}`)
- `{TRANSACTION_ID}` → Unique transaction ID (e.g., `{transaction_id}`)

**Example for Awin:**
```
https://ads.day24.online/postback?click_id={awin_click_ref}&payout={commission_amount}&conversion_id={transaction_id}
```

### Test Conversion Tracking

#### Manual Test with Curl

```bash
# Simulate a conversion postback
curl "https://ads.day24.online/postback?click_id=click_1738252800_abc123&payout=50.00&conversion_id=TEST_CONV_123"
```

Expected response:
```json
{
  "success": true,
  "message": "Conversion recorded successfully",
  "click_id": "click_1738252800_abc123",
  "offer_name": "TRIVAGO_UK_SHEET_MOB",
  "conversion_value": 50.00,
  "conversion_id": "TEST_CONV_123"
}
```

#### Verify Conversion in Database

```sql
-- Check if conversion was recorded
SELECT 
  offer_name,
  clicked_at,
  click_id,
  conversion_tracked,
  conversion_timestamp,
  conversion_value,
  conversion_id,
  -- Time to conversion
  EXTRACT(EPOCH FROM (conversion_timestamp - clicked_at)) / 3600 as hours_to_conversion
FROM google_ads_click_events
WHERE conversion_tracked = TRUE
ORDER BY conversion_timestamp DESC
LIMIT 10;
```

---

## 3. End-to-End Verification

### Step-by-Step Test Plan

#### ✅ Test 1: Fire a Real Google Ad Click

1. **Create test campaign** in Google Ads with your tracking URL:
   ```
   https://ads.day24.online/click?offer_name=TRIVAGO_UK_SHEET_MOB&force_transparent=true&meta_refresh=true&redirect_url={lpurl}
   ```

2. **Click your ad** from a real device (not emulator)

3. **Check logs** immediately:
   ```bash
   ssh -i ~/Downloads/suffix-server.pem ec2-user@44.201.31.131
   pm2 logs --lines 50
   ```

4. **Look for:**
   - ✅ `[google-ads-click] Silent fetch mode enabled`
   - ✅ `[google-ads-click] ✓ Logged click: parallel_tracking=true/false, click_id=XXX`

#### ✅ Test 2: Verify Cookie Drop

1. **Use browser DevTools** (Network tab)

2. **Click ad** and observe:
   - Silent fetch fires to `go.gomobupps.com`
   - Multiple cookies set (aff_ran_url, enc_aff_session, ho_mob, etc.)
   - Redirect happens after 100ms delay

3. **Check cookies** in Application tab → Cookies

#### ✅ Test 3: Verify Parallel Tracking Detection

```sql
-- Run this query 5 minutes after clicking your ad
SELECT 
  offer_name,
  clicked_at,
  is_parallel_tracking,
  parallel_tracking_indicators,
  user_agent,
  click_id
FROM google_ads_click_events
WHERE offer_name = 'TRIVAGO_UK_SHEET_MOB'
  AND clicked_at >= NOW() - INTERVAL '10 minutes'
ORDER BY clicked_at DESC;
```

**Expected results:**
- You'll see **2 clicks** for your single ad click:
  1. ✅ `is_parallel_tracking = false` (your browser)
  2. ✅ `is_parallel_tracking = true` (Google's parallel tracking hit)

#### ✅ Test 4: Simulate Conversion

1. **Get click_id** from the previous query

2. **Fire postback:**
   ```bash
   curl "https://ads.day24.online/postback?click_id=YOUR_CLICK_ID&payout=45.50&conversion_id=TEST_CONV_001"
   ```

3. **Verify conversion recorded:**
   ```sql
   SELECT * FROM google_ads_click_events 
   WHERE click_id = 'YOUR_CLICK_ID';
   ```

4. **Check conversion stats:**
   ```sql
   SELECT * FROM conversion_tracking_dashboard
   WHERE offer_name = 'TRIVAGO_UK_SHEET_MOB'
   ORDER BY date DESC
   LIMIT 7;
   ```

---

## 4. Analytics & Dashboards

### Key Metrics to Monitor

```sql
-- Daily performance summary
SELECT 
  date,
  offer_name,
  total_clicks,
  parallel_tracking_hits,
  ROUND(parallel_tracking_hits::NUMERIC / NULLIF(total_clicks, 0) * 100, 2) as parallel_pct,
  conversions,
  conversion_rate_pct,
  total_revenue,
  avg_order_value
FROM conversion_tracking_dashboard
WHERE date >= CURRENT_DATE - 7
ORDER BY date DESC, total_clicks DESC;
```

### Expected Patterns

**Healthy Campaign:**
- ✅ **60-90% parallel tracking hits** (indicates Google is properly firing tracking)
- ✅ **Conversion rate 1-10%** (depends on offer quality)
- ✅ **Average time to conversion 0-24 hours** (most convert quickly)

**Warning Signs:**
- ⚠️ **<40% parallel tracking** → Check if parallel tracking is enabled in Google Ads
- ⚠️ **0% conversions after 48 hours** → Check postback URL configuration
- ⚠️ **100% parallel tracking, 0% real users** → Campaign blocked or not getting real clicks

---

## 5. Troubleshooting

### Issue: No Parallel Tracking Detected

**Check:**
1. Is parallel tracking enabled in Google Ads campaign settings?
2. Are the logs showing any clicks at all?
   ```bash
   pm2 logs | grep "Silent fetch mode enabled"
   ```
3. Run query: `SELECT COUNT(*) FROM google_ads_click_events WHERE clicked_at >= NOW() - INTERVAL '1 hour';`

### Issue: No Conversions Recorded

**Check:**
1. Is postback URL configured correctly in affiliate network?
2. Test postback manually with curl (see Test 4 above)
3. Check click_id format matches what network sends
4. Verify network is actually sending postbacks (check their dashboard)

### Issue: Duplicate Conversions

**Check:**
```sql
SELECT click_id, COUNT(*) as conversion_count
FROM google_ads_click_events
WHERE conversion_tracked = TRUE
GROUP BY click_id
HAVING COUNT(*) > 1;
```

**Fix:** Add unique constraint:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_conversion_per_click
ON google_ads_click_events(click_id)
WHERE conversion_tracked = TRUE;
```

---

## 6. Quick Reference

### Useful SQL Queries

```sql
-- Real-time clicks (last hour)
SELECT * FROM parallel_tracking_analysis
WHERE clicked_at >= NOW() - INTERVAL '1 hour'
ORDER BY clicked_at DESC;

-- Conversion rate by offer
SELECT 
  offer_name,
  COUNT(*) as clicks,
  COUNT(*) FILTER (WHERE conversion_tracked = TRUE) as conversions,
  ROUND(COUNT(*) FILTER (WHERE conversion_tracked = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) as cvr_pct
FROM google_ads_click_events
WHERE clicked_at >= CURRENT_DATE - 7
GROUP BY offer_name
ORDER BY clicks DESC;

-- Top converting hours
SELECT 
  EXTRACT(HOUR FROM clicked_at) as hour_of_day,
  COUNT(*) as clicks,
  COUNT(*) FILTER (WHERE conversion_tracked = TRUE) as conversions,
  ROUND(AVG(conversion_value), 2) as avg_value
FROM google_ads_click_events
WHERE clicked_at >= CURRENT_DATE - 7
  AND conversion_tracked = TRUE
GROUP BY hour_of_day
ORDER BY conversions DESC;
```

### Log Monitoring Commands

```bash
# Watch for parallel tracking logs
pm2 logs | grep --line-buffered "parallel_tracking"

# Watch for conversions
pm2 logs | grep --line-buffered "Conversion recorded"

# Count recent clicks
pm2 logs --lines 1000 | grep "Silent fetch mode enabled" | wc -l
```

---

## Success Criteria

Your system is working correctly when you see:

✅ **Clicks being logged** with both `is_parallel_tracking=true` and `false`  
✅ **Cookies being set** (verified in browser DevTools)  
✅ **Conversions being recorded** when postbacks fire  
✅ **Conversion rate > 0%** within 48 hours of launching campaign  
✅ **PM2 logs showing** parallel tracking detection messages  

---

## Support

If you need help:
1. Check PM2 logs: `pm2 logs --lines 200`
2. Run diagnostic queries from Section 6
3. Verify postback URL with test curl command
4. Check Supabase logs for database errors
