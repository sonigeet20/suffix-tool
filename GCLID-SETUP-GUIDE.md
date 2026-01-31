# GCLID Tracking Setup Guide

## Quick Setup (3 Steps)

### 1. Update Google Ads Config in Database

```sql
UPDATE google_ads_config
SET 
  -- REQUIRED: Network's click ID parameter name
  gclid_param_token = 'xcust',  -- For Skimlinks
  -- gclid_param_token = 'subid',  -- For other networks
  
  -- REQUIRED: Your affiliate network tracking URL
  silent_fetch_tracking_url = 'https://go.skimresources.com?id=124588X1613321&xs=1&url=https://example.com',
  
  -- OPTIONAL: Trace mode (default: http_only)
  trace_mode = 'http_only',  -- Options: http_only, browser, anti_cloaking, interactive
  
  -- OPTIONAL: Enable residential proxy (default: true)
  use_residential_proxy_for_tracking = true,
  
  -- REQUIRED: Enable silent fetch
  silent_fetch_enabled = true
  
WHERE offer_name = 'YOUR_OFFER_NAME';
```

### 2. Configure Google Ads Tracking Template

In your Google Ads campaign, set the tracking template to:

```
https://your-domain.com/click?offer_name=YOUR_OFFER_NAME&redirect_url={lpurl}&clickref={gclid}
```

**Key parts:**
- `offer_name=YOUR_OFFER_NAME` - Must match your database offer
- `redirect_url={lpurl}` - Google replaces with landing page
- `clickref={gclid}` - Google replaces with actual GCLID

### 3. Deploy Updated Code

```bash
# Deploy to all instances
./deploy-all-instances.sh
```

## How It Works

### Click Flow

1. **User clicks Google Ad**
   - Google's parallel tracking fires `navigator.sendBeacon()` 
   - POST request sent to: `https://your-domain.com/click?offer_name=X&redirect_url=Y&clickref=Cj0KCQiA...`

2. **Server extracts GCLID**
   - Extracts `Cj0KCQiA...` from `clickref` parameter
   - Logs: `[google-ads-click] GCLID: Cj0KCQiA...`

3. **Server appends GCLID to tracking URL**
   - Original: `https://go.skimresources.com?id=123&url=example.com`
   - Becomes: `https://go.skimresources.com?id=123&url=example.com&xcust=Cj0KCQiA...`
   - Logs: `[google-ads-click] 🔑 Appended GCLID: xcust=Cj0KCQiA...`

4. **Server traces tracking URL using full infrastructure**
   - Calls `/trace` endpoint (same as get-suffix)
   - Uses residential proxy matching user's country
   - Rotates user agents with device fingerprinting
   - Follows all redirects
   - Logs: `[google-ads-click] ✅ Tracking URL traced: 5 hops, final: https://...`

5. **Affiliate network receives click**
   - Network sees: `xcust=Cj0KCQiA...` (the GCLID)
   - Network attributes conversions to this click ID
   - GCLID stored in database for later conversion matching

### Trace Modes

| Mode | Speed | Features | Use Case |
|------|-------|----------|----------|
| `http_only` | ⚡ Fast (1-3s) | Redirects only, no JS | Most affiliate networks |
| `browser` | 🐌 Slow (5-15s) | Full rendering, JS execution | JS-heavy redirects |
| `anti_cloaking` | 🐌 Slow (10-20s) | Stealth mode, bypasses detection | Protected networks |
| `interactive` | 🐌 Slowest (15-30s) | Simulates user actions | Highly protected |

**Recommendation:** Start with `http_only` for speed. Only use `browser` if redirects fail.

## Configuration Examples

### Skimlinks

```sql
UPDATE google_ads_config
SET 
  gclid_param_token = 'xcust',
  silent_fetch_tracking_url = 'https://go.skimresources.com?id=YOUR_ID&xs=1&url=https://merchant.com',
  trace_mode = 'http_only'
WHERE offer_name = 'YOUR_OFFER';
```

### Impact/Partnerize

```sql
UPDATE google_ads_config
SET 
  gclid_param_token = 'clickref',
  silent_fetch_tracking_url = 'https://prf.hn/click/camref:YOUR_ID/destination:https://merchant.com',
  trace_mode = 'http_only'
WHERE offer_name = 'YOUR_OFFER';
```

### Awin

```sql
UPDATE google_ads_config
SET 
  gclid_param_token = 'clickref',
  silent_fetch_tracking_url = 'https://www.awin1.com/cread.php?awinmid=MERCHANT_ID&awinaffid=YOUR_ID&ued=https://merchant.com',
  trace_mode = 'http_only'
WHERE offer_name = 'YOUR_OFFER';
```

### CJ Affiliate

```sql
UPDATE google_ads_config
SET 
  gclid_param_token = 'sid',
  silent_fetch_tracking_url = 'https://www.jdoqocy.com/click-YOUR_ID?url=https://merchant.com',
  trace_mode = 'http_only'
WHERE offer_name = 'YOUR_OFFER';
```

## Verification

### 1. Check Logs

```bash
ssh -i ~/Downloads/suffix-server.pem ec2-user@YOUR_IP
pm2 logs proxy-service --lines 100 | grep GCLID
```

You should see:
```
[google-ads-click] GCLID: Cj0KCQiA...
[google-ads-click] 🔑 Appended GCLID: xcust=Cj0KCQiA...
[google-ads-click] ✅ Tracking URL traced: 5 hops
```

### 2. Test Click

```bash
curl "http://localhost:3000/click?offer_name=YOUR_OFFER&redirect_url=https://example.com&clickref=TEST_GCLID_123"
```

### 3. Check Database

```sql
SELECT * FROM gclid_click_mapping 
ORDER BY created_at DESC 
LIMIT 10;
```

## Troubleshooting

### GCLID not appearing

**Problem:** No GCLID in logs

**Solution:** 
1. Check Google Ads tracking template has `&clickref={gclid}`
2. Test with real Google Ad click (not direct URL)
3. Verify parallel tracking is enabled in Google Ads

### Tracking URL not being hit

**Problem:** `silent_fetch_tracking_url` not traced

**Solution:**
1. Verify `silent_fetch_enabled = true`
2. Check `silent_fetch_tracking_url` is set
3. Look for trace errors in logs

### Wrong parameter name

**Problem:** Network doesn't recognize click ID

**Solution:**
1. Check network's documentation for correct parameter
2. Update `gclid_param_token` to match
3. Common names: `xcust`, `subid`, `clickref`, `sid`

### Trace timeouts

**Problem:** Tracking URL trace times out

**Solution:**
1. Try different trace mode: `browser` instead of `http_only`
2. Increase timeout in offer settings
3. Check if network blocks server IPs

## Advanced Configuration

### Per-Offer Trace Settings

```sql
UPDATE google_ads_config
SET 
  trace_mode = 'browser',  -- Use browser rendering
  use_residential_proxy_for_tracking = true,  -- Match user's country
  gclid_param_token = 'xcust'
WHERE offer_name = 'DIFFICULT_OFFER';
```

### Multiple Networks (Multi-Step)

For offers using multiple networks in sequence:

```sql
-- Primary network captures GCLID
UPDATE google_ads_config
SET 
  gclid_param_token = 'xcust',
  silent_fetch_tracking_url = 'https://network1.com?id=123&xcust=DYNAMIC',
  trace_mode = 'http_only'
WHERE offer_name = 'MULTI_NETWORK_OFFER';
```

## Database Tables

### gclid_click_mapping
Stores GCLID → offer mappings for each click

```sql
SELECT gclid, offer_name, client_country, created_at
FROM gclid_click_mapping
ORDER BY created_at DESC
LIMIT 10;
```

### google_ads_conversions
Stores conversions from postbacks (if configured)

```sql
SELECT gclid, offer_name, conversion_value, created_at
FROM google_ads_conversions
ORDER BY created_at DESC
LIMIT 10;
```

## Migration

Run the migration to create tables:

```bash
# On local
cat supabase/migrations/20260201000001_add_gclid_tracking_tables.sql | psql "$SUPABASE_DB_URL"

# Or use Supabase CLI
supabase db push
```

## Summary

✅ **Automatic GCLID extraction** from Google Ads clicks  
✅ **Configurable parameter mapping** per affiliate network  
✅ **Full trace infrastructure** with residential proxies  
✅ **User agent rotation** and device fingerprinting  
✅ **Multiple trace modes** for different network requirements  
✅ **Database audit trail** of all clicks and GCLIDs  
✅ **Easy configuration** via SQL updates  

The system handles everything automatically once configured - no code changes needed per offer!
