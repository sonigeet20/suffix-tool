# Adaptive Interval Feedback Loop Explanation

## Overview
The adaptive Google Ads script automatically adjusts its API call delay based on landing page frequency data. **No manual updates are needed** - the feedback loop is completely automatic.

---

## How the Feedback Loop Works

### Day 1 (Initial Run)

```
1. Google Ads Script Starts
   ├─ Calls: GET /functions/v1/get-recommended-interval?offer_name=YOUR_OFFER
   ├─ API Response: { recommended_interval_ms: 5000 }  [Default, no history yet]
   └─ Script sets: CURRENT_INTERVAL_MS = 5000ms

2. Script Runs Campaign Updates
   ├─ Delay = 5000ms between API calls
   ├─ Makes ~5 API calls to get-suffix endpoint
   └─ IMPORTANT: Passes interval_used parameter:
      Example: /functions/v1/get-suffix?offer_name=YOUR_OFFER&interval_used=5000

3. get-suffix Endpoint
   └─ Automatically stores: url_traces.interval_used_ms = 5000
      (This is the automatic data collection!)

4. Supabase Records Updated
   └─ url_traces table now has:
      - offer_id: abc123
      - visited_at: 2025-01-10 14:32:00
      - interval_used_ms: 5000 ✅ [NEW DATA]
```

---

### Day 2 (Next Run - Automatic Optimization)

```
1. Google Ads Script Starts Again
   ├─ Calls: GET /functions/v1/get-recommended-interval?offer_name=YOUR_OFFER
   │
   └─ API Queries Yesterday's Data:
      SELECT 
        AVG(interval_used_ms) as yesterday_avg,
        MAX(landing_page_count) as max_duplicates
      FROM url_traces
      WHERE offer_id = 'abc123'
        AND visited_at::DATE = YESTERDAY

2. API Calculations
   ├─ Yesterday's average interval: 5000ms
   ├─ Yesterday's max duplicate count: 15 (max landing pages)
   ├─ Target duplicate count: 5 (desired maximum)
   │
   ├─ Formula: new_interval = 5000 × (5 / 15) = 1667ms
   └─ Constraints: max(1000, min(30000, 1667)) = 1667ms
      (Within safe bounds: not below 1000ms, not above 30000ms)

3. API Response
   └─ { recommended_interval_ms: 1667 }

4. Script Updates
   └─ CURRENT_INTERVAL_MS = 1667ms (30% faster than yesterday!)

5. Loop Continues
   └─ Script passes interval_used=1667 to get-suffix
      → Data stored for tomorrow's calculation
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DAY 1 (Initial)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Google Ads Script                                               │
│  ├─ Fetch Recommended Interval                                   │
│  │  └─ API: DEFAULT (5000ms, no history)                        │
│  ├─ Use 5000ms delay                                             │
│  └─ Call get-suffix with interval_used=5000 ────────────────┐   │
│                                                               │   │
│  Supabase (get-suffix endpoint)                              │   │
│  │ ◄────────────────────────────────────────────────────────┘   │
│  ├─ Receive: interval_used=5000                                  │
│  └─ Store: url_traces.interval_used_ms = 5000 ✅               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ⏰ 24 HOURS PASS
┌─────────────────────────────────────────────────────────────────┐
│                        DAY 2+ (Adaptive)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Google Ads Script                                               │
│  ├─ Fetch Recommended Interval                                   │
│  │  └─ API: Calculate from yesterday's data ◄────────────────┐  │
│  │     QUERY: AVG(interval_used_ms)                          │  │
│  │             MAX(landing_page_count)                       │  │
│  │     CALC: old_interval × (5 / max_count)                 │  │
│  │     RESULT: 1667ms (optimized!)                           │  │
│  │                                                            │  │
│  └─ Use 1667ms delay (faster than yesterday!)                │  │
│     └─ Call get-suffix with interval_used=1667 ────────────┐│  │
│                                                              ││  │
│  Supabase                                                    ││  │
│  ├─ Database Query (yesterday's data) ─────────────────────┘│  │
│  │                                                            │  │
│  └─ get-suffix endpoint                                      │  │
│     │ ◄────────────────────────────────────────────────────┘  │
│     ├─ Receive: interval_used=1667                             │
│     └─ Store: url_traces.interval_used_ms = 1667 ✅           │
│         (Ready for tomorrow's calculation!)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Insight: The `interval_used` Parameter

### What It Is
A **tracking parameter** that tells the system which interval was actually used during the script run.

### Where It's Set
In the Google Ads Script's `callGetSuffixAPI()` function:
```javascript
// NEW: Pass the dynamic interval to track actual speed used
if (CURRENT_INTERVAL_MS > 0) {
  url += '&interval_used=' + CURRENT_INTERVAL_MS;
}
```

### Where It Goes
→ Passed to: `/functions/v1/get-suffix?offer_name=YOUR_OFFER&interval_used=5000`

### What Happens
→ Stored in: `url_traces` table, column `interval_used_ms`

### Why It Matters
→ Used next day for recalculation: `AVG(interval_used_ms)`

---

## The Closed-Loop System

```
┌──────────────┐
│   Day N      │
│              │
│  Script uses │
│  interval X  │
└────────┬─────┘
         │
         ▼
┌──────────────────────────┐
│   API stores data        │
│   interval_used_ms = X   │
└────────┬─────────────────┘
         │
         ▼ (24 hours)
┌──────────────────────────────────────┐
│   Day N+1                            │
│                                      │
│   API reads yesterday's data:        │
│   - AVG(interval_used_ms) = X        │
│   - MAX(landing_page_count)          │
│                                      │
│   Recalculates optimized interval Y  │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────┐
│   Day N+1    │
│              │
│  Script uses │
│  interval Y  │ (Optimized!)
└──────────────┘
```

---

## What Supabase Gets Updated With

Every time the Google Ads script runs, **Supabase automatically receives**:

### Data Stored in `url_traces` table:
```sql
INSERT INTO url_traces (
  offer_id,           -- Which offer this is for
  visited_at,         -- When the script ran
  suffix,             -- The generated suffix
  landing_page,       -- Where traffic went
  interval_used_ms    -- ✅ NEW: The interval we actually used
) VALUES (
  'abc123',
  NOW(),
  'param=value',
  'https://landing.com',
  5000                -- ✅ Automatic from the script!
)
```

### No Manual Updates Needed
- ✅ API endpoint automatically stores the data
- ✅ No database insert by user required
- ✅ No config file updates needed
- ✅ No cron jobs or webhooks needed
- ✅ Completely automatic!

---

## Optimization Algorithm

The system uses a **compound adaptive formula**:

```
TARGET_COUNT = 5                    (max duplicates we want)
YESTERDAY_INTERVAL = AVG(interval_used_ms)
MAX_DUPLICATES = MAX(landing_page_count)

NEW_INTERVAL = YESTERDAY_INTERVAL × (TARGET_COUNT / MAX_DUPLICATES)

// Apply safety constraints:
FINAL_INTERVAL = max(
  MIN_INTERVAL_MS (1000ms),
  min(
    MAX_INTERVAL_MS (30000ms),
    NEW_INTERVAL
  )
)
```

### Example Calculation

```
Scenario: Yesterday's data shows
  - Average interval used: 5000ms
  - Max landing pages in a single interval: 15

Calculation:
  new_interval = 5000 × (5 / 15) = 1667ms
  
Constraints check:
  - Is 1667ms ≥ 1000ms (min)? YES ✅
  - Is 1667ms ≤ 30000ms (max)? YES ✅
  
Result: Use 1667ms tomorrow (30% faster, optimized!)
```

---

## Safety Features

### Minimum Speed Constraint (1000ms)
- **Prevents:** API overload
- **Effect:** Never speeds up below 1 second per call
- **Why:** Protects your servers from excessive requests

### Maximum Speed Constraint (30000ms)
- **Prevents:** Too-slow optimization
- **Effect:** Never slows down above 30 seconds per call
- **Why:** Maintains reasonable campaign update frequency

### Fallback on No Data
- **Triggers:** First run, or if yesterday had no data
- **Behavior:** Uses DEFAULT_INTERVAL_MS (5000ms)
- **Why:** Always has a safe value to start with

---

## Monitoring the Feedback Loop

### Check What's Stored
```sql
-- View all interval data for your offer
SELECT 
  offer_id,
  visited_at::DATE as date,
  COUNT(*) as total_calls,
  AVG(interval_used_ms)::INT as avg_interval_ms,
  MAX(landing_page_count) as max_duplicates
FROM url_traces
WHERE offer_id = 'your-offer-id'
GROUP BY offer_id, visited_at::DATE
ORDER BY visited_at DESC
LIMIT 30;
```

### Expected Output
```
offer_id      | date       | total_calls | avg_interval_ms | max_duplicates
──────────────┼────────────┼─────────────┼─────────────────┼────────────────
abc-123       | 2025-01-10 | 5           | 5000            | 15
abc-123       | 2025-01-09 | 5           | 4200            | 12
abc-123       | 2025-01-08 | 5           | 3500            | 10
```

Notice the trend: Interval decreasing = system optimizing = fewer duplicates!

---

## Troubleshooting

### Issue: "No recommended interval, using default 5000ms"
**Cause:** First run, or no data from yesterday
**Solution:** This is normal! Wait 24 hours for data to accumulate

### Issue: "Interval stays at 5000ms even after several days"
**Cause:** Landing page frequency is exactly matching the target (5 duplicates)
**Solution:** This is optimal! No adjustment needed

### Issue: "Interval suddenly increases to 30000ms"
**Cause:** Landing pages dropped significantly (fewer duplicates)
**Solution:** System is throttling to prevent oversaturation - this is correct

### Issue: "Interval stuck at 1000ms"
**Cause:** Landing page count very high, formula wants to go lower
**Solution:** Minimum safety constraint activated - prevents server overload

---

## Summary

✅ **Completely Automatic:** Script passes interval_used → API stores → Tomorrow's calculation uses it

✅ **Self-Optimizing:** No manual tuning needed, adapts daily based on real data

✅ **Safe:** Constraints prevent overload (min 1000ms) and maintain responsiveness (max 30000ms)

✅ **Production Ready:** Deployments complete, all endpoints live, feedback loop built-in

✅ **No Manual Updates:** Just run the adaptive script, everything else is automatic!

---

## Next Steps

1. **Deploy the adaptive script** in Google Ads (recommended every 30 minutes)
2. **Monitor the logs** to see `CURRENT_INTERVAL_MS` values
3. **Wait 24 hours** for data to accumulate
4. **Observe optimization:** Interval adjusts daily based on landing page frequency
5. **Keep baseline script handy** as fallback if needed

That's it! The system does the rest automatically. 🚀
