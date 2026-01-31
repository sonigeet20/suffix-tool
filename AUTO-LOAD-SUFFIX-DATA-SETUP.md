# Auto-Load Suffix Data - Setup Instructions

## Overview
V5WebhookManager now automatically loads bucket inventory for all accounts on startup, eliminating the need to manually enter Account IDs and click "Load Data".

## What Changed
- ✅ Frontend updated to call `v5_get_bucket_inventory_all_accounts()` during initial load
- ✅ Hierarchical view displays suffix data instantly for all accounts
- ⏳ **PENDING**: SQL function needs to be created in Supabase database

## How to Apply the SQL Function

### Option 1: Via Supabase Studio (Recommended)
1. Go to https://app.supabase.com → Your Project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste this SQL:

```sql
CREATE OR REPLACE FUNCTION v5_get_bucket_inventory_all_accounts()
RETURNS TABLE(
  account_id TEXT,
  offer_name TEXT,
  total_suffixes BIGINT,
  unused_suffixes BIGINT,
  used_suffixes BIGINT,
  traced_count BIGINT,
  zero_click_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vsb.account_id,
    vsb.offer_name,
    COUNT(*) AS total_suffixes,
    COUNT(*) FILTER (WHERE vsb.times_used = 0) AS unused_suffixes,
    COUNT(*) FILTER (WHERE vsb.times_used > 0) AS used_suffixes,
    COUNT(*) FILTER (WHERE vsb.source = 'traced') AS traced_count,
    COUNT(*) FILTER (WHERE vsb.source = 'zero_click') AS zero_click_count
  FROM v5_suffix_bucket vsb
  WHERE vsb.is_valid = TRUE
  GROUP BY vsb.account_id, vsb.offer_name
  ORDER BY vsb.account_id, vsb.offer_name;
END;
$$ LANGUAGE plpgsql STABLE;
```

5. Click **Run** button
6. You should see: "Query executed successfully"

### Option 2: Via Terminal/CLI
If migration deployment gets fixed:
```bash
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
npx supabase migration up --linked
```

## Verification
After applying the SQL function, test in the V5WebhookManager:
1. Load the page - suffix data should appear for all accounts automatically
2. Check the hierarchical view - account-level bucket sizing should be visible
3. Campaigns should display with their associated offer and account grouping

## Benefits
✅ **Instant visibility** - No manual data loading needed
✅ **All accounts** - See suffix inventory for every account in one load
✅ **Performance** - Single RPC call instead of N+1 queries
✅ **Better UX** - User opens page and sees complete picture immediately

## Related Files
- Frontend: `src/components/V5WebhookManager.tsx` (updated `loadAllMappings()`)
- Migration: `supabase/migrations/20260131005001_v5_get_bucket_inventory_all.sql`
- Commit: `e9a3221`
