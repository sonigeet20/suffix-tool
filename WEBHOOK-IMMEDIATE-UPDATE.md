# Webhook Immediate Update System - Final Implementation

## ✅ Complete Flow

### 1. Script Runs - Auto-Mapping & Zero-Click Collection
**When:** Script starts (every 30 minutes via Google Ads scheduler)

**Actions:**
- ✅ Auto-creates mappings for all enabled campaigns
- ✅ Creates Trackier campaign + webhook URL automatically
- ✅ Fetches zero-click suffixes from last 7 days (once per 24 hours)
- ✅ Stores zero-click suffixes in bucket

**Result:** Campaign mappings created, Trackier webhooks ready, initial bucket populated

---

### 2. User Configures Webhook
**When:** User copies webhook URL to Trackier campaign S2S postback

**Webhook URL Format:**
```
http://your-alb-url:3000/webhook
```

**What Happens:**
- Trackier sends webhook on every conversion
- Backend receives webhook → creates queue item
- Backend marks `webhook_configured = true` on first webhook

---

### 3. Webhook Processing (IMMEDIATE)
**When:** Script polls queue every 2 seconds

**Actions on Each Webhook:**

#### Step 1: Apply Suffix to Campaign Immediately ✅
```javascript
applySuffixUpdate(campaignId, newSuffix)
// Uses: campaign.urls().setFinalUrlSuffix(newSuffix)
// Result: Campaign URLs immediately updated
```

#### Step 2: Trigger Trace ✅
```javascript
triggerTraceAndExtractSuffixes(suffix, campaignName)
// Calls: CONFIG.PROXY_SERVICE_URL + '/trace'
// Mode: 'http_only' (fast, 2-5 seconds)
// Result: Full redirect chain traced
```

#### Step 3: Store Traced Suffixes in Bucket ✅
```javascript
storeSuffixesInBucket(mappingId, tracedSuffixes)
// Extracts suffixes from all URLs in chain
// Stores with source='webhook'
// Result: Bucket populated with fresh suffixes
```

**Complete Webhook Flow:**
```
Trackier Conversion
  ↓
Webhook Received → Queue Item Created
  ↓
Google Ads Script Polls Queue
  ↓
[IMMEDIATE] Apply suffix to campaign
  ↓
[IMMEDIATE] Trace redirect chain
  ↓
[IMMEDIATE] Store traced suffixes in bucket
  ↓
Mark Queue Item Completed
```

---

## Script Structure

### main() Function Flow

```javascript
Step 1: Auto-Mapping
  - Ensure all campaigns have mappings
  - Create Trackier campaigns + webhooks

Step 2: Daily Zero-Click Fetch
  - Fetch zero-click suffixes once per 24h
  - Store in bucket

Step 3: Click Detection
  - Check campaigns for clicks today
  - Delete clicked suffixes from bucket

Step 4: Continuous Queue Polling
  - Poll every 2 seconds
  - Process webhooks immediately:
    * Apply suffix
    * Trace
    * Store traced suffixes
```

### Key Functions

**processUpdateQueue(accountId)**
- Fetches pending webhooks from queue
- For each webhook:
  1. Apply suffix to campaign (immediate)
  2. Trigger trace via proxy service
  3. Store all traced suffixes in bucket
  4. Mark queue item completed

**triggerTraceAndExtractSuffixes(suffix, campaignName)**
- Builds test URL with suffix
- Calls proxy service trace endpoint
- Extracts suffixes from redirect chain
- Returns array of suffixes to store

**applySuffixUpdate(campaignId, newSuffix)**
- Gets campaign by ID
- Uses `campaign.urls().setFinalUrlSuffix(newSuffix)`
- Updates campaign-level final URL suffix

**checkAndRemoveClickedSuffixes(accountId)**
- Checks each campaign's performance report
- If clicks > 0 today: deletes suffix from bucket
- Keeps bucket "zero-click only"

**checkAndFetchDailyZeroClickSuffixes(accountId)**
- Runs once per 24 hours
- Fetches zero-click suffixes from last 7 days
- Stores in bucket as backup/initial seed

---

## Database Schema

### Suffix Lifecycle

```
1. SEED (Daily)
   - Zero-click suffixes fetched from Google Ads
   - Stored with source='zero_click', times_used=0

2. WEBHOOK (Real-time)
   - Suffix applied to campaign immediately
   - Traced via proxy service
   - All traced suffixes stored with source='webhook'

3. CLEANUP (Daily)
   - Suffixes with clicks detected → deleted
   - Suffixes >7 days old → deleted
   - Suffixes with times_used > 0 → deleted (use-once model)
```

### Key Functions

- `get_next_suffix_from_bucket(p_mapping_id)` - Get oldest unused suffix
- `mark_suffix_used(p_suffix_id)` - Mark as used (times_used = 1)
- `delete_suffix_from_bucket(p_suffix_id)` - Delete specific suffix
- `clean_old_used_suffixes(p_mapping_id)` - Delete used + old suffixes

---

## Configuration

### CONFIG Object

```javascript
OFFER_NAME: 'YOUR_OFFER_NAME_HERE'  // Required
SUPABASE_ANON_KEY: 'YOUR_KEY'       // Required
SUPABASE_URL: 'https://...'         // Auto-filled
PROXY_SERVICE_URL: 'http://...'     // Auto-filled (ALB endpoint)
QUEUE_POLL_INTERVAL_SECONDS: 2      // How often to check for webhooks
MAX_RUNTIME_MINUTES: 28             // Script runtime limit
ZERO_CLICK_LOOKBACK_DAYS: 7         // How far back to fetch zero-click
```

### PropertiesService Keys

- `ZERO_CLICK_LAST_FETCH_{accountId}` - Last zero-click fetch timestamp
- `MAPPING_CREATED_{accountId}_{campaignId}` - Mapping creation flag

---

## Testing Checklist

### Initial Setup
- [ ] Copy script from frontend UI
- [ ] Configure OFFER_NAME and SUPABASE_ANON_KEY
- [ ] Run script preview - verify no errors
- [ ] Schedule to run every 30 minutes

### Auto-Mapping Test
- [ ] Script creates mapping for each campaign
- [ ] Trackier campaign created automatically
- [ ] Webhook URL generated
- [ ] Verify in Supabase: webhook_campaign_mappings table

### Zero-Click Fetch Test
- [ ] Wait for daily fetch (or manually trigger)
- [ ] Verify suffixes in webhook_suffix_bucket
- [ ] Check source='zero_click'
- [ ] Verify times_used=0

### Webhook Processing Test
- [ ] Copy webhook URL to Trackier S2S postback
- [ ] Trigger test conversion in Trackier
- [ ] Verify webhook received (check webhook_suffix_update_queue)
- [ ] Verify queue item processed (status='completed')
- [ ] Check campaign suffix updated in Google Ads
- [ ] Verify traced suffixes stored in bucket (source='webhook')

### Click Detection Test
- [ ] Create campaign with some clicks today
- [ ] Run checkAndRemoveClickedSuffixes
- [ ] Verify suffix deleted from bucket

### End-to-End Test
1. Script runs → auto-mapping → zero-click fetch
2. Configure webhook in Trackier
3. Send test conversion
4. Verify immediate campaign update
5. Verify trace triggered
6. Verify traced suffixes stored
7. Wait 24 hours → verify cleanup

---

## Deployment Status

✅ **Database:** All functions deployed
✅ **Script Logic:** Webhook immediate update implemented
✅ **Tracing:** Integrated with proxy service
✅ **Auto-Mapping:** Creates Trackier campaigns automatically
✅ **Click Detection:** Removes clicked suffixes daily
✅ **Cleanup:** Removes old/used suffixes daily

---

## System Advantages

### Immediate Updates
- ✅ No delay between webhook and campaign update
- ✅ Fresh suffixes applied within seconds
- ✅ Real-time response to conversions

### Automatic Trace
- ✅ Every webhook triggers a trace
- ✅ Keeps bucket populated with latest suffixes
- ✅ Captures entire redirect chain

### Self-Healing
- ✅ Detects and removes clicked suffixes
- ✅ Cleans old suffixes automatically
- ✅ Maintains "zero-click only" status

### Zero Configuration
- ✅ Auto-creates mappings
- ✅ Auto-creates Trackier campaigns
- ✅ Auto-generates webhook URLs
- ✅ User only needs to copy/paste webhook URL

---

## Monitoring

**Check Queue Processing:**
```sql
SELECT status, COUNT(*) 
FROM webhook_suffix_update_queue 
GROUP BY status;
```

**Check Bucket Health:**
```sql
SELECT 
  mapping_id,
  COUNT(*) as total_suffixes,
  COUNT(*) FILTER (WHERE times_used = 0) as unused,
  COUNT(*) FILTER (WHERE source = 'webhook') as from_webhook,
  COUNT(*) FILTER (WHERE source = 'zero_click') as from_zero_click
FROM webhook_suffix_bucket
GROUP BY mapping_id;
```

**Check Recent Updates:**
```sql
SELECT * 
FROM webhook_suffix_usage_log 
WHERE action = 'applied' 
ORDER BY timestamp DESC 
LIMIT 10;
```

---

## Next Steps

1. ✅ Database deployed
2. ✅ Script updated
3. ⏳ Copy script to Google Ads
4. ⏳ Schedule every 30 minutes
5. ⏳ Configure webhook in Trackier
6. ⏳ Monitor first webhook processing
7. ⏳ Verify trace functionality
8. ⏳ Confirm suffixes stored in bucket
