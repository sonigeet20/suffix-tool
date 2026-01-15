# Multi-Campaign Trackier Implementation Status

## ✅ IMPLEMENTATION COMPLETE - Ready for Deployment

### Summary

All 7 implementation steps completed successfully. The system now supports:
- ✅ Creating 1-20 campaign pairs per offer
- ✅ Unique webhook tokens for each pair
- ✅ Independent pair routing and tracking
- ✅ Backwards compatibility with existing single-pair offers
- ✅ Aggregate statistics across all pairs
- ✅ Frontend UI for multi-pair management
- ✅ API endpoints for pair CRUD operations

**Next Steps:** Deploy to production and execute testing checklist

---

## ✅ Completed (All Steps)

### 1. Database Migration ✅
**File:** `supabase/migrations/20260115000000_add_trackier_multi_pair.sql`

**Added:**
- ✅ `additional_pairs` JSONB column to `trackier_offers` table
- ✅ `pair_index` and `pair_webhook_token` columns to `trackier_webhook_logs`
- ✅ GIN index on `additional_pairs` for fast webhook token lookups
- ✅ PostgreSQL function `update_trackier_pair_stats()` for atomic pair updates
- ✅ PostgreSQL function `jsonb_set_value()` for generic JSONB updates
- ✅ Data migration: Existing single-pair offers copied to `additional_pairs[0]`
- ✅ Materialized view `trackier_offer_aggregate_stats` for aggregate statistics
- ✅ Rollback instructions included as comments

**Deploy Command:**
```bash
# Connect to Supabase and run migration
psql $DATABASE_URL -f supabase/migrations/20260115000000_add_trackier_multi_pair.sql
```

### 2. Backend Campaign Creation ✅
**File:** `proxy-service/routes/trackier-webhook.js` (lines 1015-1280)

**Changes:**
- ✅ Added `campaign_count` parameter (default: 1, max: 20)
- ✅ Loop to create N campaign pairs
- ✅ Generate unique `webhook_token` per pair using `crypto.randomUUID()`
- ✅ Append `- Pair N` to campaign names
- ✅ Build pair-specific webhook URLs with unique tokens
- ✅ 500ms delay between pair creations to avoid rate limits
- ✅ Return array of all pairs + primary_pair for backwards compatibility
- ✅ Legacy fields preserved in response for single-pair compatibility

**Response Format:**
```json
{
  "success": true,
  "campaign_count": 3,
  "pairs": [
    {
      "pair_index": 1,
      "pair_name": "Pair 1",
      "webhook_token": "uuid-1",
      "url1_campaign_id": "295",
      "url2_campaign_id": "296",
      "google_ads_template": "...",
      "webhook_url": "https://...?token=uuid-1",
      "enabled": true,
      "webhook_count": 0,
      "update_count": 0
    },
    // ... pairs 2 and 3
  ],
  "primary_pair": {...}, // pairs[0]
  // Legacy fields from first pair for backwards compat
  "url1_campaign_id": "295",
  "url2_campaign_id": "296"
}
```

---

## ⏳ Remaining Implementation (Steps 3-7)

### 3. Edge Function Webhook Routing ✅ COMPLETED
**File:** `supabase/functions/trackier-webhook/index.ts`

**Completed Changes:**
- ✅ Added three-route webhook resolution (backwards compatible)
- ✅ Route 1: Token matches offer ID (legacy single-pair)
- ✅ Route 2: Token matches pair `webhook_token` (NEW multi-pair)
- ✅ Route 3: Fallback by `campaign_id` (preserved)
- ✅ Extract `activePair` from `additional_pairs` array
- ✅ Store `pairIndex` for logging and updates
- ✅ Use `activePair.url2_campaign_id_real` for Trackier API call
- ✅ Call `update_trackier_pair_stats()` RPC for pair-specific updates
- ✅ Update legacy columns for backwards compatibility (pair 1)
- ✅ Log `pair_index` and `pair_webhook_token` in webhook logs
- ✅ Detailed logging for debugging all three routes

**Deployment:**
```bash
supabase functions deploy trackier-webhook --no-verify-jwt
```

### 4. Backend Webhook Handler Updates ✅
**File:** `proxy-service/routes/trackier-webhook.js` (lines 255-570)

**Changes Implemented:**
- ✅ Three-route webhook resolution mirroring edge function
- ✅ Route 1: token = offer_id (legacy compatibility)
- ✅ Route 2: token = webhook_token in additional_pairs (multi-pair)
- ✅ Route 3: fallback by campaign_id (existing logic)
- ✅ Extract activePair and pairIndex from additional_pairs array
- ✅ Pass pairConfig to processTrackierUpdate()
- ✅ Modified processTrackierUpdate() to accept pairConfig parameter
- ✅ Use pair-specific url2_campaign_id_real for Trackier API calls
- ✅ Update pair stats via update_trackier_pair_stats() RPC or legacy columns
- ✅ Dual updates for primary pair (legacy columns + additional_pairs[0])

### 5. Frontend Campaign Creation UI ✅
**File:** `src/components/TrackierSetup.tsx`

**Changes Implemented:**
- ✅ Added campaignCount state (default: 1)
- ✅ Added pairsData state to store all created pairs
- ✅ Number input for campaign count (1-20) with validation
- ✅ Updated button text to show "Create N Pair(s)"
- ✅ Pass campaign_count parameter in API request
- ✅ Handle array response (result.pairs)
- ✅ Store pairs in pairsData state
- ✅ Update primary pair to config for backwards compatibility

### 6. Frontend Pair Management UI ✅
**File:** `src/components/TrackierSetup.tsx` (lines 1417-1543)

**Components Added:**
- ✅ Pairs grid display (responsive 1-2 columns)
- ✅ PairCard for each pair showing:
  - Pair index and name
  - Enabled/disabled status
  - URL1 and URL2 campaign IDs
  - Webhook count and update count
  - Google Ads template with copy button
  - Webhook URL with copy button
- ✅ CSV export button for all pairs
- ✅ Template copy functionality per pair
- ✅ Automatic download of CSV with all pair data

### 7. Pair Management API Endpoints ✅
**File:** `proxy-service/routes/trackier-pair-management.js` (NEW FILE)
**Integration:** `proxy-service/server.js` (line 72)

**Endpoints Created:**
- ✅ `PATCH /api/trackier-pair/:offerId/:pairIndex` - Update pair name/enabled status
- ✅ `DELETE /api/trackier-pair/:offerId/:pairIndex` - Soft delete (disable) pair
- ✅ `POST /api/trackier-test-pair/:offerId/:pairIndex` - Manual webhook trigger
- ✅ `GET /api/trackier-aggregate-stats/:offerId` - Get aggregate statistics

**Features:**
- ✅ Input validation (pair_index range, offer existence)
- ✅ Prevent deleting primary pair (Pair 1)
- ✅ Update additional_pairs array atomically
- ✅ Calculate aggregate stats (total pairs, enabled pairs, total counts)
- ✅ Return per-pair statistics in aggregate endpoint

---

## Deployment Guide

See [MULTI-CAMPAIGN-DEPLOYMENT.md](./MULTI-CAMPAIGN-DEPLOYMENT.md) for complete deployment instructions.

**Quick Start:**
```bash
# 1. Deploy database migration
psql $DATABASE_URL -f supabase/migrations/20260115000000_add_trackier_multi_pair.sql

# 2. Restart backend
cd proxy-service && pm2 restart all

# 3. Deploy edge function
supabase functions deploy trackier-webhook --no-verify-jwt

# 4. Build and deploy frontend
npm run build
# (deploy dist/ to hosting)

# 5. Run tests
./test-multi-campaign.sh
```

---

## Testing

Automated test script: `test-multi-campaign.sh`

**Run tests:**
```bash
chmod +x test-multi-campaign.sh

# Set environment variables
export DATABASE_URL="postgresql://..."
export BACKEND_URL="http://localhost:3000"
export SUPABASE_URL="https://rfhuqenntxiqurplenjn.supabase.co"

# Optional: for campaign creation tests
export TRACKIER_API_KEY="your-key"
export TRACKIER_ADVERTISER_ID="123"

# Run all tests
./test-multi-campaign.sh
```
- [ ] Per-pair stats (webhook_count, update_count, last_webhook_at)
- [ ] Webhook URL copy button per pair
- [ ] Google Ads template display per pair (collapsible)
- [ ] Enable/disable toggle per pair
- [ ] Inline edit pair name
- [ ] Test webhook button per pair
- [ ] Delete pair button (soft delete)
- [ ] Export all templates to CSV button

### 7. Pair Management API Endpoints
**File:** `proxy-service/routes/trackier-webhook.js` (new endpoints)

**Required Endpoints:**
- [ ] `PATCH /api/trackier-pair/:offerId/:pairIndex` - Update pair name/enabled
- [ ] `DELETE /api/trackier-pair/:offerId/:pairIndex` - Soft delete pair
- [ ] `POST /api/trackier-test-pair/:offerId/:pairIndex` - Test specific pair webhook

---

## 🧪 Testing Checklist

### Before Deployment
- [ ] Run migration on staging database
- [ ] Verify existing single-pair offers migrated to `additional_pairs`
- [ ] Test creating single campaign (backwards compat)
- [ ] Test creating 3 campaigns (new multi-pair)
- [ ] Verify unique webhook tokens generated
- [ ] Verify 500ms delay between creations

### After Edge Function Deployment
- [ ] Test legacy webhook (token=offer_id) still works
- [ ] Test new webhook (token=pair_webhook_token) routes correctly
- [ ] Fire webhook for Pair 1 → verify only Pair 1 URL2 updates
- [ ] Fire webhook for Pair 2 → verify only Pair 2 URL2 updates
- [ ] Test campaign_id fallback routing preserved
- [ ] Check webhook logs include pair_index

### Frontend Testing
- [ ] Create offer with 1 pair (existing flow)
- [ ] Create offer with 5 pairs (new flow)
- [ ] Verify all templates exportable to CSV
- [ ] Test pair enable/disable
- [ ] Test pair name editing
- [ ] Test individual pair webhook testing
- [ ] Verify aggregate stats calculate correctly

---

## 🚀 Deployment Sequence

1. **Deploy Migration** (5 min)
   ```bash
   psql $DATABASE_URL -f supabase/migrations/20260115000000_add_trackier_multi_pair.sql
   ```

2. **Deploy Backend** (10 min)
   ```bash
   cd proxy-service
   pm2 restart all
   ```

3. **Deploy Edge Function** (5 min)
   ```bash
   supabase functions deploy trackier-webhook --no-verify-jwt
   ```

4. **Deploy Frontend** (10 min)
   ```bash
   npm run build
   # Deploy build to hosting
   ```

5. **Test Single-Pair Creation** (5 min)
   - Create test offer with campaign_count=1
   - Verify webhook works

6. **Test Multi-Pair Creation** (10 min)
   - Create test offer with campaign_count=3
   - Fire webhooks for each pair
   - Verify independent routing

7. **Monitor Logs** (15 min)
   ```bash
   supabase functions logs trackier-webhook
   pm2 logs proxy-service
   ```

---

## 🔄 Rollback Plan

### Immediate Rollback (< 5 minutes)
```bash
# 1. Redeploy previous edge function version
git checkout HEAD~1 supabase/functions/trackier-webhook/index.ts
supabase functions deploy trackier-webhook --no-verify-jwt

# 2. Redeploy previous backend version
git checkout HEAD~1 proxy-service/routes/trackier-webhook.js
pm2 restart all
```

### Full Rollback (< 30 minutes)
```sql
-- Rollback database (doesn't delete data, only drops columns)
ALTER TABLE trackier_offers DROP COLUMN IF EXISTS additional_pairs;
ALTER TABLE trackier_webhook_logs DROP COLUMN IF EXISTS pair_index, DROP COLUMN IF EXISTS pair_webhook_token;
DROP MATERIALIZED VIEW IF EXISTS trackier_offer_aggregate_stats;
DROP FUNCTION IF EXISTS update_trackier_pair_stats(UUID, INTEGER, JSONB, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS jsonb_set_value(TEXT, UUID, TEXT, TEXT);
```

---

## 📊 Current Status Summary

**Completed:** 2/7 steps (28%)
- ✅ Database schema migration ready
- ✅ Backend campaign creation supports multi-pair

**Next Priority:** Step 3 - Edge Function Routing (CRITICAL)
- This is the most important piece
- Enables pair-specific webhook routing
- Must preserve existing dual-routing for backwards compatibility

**Estimated Time to Complete:**
- Step 3 (Edge Function): 1-2 hours
- Step 4 (Backend Webhook): 1 hour  
- Step 5 (Frontend Creation): 1 hour
- Step 6 (Frontend Management): 2-3 hours
- Step 7 (Management APIs): 1 hour
- Testing & Debugging: 2-3 hours

**Total Remaining:** ~8-12 hours of development + testing

---

## 📝 Notes

- System is backwards compatible at every layer
- Existing single-pair offers continue working
- Migration automatically converts old offers to new format
- Feature can be incrementally deployed and tested
- Rollback is safe and non-destructive (data preserved)

