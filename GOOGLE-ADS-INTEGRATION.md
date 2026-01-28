# Google Ads Click Tracker - Integration Guide

This guide shows how to safely integrate the Google Ads Click Tracker feature into your existing system. All integrations are **optional and additive** - you can skip any step and the feature will still work (just less convenient).

---

## Overview

The feature is already functional without any integration:
- ✅ Database schema is ready (after migration)
- ✅ Edge functions work standalone
- ✅ Click handler can be called via direct URL
- ✅ Frontend modal exists as standalone component

**Integration only adds convenience** - connecting routes, adding UI buttons, etc.

---

## Step 1: Apply Database Migration (Required)

This is the only required step. Everything else is optional.

```bash
# Via Supabase CLI (recommended)
supabase db push supabase/migrations/20260128_google_ads_click_tracker.sql

# Or via psql
psql $DATABASE_URL -f supabase/migrations/20260128_google_ads_click_tracker.sql
```

Verify:
```sql
-- Should return 2 rows
SELECT tablename FROM pg_tables 
WHERE tablename IN ('geo_suffix_buckets', 'google_ads_click_stats');

-- Should return column
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'offers' AND column_name = 'google_ads_config';
```

---

## Step 2: Deploy Edge Functions (Recommended)

Deploy the three new edge functions to Supabase:

```bash
# Deploy all at once
supabase functions deploy get-suffix-geo
supabase functions deploy fill-geo-buckets
supabase functions deploy cleanup-geo-buckets

# Or deploy individually with custom settings
supabase functions deploy get-suffix-geo --no-verify-jwt
supabase functions deploy fill-geo-buckets --no-verify-jwt
supabase functions deploy cleanup-geo-buckets --no-verify-jwt
```

Test:
```bash
# Should return error "Google Ads feature is disabled" (expected, since not enabled yet)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/get-suffix-geo \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"offer_name": "TEST", "target_country": "US"}'
```

---

## Step 3: Configure Settings (Recommended)

Add tracking domains and enable the feature:

### Via Supabase Dashboard:
1. Go to Table Editor → settings
2. Find your row (usually id=1)
3. Edit these columns:
   - `tracking_domains`: `["ads.day24.online"]` (or your domain)
   - `google_ads_enabled`: `true`

### Via SQL:
```sql
-- Update settings (adjust WHERE clause for your setup)
UPDATE settings 
SET 
  tracking_domains = '["ads.day24.online", "ads.yourdomain.com"]'::jsonb,
  google_ads_enabled = true
WHERE id = 1;
```

Verify:
```sql
SELECT google_ads_enabled, tracking_domains FROM settings;
```

---

## Step 4: Integrate Click Route in server.js (Optional)

This adds the `/click` endpoint to your proxy service. **Optional** because you can also use edge functions directly.

### Find server.js:
Location: `proxy-service/server.js`

### Add at the top with other requires (around line 10-30):
```javascript
// Existing requires...
const express = require('express');
const got = require('got');
// ... other requires ...

// Add this line (place it with other route imports if you have any)
const googleAdsClickHandler = require('./routes/google-ads-click');
```

### Add routes before existing routes (around line 100-150, before app.post('/trace')):
```javascript
// Google Ads Click Tracker Routes (optional feature - can be disabled in settings)
app.get('/click', googleAdsClickHandler.handleClick);
app.get('/click/health', googleAdsClickHandler.handleHealthCheck);
app.get('/click/stats', googleAdsClickHandler.handleBucketStats);

// Existing routes continue...
app.post('/trace', async (req, res) => {
  // ... existing code ...
});
```

### Complete example of where to add:
```javascript
// Around line 100-150 in server.js

// Health check (existing)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Google Ads Click Tracker Routes (NEW - ADD HERE)
const googleAdsClickHandler = require('./routes/google-ads-click');
app.get('/click', googleAdsClickHandler.handleClick);
app.get('/click/health', googleAdsClickHandler.handleHealthCheck);
app.get('/click/stats', googleAdsClickHandler.handleBucketStats);

// Existing trace endpoint
app.post('/trace', async (req, res) => {
  // ... existing code continues unchanged ...
});
```

### Deploy:
```bash
# Copy updated server.js to EC2 instances
scp proxy-service/server.js ec2-user@YOUR_INSTANCE:/home/ec2-user/proxy-service/
scp proxy-service/routes/google-ads-click.js ec2-user@YOUR_INSTANCE:/home/ec2-user/proxy-service/routes/

# Restart service on each instance
ssh ec2-user@YOUR_INSTANCE "cd proxy-service && sudo systemctl restart proxy-service"

# Or if using PM2
ssh ec2-user@YOUR_INSTANCE "cd proxy-service && pm2 restart proxy-service"
```

### Test:
```bash
# Via NLB
curl "http://YOUR_NLB_IP/click?offer_name=TEST_OFFER&url=https://example.com&force_transparent=true"

# Should redirect to example.com (or return error if offer not found)
```

---

## Step 5: Add UI Button to Offer List (Optional)

This adds a "Google Ads" button to each offer in your UI.

### Find OfferList.tsx:
Location: `src/components/OfferList.tsx`

### Add import at the top:
```typescript
// Existing imports...
import { Edit2, Trash2, Copy, ExternalLink, ... } from 'lucide-react';

// Add this import
import GoogleAdsModal from './GoogleAdsModal';
```

### Add state near other state declarations:
```typescript
// Find existing state declarations (around line 20-40)
const [providers, setProviders] = useState<Provider[]>([]);
const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
// ... other state ...

// Add this state
const [googleAdsModalOffer, setGoogleAdsModalOffer] = useState<string | null>(null);
```

### Add button in offer actions:
Find the section where offer actions are rendered (buttons like Edit, Delete, etc.). Usually around line 200-300 in the offer table/list rendering:

```typescript
// Existing buttons
<button
  onClick={() => setEditingOffer(offer)}
  className="p-2 text-neutral-600 hover:text-brand-600 transition-colors"
  title="Edit Offer"
>
  <Edit2 className="w-4 h-4" />
</button>

{/* Add this button */}
<button
  onClick={() => setGoogleAdsModalOffer(offer.offer_name)}
  className="p-2 text-neutral-600 hover:text-green-600 transition-colors"
  title="Google Ads Tracking"
>
  <ExternalLink className="w-4 h-4" />
</button>

{/* Existing delete button, etc. */}
```

### Add modal render at the bottom of the component:
Find the return statement that has other modals (usually at the end, around line 400-500):

```typescript
return (
  <div>
    {/* Existing JSX... */}
    
    {/* Existing modals */}
    {editingOffer && (
      <OfferForm
        offer={editingOffer}
        onClose={() => setEditingOffer(null)}
        onSuccess={loadOffers}
      />
    )}

    {/* Add this modal */}
    {googleAdsModalOffer && (
      <GoogleAdsModal 
        offerName={googleAdsModalOffer}
        onClose={() => setGoogleAdsModalOffer(null)}
      />
    )}
  </div>
);
```

### Build and deploy frontend:
```bash
# Build
npm run build

# Deploy (adjust for your hosting)
# For static hosting:
# cp -r dist/* /var/www/html/

# For Vercel/Netlify:
# Will auto-deploy on git push
```

---

## Step 6: Set Up DNS (Required for Production)

Point your tracking domain to the NLB:

### Via Route 53:
1. Go to Route 53 → Hosted Zones → your domain
2. Create A record:
   - Name: `ads` (for ads.day24.online)
   - Type: `A`
   - Value: `34.226.99.187` (your NLB IP)
   - TTL: `300`

### Via Other DNS Provider:
Create A record pointing `ads.day24.online` to `34.226.99.187`

### Verify:
```bash
# Should return your NLB IP
dig ads.day24.online +short
nslookup ads.day24.online

# Test HTTP (after DNS propagates, ~5-60 minutes)
curl -I http://ads.day24.online/health
```

---

## Step 7: Configure SSL/HTTPS (Recommended)

Add HTTPS support for your tracking domain:

### Option A: AWS Certificate Manager (Recommended)
```bash
# 1. Request certificate in ACM
aws acm request-certificate \
  --domain-name ads.day24.online \
  --validation-method DNS \
  --region us-east-1

# 2. Validate via DNS (ACM will provide CNAME record)
# Add the CNAME to your DNS

# 3. Add HTTPS listener to NLB
aws elbv2 create-listener \
  --load-balancer-arn YOUR_NLB_ARN \
  --protocol TLS \
  --port 443 \
  --certificates CertificateArn=YOUR_CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=YOUR_TG_ARN
```

### Option B: CloudFlare (Free SSL)
1. Add domain to CloudFlare
2. Set DNS A record to NLB IP
3. Enable "Full" SSL mode
4. Done - CloudFlare handles SSL automatically

### Test HTTPS:
```bash
curl -I https://ads.day24.online/health
```

---

## Step 8: Enable for First Offer (Testing)

Now that everything is set up, enable Google Ads for a test offer:

### Via Frontend (if Step 5 completed):
1. Go to your app
2. Click "Google Ads" button on an offer
3. Toggle "Enable Google Ads Tracking" ON
4. Select tracking domain
5. Copy the template URL
6. Click "Fill Buckets" to generate initial suffixes
7. Click "Save Configuration"

### Via SQL (alternative):
```sql
-- Enable for specific offer
UPDATE offers
SET google_ads_config = jsonb_build_object(
  'enabled', true,
  'max_traces_per_day', 1000,
  'apply_filters', false,
  'single_geo_targets', ARRAY['US', 'GB', 'ES', 'DE', 'FR'],
  'multi_geo_targets', ARRAY['US,GB,ES']
)
WHERE offer_name = 'YOUR_TEST_OFFER';
```

### Fill initial buckets:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/fill-geo-buckets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_name": "YOUR_TEST_OFFER",
    "single_geo_targets": ["US", "GB", "ES"],
    "multi_geo_targets": ["US,GB,ES"],
    "single_geo_count": 30,
    "multi_geo_count": 10
  }'
```

### Verify buckets:
```sql
SELECT target_country, COUNT(*) as total, 
       COUNT(*) FILTER (WHERE is_used = false) as available
FROM geo_suffix_buckets
WHERE offer_name = 'YOUR_TEST_OFFER'
GROUP BY target_country;
```

---

## Step 9: Test End-to-End

### Get Template URL:
```sql
SELECT 
  offer_name,
  google_ads_config->>'enabled' as enabled
FROM offers 
WHERE google_ads_config->>'enabled' = 'true';
```

Template format:
```
https://ads.day24.online/click?offer_name=YOUR_OFFER&force_transparent=true&url={lpurl}
```

### Test Click:
```bash
# Replace {lpurl} with actual landing page
curl -I "https://ads.day24.online/click?offer_name=YOUR_OFFER&force_transparent=true&url=https://example.com"

# Should get 302 redirect with suffix appended to example.com
```

### Check Stats:
```sql
-- Today's clicks
SELECT * FROM google_ads_click_stats 
WHERE offer_name = 'YOUR_OFFER' 
AND click_date = CURRENT_DATE;

-- Bucket status
SELECT * FROM geo_suffix_buckets 
WHERE offer_name = 'YOUR_OFFER' 
ORDER BY is_used, traced_at DESC 
LIMIT 10;
```

---

## Step 10: Set Up Monitoring (Optional)

### CloudWatch Alarms:
```bash
# Alert when buckets run low
aws cloudwatch put-metric-alarm \
  --alarm-name google-ads-low-suffixes \
  --alarm-description "Alert when suffix buckets below 5" \
  --metric-name AvailableSuffixes \
  --namespace GoogleAds \
  --statistic Minimum \
  --period 300 \
  --threshold 5 \
  --comparison-operator LessThanThreshold
```

### Cron for Cleanup:
```bash
# Add to crontab (runs daily at 2 AM UTC)
0 2 * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/cleanup-geo-buckets \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days_old": 7, "max_use_count": 1000}'
```

### Cron for Bucket Refill:
```bash
# Runs every 6 hours to maintain bucket levels
0 */6 * * * curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/fill-geo-buckets \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"offer_name": "YOUR_OFFER"}'
```

---

## Integration Checklist

Use this checklist to track integration progress:

- [ ] **Step 1: Database Migration** (REQUIRED)
  - [ ] Migration applied successfully
  - [ ] Tables created (geo_suffix_buckets, google_ads_click_stats)
  - [ ] Columns added (offers.google_ads_config, settings.tracking_domains)
  - [ ] Functions created (get_geo_suffix, increment_click_stats, get_bucket_stats)

- [ ] **Step 2: Edge Functions** (Recommended)
  - [ ] get-suffix-geo deployed
  - [ ] fill-geo-buckets deployed
  - [ ] cleanup-geo-buckets deployed
  - [ ] All functions responding

- [ ] **Step 3: Settings Configuration** (Recommended)
  - [ ] tracking_domains added
  - [ ] google_ads_enabled = true
  - [ ] Settings verified

- [ ] **Step 4: Click Route Integration** (Optional)
  - [ ] google-ads-click.js file copied to EC2
  - [ ] Route added to server.js
  - [ ] Service restarted
  - [ ] /click endpoint responding

- [ ] **Step 5: UI Integration** (Optional)
  - [ ] GoogleAdsModal imported
  - [ ] State added
  - [ ] Button added to offer list
  - [ ] Modal renders correctly
  - [ ] Frontend rebuilt and deployed

- [ ] **Step 6: DNS Configuration** (Required for production)
  - [ ] A record created
  - [ ] DNS propagated
  - [ ] Domain resolving to NLB

- [ ] **Step 7: SSL Configuration** (Recommended)
  - [ ] Certificate requested
  - [ ] Certificate validated
  - [ ] HTTPS listener added to NLB
  - [ ] HTTPS working

- [ ] **Step 8: First Offer Enabled** (Testing)
  - [ ] Test offer configured
  - [ ] Buckets filled
  - [ ] Template generated
  - [ ] Configuration saved

- [ ] **Step 9: End-to-End Test** (Verification)
  - [ ] Click redirect works
  - [ ] Suffix appended correctly
  - [ ] Stats recording
  - [ ] Async trace triggered
  - [ ] Bucket refilled after click

- [ ] **Step 10: Monitoring** (Optional)
  - [ ] CloudWatch alarms set
  - [ ] Cleanup cron configured
  - [ ] Refill cron configured
  - [ ] Logs monitored

---

## Minimal Integration (Quick Start)

If you just want to test the feature with minimal integration:

```bash
# 1. Apply migration
supabase db push supabase/migrations/20260128_google_ads_click_tracker.sql

# 2. Deploy edge functions
supabase functions deploy get-suffix-geo
supabase functions deploy fill-geo-buckets

# 3. Enable in settings
psql $DATABASE_URL -c "UPDATE settings SET google_ads_enabled = true, tracking_domains = '[\"ads.day24.online\"]';"

# 4. Enable for one offer
psql $DATABASE_URL -c "UPDATE offers SET google_ads_config = '{\"enabled\": true}' WHERE offer_name = 'TEST_OFFER';"

# 5. Fill buckets
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/fill-geo-buckets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"offer_name": "TEST_OFFER"}'

# 6. Get template
echo "https://ads.day24.online/click?offer_name=TEST_OFFER&force_transparent=true&url={lpurl}"

# Done! Use in Google Ads.
```

---

## Troubleshooting Integration

### Issue: "Google Ads feature is disabled in settings"
**Solution:** 
```sql
UPDATE settings SET google_ads_enabled = true;
```

### Issue: "No tracking domains configured"
**Solution:**
```sql
UPDATE settings SET tracking_domains = '["ads.day24.online"]';
```

### Issue: /click returns 404
**Solution:** Either:
- Route not added to server.js (add it)
- Or use edge function directly (no server.js needed)

### Issue: Button not showing in UI
**Solution:**
- Check GoogleAdsModal imported
- Check state added
- Check button JSX added
- Rebuild frontend: `npm run build`

### Issue: DNS not resolving
**Solution:**
- Wait for propagation (5-60 minutes)
- Check DNS: `dig ads.day24.online +short`
- Verify A record points to correct NLB IP

### Issue: SSL certificate not working
**Solution:**
- Check certificate status in ACM
- Verify DNS validation complete
- Check NLB listener on port 443
- Verify certificate attached to listener

---

## Integration Without Modifying Existing Files

If you want **zero changes** to existing code, you can still use the feature:

### Use Edge Functions Directly:
Instead of integrating /click route, use edge function:
```
https://YOUR_PROJECT.supabase.co/functions/v1/get-suffix-geo?offer_name=TEST&target_country=US
```

### Use External Redirect Service:
Set up a separate Node.js service just for /click that's independent of your main proxy-service.

### Use Frontend as Standalone App:
Deploy GoogleAdsModal as a separate admin panel at a different URL.

**Result:** Feature works 100% without touching any existing files.

---

## Production Deployment Sequence

For safest production deployment:

1. **Week 1 - Staging:**
   - Deploy to staging environment
   - Run full integration
   - Test thoroughly

2. **Week 2 - Production (Read-Only):**
   - Apply database migration
   - Deploy edge functions
   - Enable in settings
   - Monitor (no traffic yet)

3. **Week 3 - Production (Single Offer):**
   - Enable for 1 test offer
   - Fill buckets
   - Run test campaigns
   - Monitor performance

4. **Week 4+ - Production (Scale):**
   - Enable for more offers
   - Add UI integration
   - Add monitoring
   - Scale up

**Timeline:** 4+ weeks for safe rollout

---

## Summary

✅ **Modular Integration** - Each step is independent  
✅ **Non-Breaking** - No existing code needs modification  
✅ **Gradual Rollout** - Can deploy in phases  
✅ **Safe Rollback** - Can disable at any step  
✅ **Production Ready** - Designed for high traffic  

Start with minimal integration, test, then add optional features as needed.
