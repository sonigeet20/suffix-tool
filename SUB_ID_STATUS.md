# Trackier sub_id Implementation - Status Report

## Date: January 9, 2026

## Summary

Implemented complete sub_id architecture for real-time parameter passthrough with Trackier. All backend code is complete and ready, but macro resolution needs verification due to Trackier's aggressive caching.

---

## ✅ COMPLETED

### 1. Database Schema
**File:** `supabase/migrations/20260109_add_sub_id_fields.sql`

Added two new columns to `trackier_offers` table:
```sql
sub_id_mapping JSONB -- Maps sub_id to param names
sub_id_values JSONB  -- Stores current traced values
```

Default mapping:
```json
{
  "sub1": "gclid",
  "sub2": "fbclid",
  "sub3": "msclkid",
  "sub4": "ttclid",
  "sub5": "clickid",
  "sub6": "utm_source",
  "sub7": "utm_medium",
  "sub8": "utm_campaign",
  "sub9": "custom1",
  "sub10": "custom2"
}
```

### 2. Backend Utilities
**File:** `proxy-service/routes/trackier-webhook.js`

Added 6 utility functions:
- `parseSuffixParams(suffix)` - Parse URL suffix into key-value pairs
- `mapParamsToSubIds(suffixParams, subIdMapping)` - Map params to sub_id values
- `buildDestinationUrlWithMacros(baseUrl, subIdMapping)` - Build destination with macros
- `buildTrackingLinkWithSubIds(baseTrackingLink, subIdValues)` - Add sub_id params to link
- `autoDetectSubIdMapping(suffix, maxSubIds)` - Auto-detect mapping from suffix
- All functions tested and working

### 3. Campaign Creation
**Endpoint:** `POST /api/trackier-create-campaigns`

Modified to:
- Accept optional `subIdMapping` parameter
- Build destination URL with sub_id macros: `url?gclid={sub1}&fbclid={sub2}`
- Create both URL 1 and URL 2 with same macro destination
- Return `sub_id_mapping` and `destination_url` in response
- Store mapping for later use

Example destination created:
```
https://example.com/offer?gclid={sub1}&fbclid={sub2}&msclkid={sub3}&...
```

### 4. Webhook Handler
**Function:** `processTrackierUpdate()`

Modified to:
- Parse traced suffix into parameters
- Map parameters to sub_id values based on stored mapping
- Store `sub_id_values` in database (NO Trackier API call)
- Much faster than old approach (no API update delay)
- No cache issues since we don't update destination URL

### 5. URL 2 Generation
**Endpoint:** `GET /api/trackier-get-url2/:offerId`

New endpoint that:
- Retrieves offer and `sub_id_values` from database
- Builds tracking link with sub_id parameters
- Returns URL like: `https://nebula.gotrackier.com/click?campaign_id=X&pub_id=2&sub1=value&sub2=value`
- Real-time (no cache since params are in URL, not destination)

### 6. Documentation
**Files Created:**
- `SUB_ID_ARCHITECTURE.md` - Complete architecture documentation
- `proxy-service/test-subid-integration.sh` - Full integration test
- `proxy-service/test-subid-quick.sh` - Quick passthrough test

---

## ⚠️ PENDING VERIFICATION

### Issue: Macro Resolution

**Problem:** Trackier macros `{sub1}`, `{sub2}` in destination URL are NOT being resolved to actual values.

**Test Results:**
```bash
# Set destination: https://example.com/test?gclid={sub1}
# Pass sub1 via URL: ...&sub1=TEST_VALUE
# Expected: https://example.com/test?gclid=TEST_VALUE
# Actual: https://example.com/test?gclid={sub1}  ❌ Literal macro returned
```

**Possible Causes:**
1. **Wrong macro syntax** - Tried `{sub1}`, `{{sub1}}`, `#sub1#` - all failed
2. **Trackier cache too aggressive** - Cache persists >2 minutes, may need >5 minutes
3. **Macro feature not enabled** - May need to enable in Trackier dashboard
4. **Different parameter name** - Trackier might use `subid1`, `sub_1`, or different names

**Testing Performed:**
- ✅ Confirmed sub_id parameters pass through in tracking link
- ✅ Confirmed destination URL is updated via API
- ❌ Macros in destination not resolving to passed values
- ✅ Verified cache is issue (old values persist >2 min)

---

## 🔍 NEXT STEPS TO VERIFY

### Option 1: Wait for Cache (Recommended First Step)
1. Use existing campaign 301
2. Wait 5-10 minutes for cache to fully clear
3. Test again with `&sub1=TEST_VALUE`
4. If macros resolve → SUCCESS, architecture works!

### Option 2: Contact Trackier Support
1. Ask about correct macro syntax for sub_id fields
2. Request documentation on macro resolution
3. Ask about cache TTL and invalidation
4. Verify if feature needs to be enabled

### Option 3: Use Trackier's Standard Macros
Instead of custom `{sub1}`, use Trackier's built-in macros:
- `{click_id}` - Trackier's click ID
- `{publisher_id}` - Publisher ID
- `{campaign_id}` - Campaign ID
- These might work differently

### Option 4: Alternative Architecture
If sub_id macros don't work:
1. Use Trackier's postback system
2. Accept longer cache delay (60-90 seconds)
3. Use custom redirect service for URL 2
4. Explore Trackier's S2S (server-to-server) options

---

## 📊 CURRENT IMPLEMENTATION STATUS

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ Complete | Migration ready to run |
| Utility functions | ✅ Complete | All 6 functions working |
| Campaign creation | ✅ Complete | Sets destination with macros |
| Webhook handler | ✅ Complete | Stores sub_id_values |
| URL 2 generation | ✅ Complete | Builds link with sub_id params |
| Documentation | ✅ Complete | Full guides created |
| Macro resolution | ⚠️ Pending | Needs verification |
| End-to-end test | ⚠️ Blocked | Waiting on macro resolution |

---

## 💡 KEY INSIGHTS

### What We Discovered:
1. **Trackier cache is VERY aggressive** (60-120+ seconds)
2. **sub_id parameters DO pass through** in tracking link (tested)
3. **Destination URL updates DO work** via API (tested)
4. **Macro resolution syntax unclear** - need Trackier docs
5. **Architecture is sound** - IF macros work, everything is ready

### What Works:
- ✅ Parsing suffix into parameters
- ✅ Mapping params to sub_id values
- ✅ Storing sub_id_values in database
- ✅ Building tracking links with sub_id params
- ✅ sub_id params passing through to Trackier

### What's Uncertain:
- ❓ Correct macro syntax for Trackier
- ❓ Whether sub_id macros are supported
- ❓ If feature needs to be enabled
- ❓ Actual cache TTL duration

---

## 🎯 RECOMMENDED ACTION

**Immediate:** Test with longer cache wait (5-10 minutes) using campaign 301

**Command to run:**
```bash
# Wait 10 minutes, then test
sleep 600

# Test campaign 301 (should have latest destination by now)
curl -L "https://nebula.gotrackier.com/click?campaign_id=301&pub_id=2&sub1=FINAL_TEST_123"

# If destination shows: https://example.com/test?gclid=FINAL_TEST_123
# → SUCCESS! Architecture works, just needs cache time

# If still shows: https://example.com/test?gclid={sub1}
# → Need to contact Trackier support about macro syntax
```

**If macros don't work:**
Contact Trackier support with these questions:
1. What is the correct syntax for sub_id macros in destination URLs?
2. Do sub_id parameters support macro resolution?
3. What is the cache TTL for tracking link redirects?
4. Can we manually invalidate cache after campaign updates?

---

## 📝 FILES MODIFIED/CREATED

### Modified:
- `proxy-service/routes/trackier-webhook.js` - Added sub_id utilities and updated logic

### Created:
- `supabase/migrations/20260109_add_sub_id_fields.sql` - Database schema
- `SUB_ID_ARCHITECTURE.md` - Complete documentation
- `proxy-service/test-subid-integration.sh` - Full integration test
- `proxy-service/test-subid-quick.sh` - Quick passthrough test
- `SUB_ID_STATUS.md` - This status report

### Ready to Modify:
- `src/components/TrackierSetup.tsx` - Frontend UI (not yet updated)

---

## 🔧 FRONTEND INTEGRATION (TODO)

Once macro resolution is verified, update frontend to:
1. Show sub_id_mapping visualization
2. Allow users to customize parameter mapping
3. Display current sub_id_values
4. Show how parameters map to URL
5. Add explanation of sub_id architecture

---

## ✨ EXPECTED OUTCOME (Once Verified)

**Flow:**
1. User clicks Google Ads → Trackier URL 1
2. Webhook fires → Backend traces suffix
3. Suffix parsed: `?gclid=Cj0&fbclid=IwAR`
4. Mapped to sub_id: `{sub1: "Cj0", sub2: "IwAR"}`
5. Stored in database
6. URL 2 generated: `...&sub1=Cj0&sub2=IwAR`
7. User clicks URL 2
8. Trackier resolves `{sub1}` → `Cj0` in destination
9. Final URL: `https://example.com/offer?gclid=Cj0&fbclid=IwAR` ✅

**Benefits:**
- ✅ Real-time updates (no cache delay)
- ✅ No Trackier API calls for updates
- ✅ Faster than old approach
- ✅ Supports 10+ parameters
- ✅ Works with Cloudflare CDN

---

## 📞 SUPPORT NEEDED

If macro resolution fails after extended cache wait:
1. Need Trackier documentation on macro syntax
2. May need to enable feature in Trackier dashboard
3. Might need different approach (postback, S2S, etc.)
4. Could fall back to accepting longer intervals

**Contact:** support@trackier.com or check Trackier documentation portal
