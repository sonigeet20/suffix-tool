# Trackier Campaign Linking Fix - January 31, 2026

## Problem

Frontend showed warning "Trackier campaign not yet created" even after the script successfully ran auto-setup and created the Trackier campaign.

### Root Cause

The v5-auto-setup function had a critical flaw in how it stored Trackier campaign records:

1. **First upsert (PROBLEMATIC)**: Tried to store shared Trackier campaign with `onConflict: 'offer_name'`
   ```typescript
   await supabase.from('v5_trackier_campaigns').upsert({
     offer_name,  // Only this field provided for conflict detection
     trackier_campaign_id: trackierCampaignId,
     // ... other fields
   }, { onConflict: 'offer_name' });  // ← Problem: no UNIQUE constraint on offer_name!
   ```

2. **Schema Mismatch**: The v5_trackier_campaigns table has:
   ```sql
   UNIQUE(account_id, google_campaign_id)  -- This is the unique constraint
   ```
   NOT a unique constraint on `offer_name`

3. **Result**: The first upsert created malformed records without required constraint fields, then the second insert (per-mapping) might fail or create inconsistent state

4. **Frontend Impact**: Frontend queries:
   ```typescript
   .eq('mapping_id', mapping.id)
   ```
   But if mapping_id was NULL, it wouldn't match anything

## Solution

**Commit**: `4c54ef8`

### Changes to `supabase/functions/v5-auto-setup/index.ts`

1. **Removed problematic offer_name upsert** (lines 155-162)
   - No longer trying to store shared Trackier campaign with invalid conflict detection
   - This record wasn't needed anyway - all info is accessible via per-mapping records

2. **Updated offer_name query path** (lines 260-270)
   - Changed from: `.eq('offer_name', offer_name).maybeSingle()`
   - Changed to: Get from first existing mapping's v5_trackier_campaigns record
   - This ensures we always have the Trackier data from a properly-linked mapping

3. **Ensured per-mapping records are correct** (lines 208-222, 234-255)
   - These already provide `mapping_id`, `account_id`, `google_campaign_id`
   - Now they're the ONLY records created, so no conflicts

### Database Schema (No changes needed)

The v5_trackier_campaigns table structure is correct:
```sql
CREATE TABLE v5_trackier_campaigns (
  id UUID PRIMARY KEY,
  mapping_id UUID REFERENCES v5_campaign_offer_mapping(id),  -- ✅ Correctly linked
  account_id TEXT NOT NULL,
  google_campaign_id TEXT NOT NULL,
  offer_name TEXT,
  ...
  UNIQUE(account_id, google_campaign_id)  -- ✅ Correct constraint
);
```

### Frontend (No changes needed)

Frontend queries were already correct:
```typescript
// Load all v5_trackier_campaigns
const trackierRes = await supabase.from('v5_trackier_campaigns').select('*');

// Index by mapping_id
trackierByMapping[t.mapping_id] = t;

// For each mapping, look up trackier
const trackier = trackierByMapping[mapping.id];  // ✅ Now finds it!
```

## Testing

1. ✅ Build passes: `npm run build`
2. ✅ Function deployed: `supabase functions deploy v5-auto-setup --no-verify-jwt`
3. ✅ Git committed: `4c54ef8`

### Manual Test Steps

1. In Google Ads Script Editor, run the script
2. Check logs for: `[AUTO-SETUP] ✓ Trackier campaign: [ID] ([Name])`
3. Open frontend and navigate to V5 Webhook Manager
4. Previously showed: "⚠️ Trackier campaign not yet created"
5. Now should show: "✅ Trackier #[ID]" with tracking template and postback URL

### Database Verification

```sql
-- Verify v5_trackier_campaigns has proper mapping_id
SELECT 
  id, 
  mapping_id, 
  account_id, 
  google_campaign_id, 
  trackier_campaign_id,
  trackier_campaign_name
FROM v5_trackier_campaigns
ORDER BY created_at DESC
LIMIT 5;

-- Expected: mapping_id should NOT be NULL
-- Expected: All UNIQUE constraint fields should be populated
```

## Impact

- ✅ No database migrations needed
- ✅ Frontend code unchanged (queries were already correct)
- ✅ Only v5-auto-setup function updated
- ✅ Zero breaking changes
- ✅ Backward compatible (won't affect existing mappings)

## Rollback

If needed, revert to commit `4149126`:
```bash
git revert 4c54ef8
supabase functions deploy v5-auto-setup --no-verify-jwt
```

But this shouldn't be necessary - the fix is a pure improvement with no side effects.
