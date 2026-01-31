# V5 Offer-Level Refactor - Implementation Checkpoint

**Date**: January 31, 2026
**Branch**: `v5-offer-level-refactor` (separate from `main`)
**Status**: 50% Complete (5/10 phases done)
**Build Status**: ✅ PASSED

---

## What's Done ✅

### Phase 1-3: Database Layer (Commits: c2a2fbe)
```
Migrations Created:
  ✅ 20260131_v5_bucket_consolidation.sql
  ✅ 20260131_v5_trace_overrides_restructure.sql
  ✅ 20260131_v5_stats_tables.sql

New Tables:
  ✅ v5_suffix_bucket_consolidated (offer-name key)
  ✅ v5_trace_overrides_v2 (offer-name key + daily tracking)
  ✅ v5_campaign_suffix_log (campaign stats, 7-day TTL)
  ✅ v5_trace_log (trace audit, 7-day TTL)
```

### Phase 4: Webhook Handler (Commit: a1850b9)
```
Changes to: supabase/functions/v5-webhook-conversion/index.ts

✅ Added trace_on_webhook check before auto-trace
✅ Enforces traces_per_day daily limit
✅ Logs campaign suffix delivery (v5_campaign_suffix_log)
✅ Logs trace attempts (v5_trace_log)
✅ Increments traces_count_today counter
✅ Works with offer-level bucket
```

### Phase 5: Script Trace Scheduling (Commit: c0fb77c)
```
New Function:
  ✅ supabase/functions/v5-auto-trace-scheduler/index.ts

Updated:
  ✅ src/components/Scripts.tsx (polling loop)

Features:
  ✅ Checks daily limit enforcement
  ✅ Checks interval (with speed multiplier)
  ✅ Checks UTC midnight reset
  ✅ Triggers get-suffix on pass
  ✅ Logs decisions to v5_trace_log
  ✅ Updates traces_count_today and last_trace_time
  ✅ Only runs if TRACE_OVERRIDE_ENABLED = true
  ✅ Non-blocking error handling
```

### Build Verification
```
✅ TypeScript: No errors
✅ Vite: All modules transformed
✅ Dist: Generated successfully (947.86 kB gzipped)
```

---

## What's Left ⏳

### Phase 6: UI Updates (V5WebhookManager)
```
- [ ] Bucket stats display (offer-level aggregate + account breakdown)
- [ ] Trace override settings panel (edit/save per offer)
- [ ] Campaign suffix log viewer (paginated, last 50)
- [ ] Trace log viewer (paginated, last 50)
- [ ] Daily limit progress indicator
- [ ] UTC reset countdown
```

### Phase 7: Auto-Purge Setup
```
- [ ] Deploy purge jobs for v5_campaign_suffix_log (7-day)
- [ ] Deploy purge jobs for v5_trace_log (7-day)
- [ ] OR: Set up Supabase scheduled functions
```

### Phase 8-9: Testing & Verification
```
- [ ] Test all migrations deploy successfully
- [ ] Verify bucket consolidation
- [ ] Verify trace override settings
- [ ] Verify campaign routing (unchanged)
- [ ] Verify geo-pooling (unchanged)
- [ ] Test daily limit enforcement
- [ ] Test UTC reset
- [ ] Test speed multiplier calculation
```

### Phase 10: Production Deployment
```
- [ ] Deploy to Supabase (functions + migrations)
- [ ] Final production build
- [ ] Verify in staging environment
- [ ] Deploy to production
- [ ] Monitor logs for errors
```

---

## Safety & Revert

### Branch Protection
```
Current: All work on v5-offer-level-refactor
Main:    Unchanged (safe fallback)

To revert: git checkout main
```

### Database Safety
```
New Tables (can be dropped):
  - v5_suffix_bucket_consolidated
  - v5_trace_overrides_v2
  - v5_campaign_suffix_log
  - v5_trace_log

Original Tables (preserved):
  - v5_suffix_bucket (original)
  - v5_trace_overrides (original)

Migration files include SQL to revert:
  - DROP TABLE commands
  - RENAME TABLE commands to restore from backups
```

### Rollback Procedure (If Needed)
```
1. Keep working on branch (don't merge)
2. Checkout main for production
3. Manually revert Supabase tables if deployed
   - Drop new tables
   - Rename backups back to originals
4. Re-deploy from main branch functions
```

---

## Key Features Implemented

### Default Trace Behavior (No Override)
```
Webhook arrives
  → Auto-trace triggered immediately (unchanged)
  → No daily limit
  → No speed control
  → Maximum bucket freshness
```

### Override Mode (TRACE_OVERRIDE_ENABLED = true)
```
Webhook arrives
  → NO auto-trace (skipped)
  → Script scheduler controls tracing

Script every cycle:
  1. Check: Daily limit reached? → If yes, skip
  2. Check: Interval elapsed? → If no, skip
  3. Check: UTC midnight? → If yes, reset counter
  4. Trigger trace via get-suffix
  5. Increment traces_count_today
  6. Update last_trace_time
```

### Campaign Routing (UNCHANGED)
```
p1={campaign_id} from Trackier
  → Routes to correct account + campaign
  → Gets unique suffix from bucket
  → Each campaign updates independently
```

### Geo-Pooling (UNCHANGED)
```
get-suffix endpoint:
  → Reads geo_pool from offer config
  → Automatically handles multi-geo
  → Bucket consolidation doesn't affect it
```

---

## Git Commits

```
d66bd4c - Add refactor progress documentation
c0fb77c - Phase 5: Add trace scheduling logic to script
a1850b9 - Phase 4: Update v5-webhook-conversion for trace control
c2a2fbe - Phase 1-3: Add database migrations for offer-level refactor
b82eaa1 - [main] Add quick reference guide for Trackier fix
```

---

## Files Changed

**New Files**:
```
supabase/migrations/20260131_v5_bucket_consolidation.sql
supabase/migrations/20260131_v5_trace_overrides_restructure.sql
supabase/migrations/20260131_v5_stats_tables.sql
supabase/functions/v5-auto-trace-scheduler/index.ts
REFACTOR_PROGRESS.md
IMPLEMENTATION_CHECKPOINT.md
```

**Modified Files**:
```
supabase/functions/v5-webhook-conversion/index.ts
src/components/Scripts.tsx
```

---

## Next Action Items

**Immediate** (Can start now):
1. ✅ Code review completed
2. ✅ Build verified
3. → Deploy migrations to Supabase (Phase 7-10)

**UI Updates** (Phase 6):
- Estimated: 2-3 hours
- Complexity: Medium
- Risk: Low (UI only, no breaking changes)

**Final Testing**:
- Estimated: 1-2 hours
- Complexity: Medium
- Risk: Medium (need live data to test)

**Total Remaining**: ~4-6 hours

---

## Success Criteria

✅ Code compiles (TypeScript, no errors)
✅ Migrations are safe (temporary tables)
✅ Webhook handler has trace control
✅ Script has trace scheduling
⏳ UI shows stats (Phase 6)
⏳ Purge jobs run (Phase 7)
⏳ All tests pass (Phase 8-10)

---

## Known Considerations

1. **Migration Tables**: Using `_v2` and `_consolidated` suffixes for safety
   - Can test without affecting production
   - Easy cleanup if needed

2. **Offer-Level Bucket**: All accounts share suffixes
   - More efficient resource usage
   - Simpler data model
   - Campaign routing still works (preserved via queue)

3. **Daily Counter Reset**: UTC midnight only
   - Not per-timezone (global across all users)
   - Consistent behavior
   - Matches user expectations

4. **Trace Scheduling**: Non-blocking
   - Script continues even if scheduler fails
   - Errors logged but don't stop polling
   - Graceful degradation

---

**Ready for Phase 6 (UI Updates)?** 🚀

