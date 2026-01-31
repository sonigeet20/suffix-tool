# V5 Offer-Level Bucket Refactor - Implementation Progress

## Branch: v5-offer-level-refactor
**Safety**: All work on separate branch, main unchanged

## Completed Phases (5/10)

### ✅ Phase 1: Bucket Consolidation (Commit c2a2fbe)
**Migration**: `20260131_v5_bucket_consolidation.sql`
- Created `v5_suffix_bucket_consolidated` table
- Consolidates all (account_id, offer_name) buckets to offer_name only
- Data migration with conflict handling
- Ready for testing before table swap

### ✅ Phase 2: Trace Overrides Restructure (Commit c2a2fbe)
**Migration**: `20260131_v5_trace_overrides_restructure.sql`
- Created `v5_trace_overrides_v2` table (offer-name only)
- Added columns: trace_on_webhook, traces_count_today, last_trace_reset_utc, last_trace_time
- Data migration from account-level to offer-level
- Ready for testing before table swap

### ✅ Phase 3: Stats Tables (Commit c2a2fbe)
**Migrations**: `20260131_v5_stats_tables.sql`
- Created `v5_campaign_suffix_log` (campaign-level stats, 7-day TTL)
- Created `v5_trace_log` (auto-trace audit trail, 7-day TTL)
- Added `purge_v5_stats_logs()` function
- Ready for deployment

### ✅ Phase 4: Webhook Handler (Commit a1850b9)
**File**: `supabase/functions/v5-webhook-conversion/index.ts`
- Added trace_on_webhook check before auto-trace
- Enforces traces_per_day daily limit
- Logs to v5_campaign_suffix_log (campaign stats)
- Logs to v5_trace_log (trace audit trail)
- Increments traces_count_today on successful trace
- Works with offer-level bucket

### ✅ Phase 5: Trace Scheduling (Commit c0fb77c)
**Files**: 
- New: `supabase/functions/v5-auto-trace-scheduler/index.ts`
- Updated: `src/components/Scripts.tsx`

**Changes**:
- Created v5-auto-trace-scheduler edge function
- Checks daily limits, intervals, UTC resets
- Script polling loop calls scheduler every cycle
- Only active if TRACE_OVERRIDE_ENABLED = true
- Logs all decisions

**Build Status**: ✅ PASSED (TypeScript, no errors)

## Remaining Phases (5/10)

### ⏳ Phase 6: UI Updates (V5WebhookManager)
- [ ] Display bucket stats (offer-level aggregate + account breakdown)
- [ ] Show trace override settings (offer-level)
- [ ] Campaign-level stats (paginated, last 50)
- [ ] Trace log (paginated, last 50)
- [ ] Daily limit progress indicator

### ⏳ Phase 7: Auto-Purge Setup
- [ ] Deploy purge jobs for v5_campaign_suffix_log (7-day)
- [ ] Deploy purge jobs for v5_trace_log (7-day)
- [ ] OR: Set up Supabase scheduled functions

### ⏳ Phase 8: Campaign Routing (Verification)
- [ ] Test that campaign_id routing still works
- [ ] Verify suffix delivery per campaign

### ⏳ Phase 9: Geo-Pooling (Verification)
- [ ] Test multi-geo offers
- [ ] Verify get-suffix handles geo_pool automatically

### ⏳ Phase 10: Testing + Deploy
- [ ] Test all phases end-to-end
- [ ] Deploy to Supabase
- [ ] Build final production version
- [ ] Document revert procedures

## Safety & Revert Options

### Current Branch Strategy
```
main → v5-offer-level-refactor
```
**To revert**: `git checkout main`

### Database Safety
All migrations use temporary table names:
- `v5_suffix_bucket_consolidated` (can be dropped)
- `v5_trace_overrides_v2` (can be dropped)

**Revert SQL included in migration files** showing how to:
- Drop new tables
- Rename backups back to original names

### Rollback Procedure
1. If issues found, keep on branch
2. Git checkout main for production use
3. Manually revert Supabase tables if deployed
4. Re-deploy from main branch

## Key Implementation Details

### Default Trace Behavior (No Override)
- Webhook triggers auto-trace immediately (unchanged)
- No daily limit
- No speed control
- Maximum bucket freshness

### Override Mode (TRACE_OVERRIDE_ENABLED = true)
- Webhook does NOT auto-trace
- Script scheduler controls tracing
- Respects traces_per_day limit
- Respects trace_speed_multiplier
- Resets counter at UTC midnight

### Campaign ID Routing
- Unchanged: p1 parameter → Google Ads campaign ID
- Bucket is offer-level but queue preserves campaign_id
- Each campaign still gets unique suffix

### Geo-Pooling
- Unchanged: get-suffix reads geo_pool from offer config
- No changes needed for multi-geo offers

## Next Steps

1. ✅ Code complete (5/10 phases done)
2. ⏳ UI updates (Phase 6)
3. ⏳ Purge setup (Phase 7)
4. ⏳ Testing verification (Phase 8-9)
5. ⏳ Final deployment (Phase 10)

## Commits on Branch

```
c0fb77c - Phase 5: Add trace scheduling logic to script
a1850b9 - Phase 4: Update v5-webhook-conversion for trace control
c2a2fbe - Phase 1-3: Add database migrations for offer-level refactor
b82eaa1 - [main] Add quick reference guide
```

## Testing Checklist

- [ ] Migrations deploy without errors
- [ ] Bucket consolidation: verify offer-level suffixes
- [ ] Trace override settings: verify per-offer storage
- [ ] Webhook handler: trace control works
- [ ] Script scheduler: daily limit enforced
- [ ] Campaign routing: unique suffixes per campaign
- [ ] Geo-pooling: multi-geo offers work
- [ ] Stats tables: records stored correctly
- [ ] Pagination: last 50 default, older available

