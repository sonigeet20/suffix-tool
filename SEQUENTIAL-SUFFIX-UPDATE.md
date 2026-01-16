# Sequential Suffix Update System - Implementation Complete

## Overview

Transformed the webhook suffix system from a **rotation-based** model to a **sequential use-once** model with automatic cleanup.

## Key Changes

### 1. Database Functions (webhook_suffix_system.sql)

**Added:**
- `delete_suffix_from_bucket(p_suffix_id)` - Delete a specific suffix from bucket
- `clean_old_used_suffixes(p_mapping_id)` - Auto-clean suffixes that are:
  - Already used (times_used > 0)
  - Older than 7 days (fetched_at < NOW() - INTERVAL '7 days')

**Modified:**
- `get_next_suffix_from_bucket(p_mapping_id)` - Now returns only **unused suffixes** (times_used = 0) in **sequential order** (ORDER BY id ASC)

### 2. Google Ads Script Logic (Scripts.tsx)

#### Timing Changes
- **REMOVED:** 10-minute rotation interval
- **ADDED:** Daily sequential update (once per 24 hours)
- Uses PropertiesService to track last update: `SUFFIX_UPDATE_LAST_RUN_{accountId}`

#### New Functions

**checkAndUpdateSuffixesDaily(accountId)**
- Checks if 24 hours have passed since last update
- Calls `updateCampaignSuffixesSequentially()` if needed
- Stores timestamp in PropertiesService

**updateCampaignSuffixesSequentially(accountId)**
- Iterates all campaign mappings
- Cleans old/used suffixes first (via `cleanOldUsedSuffixes()`)
- Gets next **unused** suffix from bucket (sequential order)
- Applies suffix to campaign (campaign-level final URL suffix)
- Marks suffix as used (times_used = 1, can never be reused)

**checkAndRemoveClickedSuffixes(accountId)**
- Checks each campaign's current suffix for clicks TODAY
- If clicks > 0: Deletes suffix from bucket immediately
- Uses Google Ads CAMPAIGN_PERFORMANCE_REPORT
- Prevents clicked suffixes from being counted as "zero-click"

**cleanOldUsedSuffixes(mappingId)**
- Calls Supabase RPC `clean_old_used_suffixes`
- Removes suffixes matching:
  - `times_used > 0` (already used)
  - `fetched_at < NOW() - INTERVAL '7 days'` (older than 7 days)
- Logs count of deleted suffixes

**deleteSuffixFromBucket(mappingId, suffix)**
- Finds suffix by hash
- Deletes via RPC `delete_suffix_from_bucket`
- Used when suffix receives clicks

#### Modified Functions

**getNextSuffixFromBucket(mappingId)**
- Now queries: `times_used=eq.0` (only unused)
- Order: `id.asc` (sequential, oldest first)
- Returns first unused suffix, or null if bucket empty

**main()**
- Step 1: Auto-mapping (unchanged)
- Step 2: Daily zero-click fetch (unchanged)
- Step 3: **NEW** - Daily sequential suffix update
- Step 4: **NEW** - Check and remove clicked suffixes
- Step 5: Continuous queue polling (no more rotation in loop)

## System Flow

### Daily Operations (Once per 24 hours)

1. **Zero-Click Fetch** (unchanged)
   - Fetch all zero-click suffixes from last 7 days
   - Store in bucket with `source='zero_click'`

2. **Sequential Update** (NEW)
   - Clean old (>7 days) and used (times_used > 0) suffixes
   - Get next unused suffix (oldest first)
   - Apply to campaign final URL suffix
   - Mark as used (times_used = 1)
   - **Suffix never reused**

3. **Click Detection** (NEW)
   - Check if current campaign suffixes have clicks today
   - Delete from bucket if clicked
   - Ensures "zero-click" status is maintained

### Real-Time Operations (Continuous)

1. **Webhook Processing** (unchanged)
   - Receive webhook → Store suffix in bucket
   - Suffix will be used in next daily update

### Suffix Lifecycle

```
1. Fetch from Google Ads (zero-click) OR Receive from webhook
   ↓
2. Store in bucket (times_used = 0, is_valid = true)
   ↓
3. Wait for daily sequential update
   ↓
4. Get next unused suffix (sequential order)
   ↓
5. Apply to campaign final URL suffix
   ↓
6. Mark as used (times_used = 1)
   ↓
7. Auto-deleted if:
   - Receives clicks (detected daily)
   - Already used (times_used > 0)
   - Older than 7 days
```

## Benefits

### Use-Once Model
- Each suffix used exactly once
- No risk of over-using suffixes
- Clean slate every cycle

### Automatic Cleanup
- Old suffixes (>7 days) auto-deleted
- Used suffixes auto-deleted
- Clicked suffixes immediately removed
- Keeps bucket fresh and relevant

### Sequential Order
- Oldest suffixes used first (FIFO)
- Predictable, linear progression
- No rotation complexity

### Daily Timing
- Less frequent updates = more stable
- Aligns with zero-click fetch timing
- Reduces API calls

## Configuration

**PropertiesService Keys:**
- `ZERO_CLICK_LAST_FETCH_{accountId}` - Last zero-click fetch timestamp
- `SUFFIX_UPDATE_LAST_RUN_{accountId}` - Last sequential update timestamp

**Database Functions:**
- `get_next_suffix_from_bucket(p_mapping_id)` - Get next unused suffix
- `mark_suffix_used(p_suffix_id)` - Increment usage counter
- `clean_old_used_suffixes(p_mapping_id)` - Delete old/used suffixes
- `delete_suffix_from_bucket(p_suffix_id)` - Delete specific suffix

## Testing Checklist

- [ ] Deploy database migration (webhook_suffix_system.sql)
- [ ] Copy updated script from frontend UI
- [ ] Configure OFFER_NAME and SUPABASE_ANON_KEY
- [ ] Run script preview in Google Ads
- [ ] Verify Step 3 (Sequential Update) runs once
- [ ] Verify Step 4 (Click Detection) runs
- [ ] Check suffixes are marked as used (times_used = 1)
- [ ] Send test webhook, verify stored in bucket
- [ ] Wait 24 hours, verify next suffix applied
- [ ] Create campaign with clicks, verify suffix deleted

## Migration Notes

### From Rotation to Sequential

**Old Behavior:**
- Rotated suffixes every 10 minutes
- Used least-used suffix (times_used ASC)
- Could reuse suffixes indefinitely

**New Behavior:**
- Updates suffixes once per day
- Uses oldest unused suffix (id ASC, times_used = 0)
- Each suffix used exactly once
- Auto-cleanup after use or after 7 days

### Backward Compatibility

Existing suffixes in bucket will work with new system:
- Unused suffixes (times_used = 0) will be picked up sequentially
- Used suffixes (times_used > 0) will be auto-deleted on next update
- Old suffixes (>7 days) will be auto-deleted

## Deployment Status

- ✅ Database functions added
- ✅ Script functions updated
- ✅ Main() flow restructured
- ✅ Click detection implemented
- ✅ Auto-cleanup implemented
- ⏳ Ready for Google Ads deployment

## Next Steps

1. Deploy database migration to Supabase
2. Test script in Google Ads preview
3. Schedule script to run every 30 minutes
4. Monitor first 24-hour cycle
5. Verify suffixes are used once and cleaned up
