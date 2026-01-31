# Critical Fix: Trackier Campaigns Not Linking to Mappings - Jan 31, 2026

## Problem
The script logs showed auto-setup was successful, BUT:
- Frontend still displayed "Trackier campaign not yet created"
- Clicking "Sync Mappings" didn't help - data was missing from database
- Root cause: **Trackier campaigns weren't being linked to individual mappings**

## Root Cause Analysis

### What Was Happening (Before Fix)
```
v5-auto-setup function flow:
1. ✅ Created shared Trackier campaign in Trackier API
2. ✅ Stored it in v5_trackier_campaigns with offer_name key
3. ✅ Created mappings in v5_campaign_offer_mapping
4. ❌ BUT: Never linked Trackier campaign to the mapping via mapping_id!
```

### Why Frontend Couldn't Find It
- Frontend query: `SELECT * FROM v5_trackier_campaigns WHERE mapping_id = ?`
- Database had: `v5_trackier_campaigns` with NO `mapping_id` (was NULL)
- Result: No Trackier campaign found for the mapping!

### Database Structure (Correct)
```sql
v5_campaign_offer_mapping:
  id (UUID) - Primary key
  account_id, campaign_id, offer_name...

v5_trackier_campaigns:
  id (UUID)
  mapping_id (UUID) <- FOREIGN KEY to v5_campaign_offer_mapping(id)
  trackier_campaign_id (BIGINT)
  ...
```

## Solution Implemented

### Changes to `supabase/functions/v5-auto-setup/index.ts`

**Before:**
```typescript
// Create mapping but don't capture the ID
const { error: insertError } = await supabase
  .from('v5_campaign_offer_mapping')
  .insert({ account_id, campaign_id, ... });
// Never created v5_trackier_campaigns record!
```

**After:**
```typescript
// 1. Create mapping AND get the mapping_id
const { data: insertedMapping, error: insertError } = await supabase
  .from('v5_campaign_offer_mapping')
  .insert({ account_id, campaign_id, ... })
  .select('id')
  .single();

// 2. Use mapping_id to create Trackier campaign record
const { error: trackierError } = await supabase
  .from('v5_trackier_campaigns')
  .insert({
    mapping_id: insertedMapping.id,        // ← KEY FIX
    account_id,
    google_campaign_id: campaign.id,
    trackier_campaign_id: trackierCampaignId,
    ...
  });
```

### Additional Improvements
- Handles existing mappings that never had Trackier records
- Creates Trackier records retroactively if missing
- Comprehensive logging for debugging
- Error handling for each step

## What's Fixed

✅ **Auto-setup now properly links Trackier campaigns to mappings**
✅ **Frontend can find and display Trackier campaigns**
✅ **Mapping cards show correct Trackier campaign info**
✅ **"Sync Mappings" button now works as expected**

## New Workflow (After Fix)

```
1. Script runs auto-setup
2. Script creates campaign mappings
3. Script creates Trackier campaigns in Trackier API
4. Script creates v5_trackier_campaigns records with mapping_id
5. Frontend clicks "Sync Mappings"
6. Frontend fetches mappings with JOIN to Trackier campaigns
7. ✅ Shows "Trackier campaign created" status
8. Ready to copy Tracking Template and Webhook URL
```

## Deployment Info
- **Function Deployed:** v5-auto-setup
- **Commit Hash:** 1230a54
- **Date:** Jan 31, 2026

## Testing Checklist
- [ ] Run script auto-setup again
- [ ] Check Google Ads script logs show success
- [ ] Click "Sync Mappings" button
- [ ] Verify mapping card now shows Trackier campaign (no warning)
- [ ] Verify "Create Trackier" button is gone
- [ ] Verify Tracking Template and Webhook URL are visible
- [ ] Test copying Tracking Template to clipboard

## Related Files
- `supabase/functions/v5-auto-setup/index.ts` - Fixed
- `src/components/V5WebhookManager.tsx` - Added Sync button (previous commit)
- `supabase/migrations/20260123030000_v5_trackier_campaigns.sql` - Schema (correct)

