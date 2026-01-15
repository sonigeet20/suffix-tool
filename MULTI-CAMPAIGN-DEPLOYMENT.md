# Multi-Campaign Trackier Deployment Guide

## Prerequisites Checklist

- [ ] Supabase CLI installed (`brew install supabase/tap/supabase`)
- [ ] Database credentials available (`$DATABASE_URL` or Supabase dashboard)
- [ ] Backend server access (SSH to EC2 or PM2 access)
- [ ] Edge function deployment access (Supabase project access)

## Deployment Steps

### Step 1: Deploy Database Migration (5 minutes)

```bash
# Navigate to project root
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"

# Connect to Supabase database
supabase db push

# OR if using direct PostgreSQL:
# psql $DATABASE_URL -f supabase/migrations/20260115000000_add_trackier_multi_pair.sql

# Verify migration
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trackier_offers' AND column_name = 'additional_pairs';"

# Expected output: additional_pairs | jsonb
```

**Verification:**
```sql
-- Check existing offers were migrated
SELECT 
  id, 
  offer_name, 
  jsonb_array_length(additional_pairs) as pair_count,
  additional_pairs->0->>'webhook_token' as primary_webhook_token
FROM trackier_offers
LIMIT 5;
```

### Step 2: Deploy Backend API (5 minutes)

```bash
# Navigate to proxy-service
cd proxy-service

# Pull latest code (if using git)
# git pull origin main

# Install dependencies (if package.json changed)
# npm install

# Restart PM2 processes
pm2 restart all

# Verify restart
pm2 logs --lines 50

# Check for errors
pm2 status
```

**Test backend endpoint:**
```bash
# Test pair management API is loaded
curl http://localhost:3000/api/trackier-aggregate-stats/test-offer-id

# Expected: 404 (not found) but API responds, not "Cannot GET"
```

### Step 3: Deploy Edge Function (5 minutes)

```bash
# Ensure you're logged into Supabase
supabase login

# Link project (if not already linked)
supabase link --project-ref rfhuqenntxiqurplenjn

# Deploy edge function
cd supabase/functions
supabase functions deploy trackier-webhook --no-verify-jwt

# Verify deployment
supabase functions list

# Check logs
supabase functions logs trackier-webhook --tail
```

**Test edge function:**
```bash
# Test with invalid token (should fail gracefully)
curl -X POST \
  "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=test-invalid&campaign_id=999999" \
  -H "Content-Type: application/json" \
  -d '{"data": {"conversionStatus": "PENDING"}}'

# Expected: Error response about invalid offer/token
```

### Step 4: Deploy Frontend (10 minutes)

```bash
# Navigate to project root
cd "/Users/geetsoni/Downloads/suffix-tool-main 2"

# Build frontend
npm run build

# If using Vercel/Netlify:
# vercel --prod
# netlify deploy --prod

# If self-hosting:
# Copy dist/ to web server
# rsync -avz dist/ user@server:/var/www/html/
```

### Step 5: Smoke Test (15 minutes)

#### 5.1 Test Single-Pair Creation (Backwards Compatibility)

1. Open frontend in browser
2. Select an offer without existing Trackier config
3. Enter Trackier credentials
4. Set "Number of Pairs" to **1**
5. Click "Create 1 Pair"
6. Verify:
   - ✅ 2 campaigns created (URL1 + URL2)
   - ✅ 1 template generated
   - ✅ Webhook URL displayed
   - ✅ Primary pair shows in UI

#### 5.2 Test Multi-Pair Creation

1. Select a different offer
2. Set "Number of Pairs" to **3**
3. Click "Create 3 Pairs"
4. Wait ~10 seconds (500ms delay * 6 campaigns)
5. Verify:
   - ✅ 6 campaigns created in Trackier dashboard
   - ✅ 3 pairs displayed in UI grid
   - ✅ Each pair has unique webhook URL
   - ✅ CSV export button appears
   - ✅ Can copy individual templates

#### 5.3 Test Webhook Routing

**Test Pair 1 Webhook (Legacy Token):**
```bash
# Get offer ID from database
OFFER_ID=$(psql $DATABASE_URL -tAc "SELECT id FROM trackier_offers WHERE offer_name LIKE '%Test%' LIMIT 1")

# Fire webhook using offer ID as token (legacy)
curl -X POST \
  "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=$OFFER_ID&campaign_id=12345" \
  -H "Content-Type: application/json" \
  -d '{"data": {"conversionStatus": "PENDING", "payout": "10.00"}}'

# Check logs
psql $DATABASE_URL -c "SELECT * FROM trackier_webhook_logs ORDER BY created_at DESC LIMIT 1;"
```

**Test Pair 2 Webhook (New Token):**
```bash
# Get pair 2 webhook token
PAIR2_TOKEN=$(psql $DATABASE_URL -tAc "SELECT additional_pairs->1->>'webhook_token' FROM trackier_offers WHERE id = '$OFFER_ID'")

# Fire webhook using pair-specific token
curl -X POST \
  "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=$PAIR2_TOKEN&campaign_id=12346" \
  -H "Content-Type: application/json" \
  -d '{"data": {"conversionStatus": "PENDING"}}'

# Verify pair_index = 2 in logs
psql $DATABASE_URL -c "SELECT pair_index, pair_webhook_token FROM trackier_webhook_logs ORDER BY created_at DESC LIMIT 1;"
```

#### 5.4 Test Pair Statistics

```bash
# Query database for pair stats
psql $DATABASE_URL -c "
SELECT 
  id,
  offer_name,
  jsonb_array_length(additional_pairs) as pair_count,
  (additional_pairs->0->>'webhook_count')::int as pair1_webhooks,
  (additional_pairs->1->>'webhook_count')::int as pair2_webhooks
FROM trackier_offers
WHERE id = '$OFFER_ID';
"

# Expected: pair1_webhooks = 1, pair2_webhooks = 1
```

#### 5.5 Test Aggregate Stats API

```bash
# Call aggregate stats endpoint
curl http://localhost:3000/api/trackier-aggregate-stats/$OFFER_ID

# Expected JSON:
{
  "success": true,
  "stats": {
    "total_pairs": 3,
    "enabled_pairs": 3,
    "total_webhook_count": 2,
    "pairs": [
      {"pair_index": 1, "webhook_count": 1, ...},
      {"pair_index": 2, "webhook_count": 1, ...},
      {"pair_index": 3, "webhook_count": 0, ...}
    ]
  }
}
```

### Step 6: Full Integration Test (20 minutes)

#### Test Scenario: Create 5 Pairs, Fire Real Webhooks

1. **Create offer with 5 pairs**
   ```bash
   # Via API (or use frontend)
   curl -X POST http://localhost:3000/api/trackier-create-campaigns \
     -H "Content-Type: application/json" \
     -d '{
       "apiKey": "YOUR_API_KEY",
       "apiBaseUrl": "https://nebula.gotrackier.com",
       "advertiserId": "123",
       "offerName": "Integration Test Offer",
       "finalUrl": "https://example.com",
       "webhookUrl": "https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook",
       "campaign_count": 5
     }'
   ```

2. **Configure S2S webhooks in Trackier**
   - Go to Trackier dashboard
   - Edit each URL1 campaign (5 total)
   - Enable "Server Side Clicks"
   - Paste corresponding webhook URL from response
   - Save each campaign

3. **Generate real clicks**
   - Create Google Ads campaigns using templates
   - Generate 5 clicks (one per pair)
   - Wait for Trackier to fire webhooks

4. **Verify routing**
   ```sql
   -- Check all pairs received webhooks
   SELECT 
     offer_id,
     pair_index,
     COUNT(*) as webhook_count
   FROM trackier_webhook_logs
   WHERE offer_id = '<OFFER_ID>'
   GROUP BY offer_id, pair_index
   ORDER BY pair_index;
   
   -- Expected: 5 rows (pair_index 1-5), each with count >= 1
   ```

5. **Verify URL2 updates**
   ```sql
   -- Check each pair's URL2 was updated independently
   SELECT 
     id,
     offer_name,
     additional_pairs->0->>'update_count' as pair1_updates,
     additional_pairs->1->>'update_count' as pair2_updates,
     additional_pairs->2->>'update_count' as pair3_updates,
     additional_pairs->3->>'update_count' as pair4_updates,
     additional_pairs->4->>'update_count' as pair5_updates
   FROM trackier_offers
   WHERE id = '<OFFER_ID>';
   
   -- Expected: Each pair has update_count >= 1
   ```

## Testing Checklist

### Unit Tests

- [ ] Database migration creates `additional_pairs` column
- [ ] Migration copies existing offers to new format
- [ ] `update_trackier_pair_stats()` function increments counts
- [ ] Materialized view aggregates stats correctly

### API Tests

- [ ] `POST /api/trackier-create-campaigns` with `campaign_count=1` creates 1 pair
- [ ] `POST /api/trackier-create-campaigns` with `campaign_count=10` creates 10 pairs
- [ ] `PATCH /api/trackier-pair/:offerId/:pairIndex` updates pair name
- [ ] `DELETE /api/trackier-pair/:offerId/:pairIndex` disables pair
- [ ] `GET /api/trackier-aggregate-stats/:offerId` returns correct totals

### Edge Function Tests

- [ ] Webhook with token=offer_id routes to pair 1 (legacy)
- [ ] Webhook with token=webhook_token routes to correct pair
- [ ] Webhook with fallback campaign_id routes correctly
- [ ] Invalid token returns 404 error
- [ ] Disabled pair webhook still logs but doesn't update

### Frontend Tests

- [ ] Campaign count input accepts 1-20
- [ ] Create button shows "Create N Pairs"
- [ ] Pairs grid displays all created pairs
- [ ] Copy buttons work for templates and webhooks
- [ ] CSV export includes all pairs
- [ ] Stats update in real-time

### Integration Tests

- [ ] Real webhook from Trackier updates only target pair
- [ ] Multiple simultaneous webhooks route independently
- [ ] Aggregate stats match sum of individual pairs
- [ ] Existing single-pair offers continue working

## Performance Monitoring

### Database Queries

```sql
-- Check additional_pairs query performance
EXPLAIN ANALYZE
SELECT * FROM trackier_offers
WHERE additional_pairs @> '[{"webhook_token": "test-token"}]';

-- Should use GIN index (< 10ms)

-- Check materialized view performance
EXPLAIN ANALYZE
SELECT * FROM trackier_offer_aggregate_stats
WHERE offer_id = '<OFFER_ID>';

-- Should be instant (< 1ms)
```

### Edge Function Logs

```bash
# Monitor webhook routing performance
supabase functions logs trackier-webhook --tail | grep "duration"

# Look for: "Webhook processed in Xms" (should be < 500ms)
```

### Backend Logs

```bash
# Monitor PM2 logs
pm2 logs trackier-webhook --lines 100 | grep "Webhook"

# Check for errors or slow traces
```

## Rollback Procedure

If issues occur, rollback in reverse order:

### 1. Rollback Frontend (Immediate)

```bash
# Revert to previous build
git checkout HEAD~1 -- src/components/TrackierSetup.tsx
npm run build
# Redeploy
```

### 2. Rollback Backend (30 seconds)

```bash
cd proxy-service
git checkout HEAD~1 -- routes/trackier-webhook.js routes/trackier-pair-management.js server.js
pm2 restart all
```

### 3. Rollback Edge Function (1 minute)

```bash
cd supabase/functions/trackier-webhook
git checkout HEAD~1 -- index.ts
supabase functions deploy trackier-webhook --no-verify-jwt
```

### 4. Rollback Database (Last Resort)

```sql
-- Drop new objects (keeps data!)
DROP MATERIALIZED VIEW IF EXISTS trackier_offer_aggregate_stats;
DROP FUNCTION IF EXISTS update_trackier_pair_stats;
DROP FUNCTION IF EXISTS jsonb_set_value;

-- Keep additional_pairs column - data is safe
-- Existing offers still work via legacy columns

-- To fully remove (destructive):
ALTER TABLE trackier_offers DROP COLUMN IF EXISTS additional_pairs;
ALTER TABLE trackier_webhook_logs DROP COLUMN IF EXISTS pair_index;
ALTER TABLE trackier_webhook_logs DROP COLUMN IF EXISTS pair_webhook_token;
```

## Success Criteria

Deployment is successful when:

1. ✅ Database migration completes without errors
2. ✅ Backend restarts with no crashes
3. ✅ Edge function deploys successfully
4. ✅ Frontend loads without console errors
5. ✅ Can create 1-pair offers (backwards compatible)
6. ✅ Can create 10-pair offers
7. ✅ Webhooks route to correct pairs
8. ✅ Pair stats increment independently
9. ✅ CSV export works
10. ✅ No errors in logs for 1 hour post-deployment

## Monitoring Post-Deployment

### First 24 Hours

```bash
# Watch edge function logs continuously
supabase functions logs trackier-webhook --tail

# Check for errors
pm2 logs --err

# Monitor database load
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### First Week

- Daily check of aggregate statistics accuracy
- Monitor webhook routing success rate (should be 99%+)
- Check for any pair-specific anomalies
- Verify CSV exports contain correct data

### Refresh Materialized View (Weekly)

```sql
-- Refresh aggregate stats view
REFRESH MATERIALIZED VIEW trackier_offer_aggregate_stats;

-- Or set up cron job:
-- 0 0 * * 0 psql $DATABASE_URL -c "REFRESH MATERIALIZED VIEW trackier_offer_aggregate_stats;"
```

## Troubleshooting

### Issue: Webhook not routing to correct pair

**Diagnosis:**
```sql
-- Check webhook logs
SELECT * FROM trackier_webhook_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Look for pair_index and pair_webhook_token columns
```

**Fix:**
- Verify token parameter in webhook URL
- Check token exists in additional_pairs array
- Ensure edge function deployed correctly

### Issue: Pair stats not incrementing

**Diagnosis:**
```sql
-- Check if RPC function exists
SELECT proname FROM pg_proc WHERE proname = 'update_trackier_pair_stats';

-- Check function execution
SELECT * FROM trackier_webhook_logs 
WHERE error IS NOT NULL
ORDER BY created_at DESC LIMIT 10;
```

**Fix:**
- Re-run migration if function missing
- Check function permissions
- Verify JSONB path is correct

### Issue: Frontend not showing pairs

**Diagnosis:**
- Open browser console (F12)
- Check for JavaScript errors
- Verify API response includes `pairs` array

**Fix:**
- Clear browser cache
- Check API response format
- Verify `pairsData` state is set correctly

## Contact & Support

For issues during deployment:

1. Check logs first (edge function, PM2, database)
2. Verify each step completed successfully
3. Use rollback procedure if critical
4. Review testing checklist for missed steps

Deployment estimated time: **45-60 minutes** for all steps + testing
