# Webhook Suffix Update System - Complete Setup Guide

## 🎯 Overview

This system provides **webhook-triggered Google Ads suffix updates** with **zero-click suffix recycling**. It's completely independent from existing flows and enables:

- ✅ Map multiple Google Ads campaigns to offers (multi-account support)
- ✅ Each mapping gets its own Trackier campaign and webhook URL
- ✅ Webhooks trigger instant Google Ads suffix updates (1-2 second latency)
- ✅ Auto-fetch zero-click suffixes daily from Google Ads reports
- ✅ Maintain 20-100 suffix bucket per campaign
- ✅ Trigger traces when bucket is empty

## 📋 System Components

### 1. Database (Supabase)
- **4 new tables**: `webhook_campaign_mappings`, `webhook_suffix_bucket`, `webhook_suffix_update_queue`, `webhook_suffix_usage_log`
- **3 PostgreSQL functions**: `get_next_suffix_from_bucket()`, `mark_suffix_used()`, `get_bucket_status()`
- **File**: `supabase/migrations/webhook_suffix_system.sql`

### 2. Backend (Node.js/Express)
- **Campaign management**: `/api/webhook-campaign/*` endpoints
- **Webhook handler**: `/api/webhook-suffix/*` endpoints
- **Files**: 
  - `proxy-service/routes/webhook-campaign.js`
  - `proxy-service/routes/webhook-suffix-handler.js`

### 3. Frontend (React/TypeScript)
- **Campaign mapper UI**: Create and manage mappings
- **File**: `src/components/WebhookCampaignMapper.tsx`

### 4. Google Ads Script
- **Queue processor**: Polls for updates every 2 seconds
- **Zero-click fetcher**: Fetches suffixes once daily
- **Bucket manager**: Auto-refills when low
- **File**: `google-ads-scripts/webhook-updater-with-bucket.gs`

---

## 🚀 Step-by-Step Setup

### Step 1: Deploy Database Schema

**Run the SQL migration in Supabase:**

1. Go to Supabase Dashboard → SQL Editor
2. Open `supabase/migrations/webhook_suffix_system.sql`
3. Execute the entire script
4. Verify tables created:
   ```sql
   SELECT tablename FROM pg_tables 
   WHERE tablename LIKE 'webhook%';
   ```

**Expected output:**
```
webhook_campaign_mappings
webhook_suffix_bucket
webhook_suffix_update_queue
webhook_suffix_usage_log
```

---

### Step 2: Deploy Backend Routes

**Add new routes to Express server:**

1. Open `proxy-service/server.js`
2. Add route imports:
   ```javascript
   const webhookCampaignRoutes = require('./routes/webhook-campaign');
   const webhookSuffixRoutes = require('./routes/webhook-suffix-handler');
   ```

3. Register routes:
   ```javascript
   app.use('/api/webhook-campaign', webhookCampaignRoutes);
   app.use('/api/webhook-suffix', webhookSuffixRoutes);
   ```

4. Ensure environment variables are set:
   ```bash
   export SUPABASE_URL=https://rfhuqenntxiqurplenjn.supabase.co
   export SUPABASE_SERVICE_KEY=your_service_role_key_here
   export TRACKIER_API_KEY=your_trackier_api_key_here
   export PROXY_SERVICE_URL=https://your-alb-domain.com
   ```

5. Restart server:
   ```bash
   pm2 restart proxy-service
   ```

**Test endpoints:**
```bash
# Health check
curl http://localhost:3000/api/webhook-suffix/health

# List mappings (should return empty array initially)
curl http://localhost:3000/api/webhook-campaign/list
```

---

### Step 3: Deploy Frontend Component

**Add to your React app:**

1. Import component in your main app:
   ```typescript
   // In src/App.tsx or appropriate parent
   import { WebhookCampaignMapper } from './components/WebhookCampaignMapper';
   ```

2. Add to your UI:
   ```tsx
   <div className="webhook-mapper-section">
     <WebhookCampaignMapper />
   </div>
   ```

3. Update `.env` file:
   ```
   VITE_PROXY_SERVICE_URL=https://your-alb-domain.com
   ```

4. Build and deploy:
   ```bash
   npm run build
   # Deploy to your hosting
   ```

---

### Step 4: Deploy Google Ads Script

**Create new script in Google Ads:**

1. Go to Google Ads → Tools → Scripts
2. Click **+ NEW SCRIPT**
3. Name: `WEBHOOK-UPDATER-WITH-BUCKET`
4. Paste code from `google-ads-scripts/webhook-updater-with-bucket.gs`

5. **Update configuration**:
   ```javascript
   const CONFIG = {
     SUPABASE_URL: 'https://rfhuqenntxiqurplenjn.supabase.co',
     SUPABASE_ANON_KEY: 'your_anon_key_here', // Get from Supabase → Settings → API
     // ... rest of config
   };
   ```

6. **Schedule the script**:
   - Click **Run frequency**
   - Select **Every 30 minutes**
   - Enable script
   - Click **Save**

7. **Test the script**:
   - Click **Preview**
   - Check logs for errors
   - Should see: `=== WEBHOOK SUFFIX UPDATER WITH BUCKET STARTED ===`

---

## 🔧 Usage Workflow

### Creating a New Campaign Mapping

**Via Frontend UI:**

1. Open your app and navigate to Webhook Campaign Mapper
2. Click **+ New Mapping**
3. Fill in form:
   - **Account ID**: `123-456-7890` (Google Ads customer ID)
   - **Campaign ID**: `12345678` (Google Ads campaign ID)
   - **Campaign Name**: `My Campaign` (optional, for display)
   - **Offer Name**: `ULTRAHUMAN_WW` (your offer identifier)
   - **Offer ID**: `offer_123` (optional)
4. Click **Create Mapping**

**What happens:**
- ✅ Creates new Trackier campaign with `redirectType: '200_hrf'`
- ✅ Generates webhook URL like: `https://your-domain.com/api/webhook-suffix/receive/407`
- ✅ Stores mapping in database
- ✅ Returns webhook URL to configure in Trackier

### Configuring Trackier Webhook

1. Copy webhook URL from frontend (e.g., `https://your-domain.com/api/webhook-suffix/receive/407`)
2. Go to Trackier → Campaigns → [Your Campaign] → Postback URL
3. Set **S2S Postback URL**:
   ```
   https://your-domain.com/api/webhook-suffix/receive/407?click_id={clickid}&txn_id={txn_id}&p1={p1}&p2={p2}&p3={p3}&p4={p4}&p5={p5}
   ```
4. Save configuration

### How Webhooks Work

**Flow:**
```
1. User clicks Google Ad
   ↓
2. Goes to Trackier URL (with your suffix)
   ↓
3. Trackier fires S2S webhook to your endpoint
   ↓
4. Backend gets next suffix from bucket
   ↓
5. Queues suffix update in Supabase
   ↓
6. Google Ads script polls queue (every 2 seconds)
   ↓
7. Script applies new suffix to campaign
   ↓
8. Next click gets fresh suffix (1-2 second latency)
```

---

## 🪣 Zero-Click Suffix Recycling

### How It Works

**Daily Automatic Fetch:**
1. Google Ads script runs every 30 minutes
2. Once per day, checks if 24 hours passed since last fetch
3. Queries Google Ads for zero-click URLs:
   ```
   SELECT final_urls FROM ad_group_ad
   WHERE campaign_id = X
   AND clicks = 0
   AND impressions > 0
   AND date DURING LAST_7_DAYS
   ```
4. Extracts suffixes from final URLs
5. Stores in `webhook_suffix_bucket` table
6. Maintains 20-100 suffix inventory per campaign

**Auto-Refill:**
- Script checks bucket levels every 60 seconds
- If bucket < 20 suffixes: triggers immediate fetch
- Targets 50 suffixes per bucket
- Max 100 suffixes fetched per campaign per run

### Bucket Status Monitoring

**Via Frontend:**
- Each mapping card shows:
  - Total Suffixes
  - Valid Suffixes
  - Total Usage
  - Last Fetch Date

**Via API:**
```bash
# Get mapping details with bucket status
curl http://your-domain.com/api/webhook-campaign/:mappingId
```

---

## 🔍 Testing & Verification

### Test 1: Create Campaign Mapping

```bash
curl -X POST http://your-domain.com/api/webhook-campaign/create \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "123-456-7890",
    "campaignId": "12345678",
    "campaignName": "Test Campaign",
    "offerName": "TEST_OFFER"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "mapping": {
    "mapping_id": "uuid-here",
    "trackier_campaign_id": 407,
    "trackier_webhook_url": "https://your-domain.com/api/webhook-suffix/receive/407"
  }
}
```

### Test 2: Trigger Webhook

```bash
curl "http://your-domain.com/api/webhook-suffix/receive/407?click_id=test123&p1=value1"
```

**Expected response:**
```json
{
  "success": true,
  "message": "Suffix update queued",
  "suffix": "?p1=value1&p2=value2...",
  "bucket_remaining": 45
}
```

### Test 3: Check Queue

```sql
-- In Supabase SQL Editor
SELECT * FROM webhook_suffix_update_queue 
WHERE status = 'pending' 
ORDER BY webhook_received_at DESC;
```

### Test 4: Verify Google Ads Script

1. Go to Google Ads → Scripts
2. Click on `WEBHOOK-UPDATER-WITH-BUCKET`
3. Click **Logs** tab
4. Should see:
   ```
   === WEBHOOK SUFFIX UPDATER WITH BUCKET STARTED ===
   📥 Found 1 pending queue items
   ✅ Updated campaign 12345678 with new suffix
   ✅ Processed 1 queue items
   ```

### Test 5: Check Campaign Suffix Updated

```bash
# Via Google Ads API or UI
# Campaign → Settings → Campaign URL options → Final URL suffix
# Should show the new suffix
```

---

## 📊 Monitoring & Maintenance

### Database Queries

**Active mappings:**
```sql
SELECT offer_name, campaign_id, trackier_campaign_id, is_active
FROM webhook_campaign_mappings
WHERE is_active = true;
```

**Bucket status:**
```sql
SELECT 
  m.offer_name,
  COUNT(b.id) as total_suffixes,
  COUNT(b.id) FILTER (WHERE b.is_valid) as valid_suffixes,
  AVG(b.times_used) as avg_usage
FROM webhook_campaign_mappings m
LEFT JOIN webhook_suffix_bucket b ON b.mapping_id = m.mapping_id
GROUP BY m.offer_name;
```

**Recent webhooks:**
```sql
SELECT * FROM webhook_suffix_usage_log
WHERE action = 'applied'
ORDER BY timestamp DESC
LIMIT 50;
```

**Queue performance:**
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - webhook_received_at))) as avg_latency_seconds
FROM webhook_suffix_update_queue
WHERE webhook_received_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

### Cleanup Jobs

**Remove old completed queue items:**
```sql
DELETE FROM webhook_suffix_update_queue
WHERE status = 'completed'
AND completed_at < NOW() - INTERVAL '7 days';
```

**Archive old usage logs:**
```sql
DELETE FROM webhook_suffix_usage_log
WHERE timestamp < NOW() - INTERVAL '30 days';
```

**Invalidate old suffixes:**
```sql
UPDATE webhook_suffix_bucket
SET is_valid = false
WHERE fetched_at < NOW() - INTERVAL '30 days'
AND times_used = 0;
```

---

## 🐛 Troubleshooting

### Issue: Webhook not receiving requests

**Check:**
1. Verify webhook URL is correct in Trackier
2. Check backend logs: `pm2 logs proxy-service`
3. Test endpoint directly: `curl https://your-domain.com/api/webhook-suffix/health`
4. Check firewall/security groups allow inbound traffic

### Issue: Queue not being processed

**Check:**
1. Google Ads script is enabled and scheduled
2. Check script logs for errors
3. Verify SUPABASE_ANON_KEY is correct
4. Check queue table: `SELECT * FROM webhook_suffix_update_queue WHERE status = 'pending'`

### Issue: Bucket not refilling

**Check:**
1. Script last fetch time: Check PropertiesService in script
2. Verify campaign has ads with zero clicks
3. Check GAQL query works:
   ```javascript
   SELECT ad_group_ad.ad.final_urls 
   FROM ad_group_ad 
   WHERE campaign.id = 12345678 
   AND metrics.clicks = 0 
   AND segments.date DURING LAST_7_DAYS
   ```
4. Check bucket table: `SELECT COUNT(*) FROM webhook_suffix_bucket WHERE mapping_id = 'uuid'`

### Issue: Campaign suffix not updating

**Check:**
1. Campaign ID is correct (matches Google Ads)
2. Script has permissions to modify campaigns
3. Check queue item status: `SELECT * FROM webhook_suffix_update_queue WHERE campaign_id = '12345678'`
4. Check script execution logs

---

## 🔐 Security Considerations

1. **Supabase RLS Policies**: Consider enabling Row Level Security
2. **API Rate Limiting**: Add rate limiting to webhook endpoints
3. **Webhook Validation**: Verify Trackier webhook signatures
4. **Secret Management**: Use environment variables, never commit keys
5. **HTTPS Only**: Always use HTTPS for webhooks

---

## 📈 Performance Optimization

**Queue Processing:**
- Current: 2-second polling interval
- Optimize: Reduce to 1 second for faster updates
- Consider: Supabase real-time subscriptions instead of polling

**Zero-Click Fetching:**
- Current: Once per 24 hours
- Optimize: Fetch more frequently for high-volume campaigns
- Consider: Event-driven fetch when bucket < threshold

**Bucket Management:**
- Current: 20-100 suffixes per campaign
- Optimize: Adjust based on campaign click volume
- Consider: Predictive refill based on usage patterns

---

## 🎉 Success Metrics

After setup, you should see:

- ✅ **Webhook latency**: 1-2 seconds from click to suffix update
- ✅ **Bucket health**: 30-80 suffixes per active campaign
- ✅ **Queue processing**: <5 seconds to process each update
- ✅ **Zero-click fetch**: Runs daily, adds 20-50 suffixes per campaign
- ✅ **System uptime**: 99%+ (Google Ads scripts + backend)

---

## 📞 Support & Maintenance

**Key Files Reference:**
- Database: `supabase/migrations/webhook_suffix_system.sql`
- Backend Campaign: `proxy-service/routes/webhook-campaign.js`
- Backend Webhook: `proxy-service/routes/webhook-suffix-handler.js`
- Frontend: `src/components/WebhookCampaignMapper.tsx`
- Google Ads: `google-ads-scripts/webhook-updater-with-bucket.gs`

**Logs:**
- Backend: `pm2 logs proxy-service`
- Google Ads: Scripts → WEBHOOK-UPDATER-WITH-BUCKET → Logs
- Database: Supabase Dashboard → Logs

**Monitoring Endpoints:**
- Health: `GET /api/webhook-suffix/health`
- Mappings: `GET /api/webhook-campaign/list`
- Mapping Details: `GET /api/webhook-campaign/:mappingId`

---

## 🚀 Next Steps

1. ✅ Deploy database schema
2. ✅ Deploy backend routes
3. ✅ Deploy frontend component
4. ✅ Deploy Google Ads script
5. ✅ Create first campaign mapping
6. ✅ Configure Trackier webhook
7. ✅ Test end-to-end flow
8. ✅ Monitor for 24 hours
9. ✅ Optimize based on metrics

---

**System is completely independent and won't affect existing flows! 🎯**
