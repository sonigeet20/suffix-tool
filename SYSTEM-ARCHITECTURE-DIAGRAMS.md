# System Architecture & Data Flow Diagrams

## 1. Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ADAPTIVE INTERVAL SYSTEM                        │
└─────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────────────┐
                    │   Google Ads Account         │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │  Adaptive Script     │   │
                    │  │  (runs every 30m)    │   │
                    │  └──────────┬───────────┘   │
                    └─────────────┼────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │ HTTPS Request             │
                    │ With interval_used param  │
                    └─────────────┬──────────────┘
                                  │
        ┌─────────────────────────┴────────────────────────────┐
        │                                                       │
        ▼                                                       ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│  get-recommended-interval    │              │      get-suffix              │
│  (Supabase Edge Function)    │              │  (Supabase Edge Function)    │
│                              │              │                              │
│ Input:  offer_name          │              │ Input:  offer_name           │
│ Action: Query yesterday data │              │         interval_used        │
│         Calculate new        │              │ Action: Generate suffix      │
│         interval             │              │         Store interval_used  │
│ Output: recommended_interval │              │ Output: suffix, final_url    │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               │ JSON Response                              │ JSON Response
               │ {recommended_interval_ms}                  │ {suffix, final_url}
               │                                             │
        ┌──────┴─────────────────────────────┬──────────────┴──────────┐
        │                                    │                         │
        ▼                                    ▼                         ▼
┌──────────────────────────────┐  ┌──────────────────────────┐  ┌────────────────────┐
│   Google Ads Script          │  │  Supabase Database       │  │  Today's Data      │
│ Updates CURRENT_INTERVAL_MS  │  │  url_traces table        │  │  (stored for       │
│                              │  │                          │  │   tomorrow's calc)  │
│ Makes API calls with new     │  │  Columns:                │  │                    │
│ interval_used parameter      │  │  - offer_id              │  │  interval_used_ms  │
│                              │  │  - visited_at            │  │  = 5000 (today)    │
│                              │  │  - interval_used_ms ✅   │  │  = 1667 (tomorrow) │
│                              │  │  - suffix                │  │                    │
│                              │  │  - landing_page          │  │                    │
└──────────────────────────────┘  └──────────────┬───────────┘  └────────────────────┘
        │                                       │
        │ ◄───── Feedback Loop ────────────────┤
        │                                       │
        └──────────────┬───────────────────────┘
                       │
                   Every 24h
                       │
                       ▼
        ┌──────────────────────────────────┐
        │  Tomorrow's get-recommended-interval
        │  Queries: AVG(interval_used_ms)
        │  Queries: MAX(landing_page_count)
        │  Calculates: New Interval
        │  Returns: Updated interval
        └──────────────┬───────────────────┘
                       │
                       └──► Script fetches & uses new interval
                           Cycle repeats! ✅
```

---

## 2. Single Run Data Flow

```
TIME: 2:00 PM - Google Ads Script Execution

Step 1: Script Starts
┌─────────────────────────────────┐
│ function main()                 │
│ ├─ Fetch recommended interval   │
│ └─ Store in CURRENT_INTERVAL_MS │
└────────────┬────────────────────┘
             │
             ▼
        Get API request:
        /get-recommended-interval?offer_name=offer1

Step 2: API Calculates Interval
┌────────────────────────────────────────┐
│ get-recommended-interval endpoint      │
├────────────────────────────────────────┤
│ 1. Query yesterday's data:             │
│    SELECT AVG(interval_used_ms)        │
│    WHERE visited_at = YESTERDAY        │
│    Result: 5000ms                      │
│                                        │
│ 2. Get landing page frequency:         │
│    SELECT MAX(landing_page_count)      │
│    Result: 15 duplicates               │
│                                        │
│ 3. Calculate new interval:             │
│    5000 × (5 / 15) = 1667ms            │
│                                        │
│ 4. Apply constraints:                  │
│    max(1000, min(30000, 1667))         │
│    = 1667ms ✅                         │
│                                        │
│ 5. Return JSON:                        │
│    {recommended_interval_ms: 1667}     │
└────────────┬─────────────────────────┘
             │
             ▼
        Script receives: 1667ms
        Sets: CURRENT_INTERVAL_MS = 1667

Step 3: Script Makes API Calls
┌──────────────────────────────────────────────┐
│ function callGetSuffixAPI()                  │
│                                              │
│ Loop 5 times (RUN_INTERVAL_MS = 300000):   │
│                                              │
│ Iteration 1:                                 │
│  ├─ Delay: 1667ms                           │
│  ├─ URL: /get-suffix?offer_name=offer1     │
│  │                 &interval_used=1667       │ ← IMPORTANT!
│  ├─ Response: {suffix: "param=val1", ...}  │
│  └─ Update campaigns                        │
│                                              │
│ Iteration 2:                                 │
│  ├─ Delay: 1667ms                           │
│  ├─ URL: /get-suffix?offer_name=offer1     │
│  │                 &interval_used=1667       │
│  ├─ Response: {suffix: "param=val2", ...}  │
│  └─ Update campaigns                        │
│                                              │
│ ... (3 more iterations)                      │
└──────────────┬───────────────────────────────┘
               │
               ▼
        All 5 API calls made with
        interval_used=1667

Step 4: API Endpoint Receives & Stores
┌──────────────────────────────────────────────┐
│ get-suffix endpoint                          │
│                                              │
│ For each request received:                   │
│  ├─ Parse: intervalUsed = 1667               │
│  └─ INSERT INTO url_traces:                  │
│     (offer_id, visited_at, interval_used_ms)│
│     VALUES (offer1, NOW(), 1667)             │
│     VALUES (offer1, NOW(), 1667)             │
│     VALUES (offer1, NOW(), 1667)             │
│     VALUES (offer1, NOW(), 1667)             │
│     VALUES (offer1, NOW(), 1667)             │
└──────────────┬───────────────────────────────┘
               │
               ▼
        Database updated! 5 rows inserted
        All with interval_used_ms = 1667 ✅

Step 5: Script Completes
┌──────────────────────────────────────────┐
│ Execution Summary:                       │
│ ├─ API calls: 5                          │
│ ├─ Campaigns updated: 8                  │
│ ├─ Interval used: 1667ms                 │
│ ├─ Runtime: 2 min 45 sec                 │
│ └─ Status: ✅ SUCCESS                    │
└──────────────┬───────────────────────────┘
               │
               ▼
        Script exits
        Data ready for tomorrow's calculation! ✅

Timeline visualization:
2:00:00 PM - Script starts
2:00:50 PM - Fetch recommended interval (50s for API call)
2:00:51 PM - Start iteration 1 (delay 1667ms)
2:00:53 PM - API call (2s)
2:00:56 PM - Start iteration 2
...
2:02:45 PM - Script completes

Total: ~3 minutes from start to finish
Data stored: 5 rows in url_traces with interval_used_ms = 1667
```

---

## 3. Multi-Day Optimization Trend

```
                    ADAPTIVE INTERVAL SYSTEM
              System Self-Optimizes Over Time

INTERVAL (ms)
│
│  5000 ┤ ● Day 1 (default, no history)
│  4500 ┤ │
│  4000 ┤ │ Landing pages: 15 (high)
│  3500 ┤ │ Formula: 5000 × (5/15) = 1667
│  3000 ┤ │
│  2500 ┤ │
│  2000 ┤ │         ● Day 2 (optimized)
│  1667 ┤ │         │ Landing pages: 8 (better)
│  1500 ┤ │         │ Formula: 1667 × (5/8) = 1042
│  1000 ┤ │         │     ● Day 3 (further optimized)
│   750 ┤ │         │     │ Landing pages: 5 (optimal!)
│   500 ┤ │         │     │ Constraint floor: 1000ms
│   250 ┤ │         │     │     ● Day 4+ (stable at optimal)
│     0 ┤_│_________|_____|__________
         └─┴─────────┴─────┴──────────► TIME (Days)
            1          2     3         4+

Key Observations:
┌────────────────────────────────────────────────────────────┐
│ Day 1:                                                     │
│ • Interval: 5000ms (default)                              │
│ • Landing pages: 15 per interval (high!)                  │
│ • Status: Baseline, no optimization yet                   │
│                                                             │
│ Day 2:                                                     │
│ • Interval: 1667ms (30% faster) ✓                         │
│ • Landing pages: 8 per interval (better!)                 │
│ • Status: System optimized based on Day 1 data            │
│                                                             │
│ Day 3:                                                     │
│ • Interval: 1042ms (38% faster than Day 2) ✓✓             │
│ • Landing pages: 5 per interval (optimal!)                │
│ • Status: System converging to target                     │
│                                                             │
│ Day 4+:                                                    │
│ • Interval: ~1000ms (constraint floor)                    │
│ • Landing pages: 5-6 per interval (stable)                │
│ • Status: OPTIMAL EQUILIBRIUM - no further changes        │
│                                                             │
│ Net Result: 5x faster! (5000ms → 1000ms)                  │
│ Improvement: Fewer landing page duplicates                │
│ Maintenance: ZERO - fully automated                       │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Landing Page Distribution Over Time

```
LANDING PAGES PER INTERVAL
Distribution Chart

INTERVAL 1  | Landing page count    | Duplicates
────────────┼──────────────────────┼───────────
Day 1 (5s)  | ████████████████████ | 20
Day 2 (1.6s)| ████████             | 8
Day 3 (1s)  | █████                | 5  ← Target
Day 4 (1s)  | █████                | 5
Day 5 (1s)  | ██████               | 6

Why this happens:

Day 1: 5000ms = Long wait
       └─ Traffic accumulates
          └─ 20 landing pages per interval (BAD!)
             
Day 2: 1667ms = Medium wait
       └─ Less time for accumulation
          └─ 8 landing pages per interval (BETTER!)
             
Day 3: 1042ms = Short wait
       └─ Very little accumulation
          └─ 5 landing pages per interval (OPTIMAL!)
             └─ Matches our TARGET of 5!
                └─ No further adjustment needed
                
Formula: interval × (5 / max_duplicates) = new_interval

When max_duplicates = 5 (target):
  new_interval = old_interval × (5/5) = old_interval
  No change needed! System stable. ✅
```

---

## 5. Request/Response Cycle

```
REQUEST PHASE
═════════════

Google Ads Script
↓
URL: /get-recommended-interval?offer_name=offer1
Query Parameters:
├─ offer_name: offer1
└─ (no auth needed - public endpoint)

Headers: None special
Body: None (GET request)


PROCESSING PHASE
════════════════

API Endpoint (get-recommended-interval)
├─ Parse: offer_name = "offer1"
├─ Query Database:
│  ├─ SELECT AVG(interval_used_ms)
│  │  WHERE offer_id = offer1
│  │  AND visited_at::DATE = YESTERDAY
│  │  Result: 5000ms
│  │
│  └─ SELECT MAX(landing_page_count)
│     WHERE offer_id = offer1
│     AND visited_at::DATE = YESTERDAY
│     Result: 15
├─ Calculate:
│  └─ new_interval = 5000 × (5/15) = 1667ms
│     Constraint: max(1000, min(30000, 1667)) = 1667ms
└─ Return: {recommended_interval_ms: 1667, ...}


RESPONSE PHASE
══════════════

HTTP 200 OK
Content-Type: application/json

{
  "recommended_interval_ms": 1667,
  "yesterday_interval_ms": 5000,
  "max_occurrences": 15,
  "used_default_fallback": false
}

Script receives:
├─ Status: 200 OK ✅
├─ Body: JSON parsed
└─ Value: CURRENT_INTERVAL_MS = 1667


USAGE PHASE
═══════════

Script uses the interval:

for (let i = 0; i < 5; i++) {
  // Delay by the recommended interval
  Utilities.sleep(CURRENT_INTERVAL_MS);  // 1667ms
  
  // Make API call with interval_used parameter
  url += '&interval_used=' + CURRENT_INTERVAL_MS;
  UrlFetchApp.fetch(url);
  
  // API stores the interval_used value
  // Database INSERT: interval_used_ms = 1667 ✅
}
```

---

## 6. Database State Changes

```
DAY 1 - Initial State
═════════════════════

url_traces table BEFORE Day 1 script runs:
┌─────────────────┬─────────────────────────┐
│ offer_id        │ (other columns) ...     │
├─────────────────┼─────────────────────────┤
│ ... old data    │ ...                     │
└─────────────────┴─────────────────────────┘

Day 1 script runs with default interval (5000ms)

url_traces table AFTER Day 1:
┌─────────────────┬────────────┬──────────────────────────┐
│ offer_id        │ visited_at │ interval_used_ms         │
├─────────────────┼────────────┼──────────────────────────┤
│ ... old data    │ ...        │ ... NULL or missing      │
├─────────────────┼────────────┼──────────────────────────┤
│ offer1          │ 2025-01-10 │ 5000  ← NEW!            │
│ offer1          │ 2025-01-10 │ 5000                    │
│ offer1          │ 2025-01-10 │ 5000                    │
│ offer1          │ 2025-01-10 │ 5000                    │
│ offer1          │ 2025-01-10 │ 5000                    │
└─────────────────┴────────────┴──────────────────────────┘

Summary: 5 rows with interval_used_ms = 5000


DAY 2 - Optimization
════════════════════

get-recommended-interval API queries:
SELECT AVG(interval_used_ms) FROM url_traces
WHERE offer_id = 'offer1'
AND visited_at::DATE = '2025-01-10'  ← YESTERDAY

Result: 5000 (average of 5 rows)

Calculation:
max_duplicates = 15
new_interval = 5000 × (5/15) = 1667ms

Day 2 script runs with optimized interval (1667ms)

url_traces table AFTER Day 2:
┌─────────────────┬────────────┬──────────────────────────┐
│ offer_id        │ visited_at │ interval_used_ms         │
├─────────────────┼────────────┼──────────────────────────┤
│ offer1          │ 2025-01-10 │ 5000  (Day 1)            │
│ offer1          │ 2025-01-10 │ 5000                    │
│ offer1          │ 2025-01-10 │ 5000                    │
│ offer1          │ 2025-01-10 │ 5000                    │
│ offer1          │ 2025-01-10 │ 5000                    │
├─────────────────┼────────────┼──────────────────────────┤
│ offer1          │ 2025-01-11 │ 1667  ← OPTIMIZED!      │
│ offer1          │ 2025-01-11 │ 1667                    │
│ offer1          │ 2025-01-11 │ 1667                    │
│ offer1          │ 2025-01-11 │ 1667                    │
│ offer1          │ 2025-01-11 │ 1667                    │
└─────────────────┴────────────┴──────────────────────────┘

Summary: Previous 5 rows unchanged
         New 5 rows with interval_used_ms = 1667


DAY 3 - Further Optimization
═════════════════════════════

get-recommended-interval API queries:
SELECT AVG(interval_used_ms) FROM url_traces
WHERE offer_id = 'offer1'
AND visited_at::DATE = '2025-01-11'  ← YESTERDAY (now Jan 11)

Result: 1667 (average of 5 rows from Day 2)

Calculation:
max_duplicates = 8 (improved from 15!)
new_interval = 1667 × (5/8) = 1042ms

Day 3 script runs with further optimized interval (1042ms)

url_traces table AFTER Day 3:
┌─────────────────┬────────────┬──────────────────────────┐
│ offer_id        │ visited_at │ interval_used_ms         │
├─────────────────┼────────────┼──────────────────────────┤
│ offer1          │ 2025-01-10 │ 5000  (Day 1)            │
│ ... (3 more)    │ 2025-01-10 │ 5000                    │
├─────────────────┼────────────┼──────────────────────────┤
│ offer1          │ 2025-01-11 │ 1667  (Day 2)            │
│ ... (3 more)    │ 2025-01-11 │ 1667                    │
├─────────────────┼────────────┼──────────────────────────┤
│ offer1          │ 2025-01-12 │ 1042  ← FURTHER OPT!    │
│ offer1          │ 2025-01-12 │ 1042                    │
│ offer1          │ 2025-01-12 │ 1042                    │
│ offer1          │ 2025-01-12 │ 1042                    │
│ offer1          │ 2025-01-12 │ 1042                    │
└─────────────────┴────────────┴──────────────────────────┘

Pattern: Each day's data used to calculate next day's interval!
```

---

## 7. Error Handling Flow

```
Script Execution with Error Handling

┌──────────────────────────────────┐
│ Script Starts                    │
└────────────┬─────────────────────┘
             │
             ▼
    ┌─────────────────────────────┐
    │ fetchRecommendedInterval()  │
    │ GET /get-recommended-interval
    └────────┬────────────────────┘
             │
        ┌────┴────┐
        │          │
        ▼          ▼
    SUCCESS    FAILURE
        │          │
        │          ├─ Network error?
        │          ├─ API returns 500?
        │          ├─ Parse error?
        │          ├─ Timeout?
        │          │
        │          ▼
        │    ┌──────────────────────┐
        │    │ Try-Catch Block      │
        │    │ log('⚠️ Error...')  │
        │    └──────────┬───────────┘
        │               │
        │               ▼
        │    ┌──────────────────────────┐
        │    │ Use Fallback Value       │
        │    │ CURRENT_INTERVAL_MS = 5k │
        │    └──────────┬───────────────┘
        │               │
        └───────────────┘
                │
                ▼
    ┌─────────────────────────────────┐
    │ Continue with CURRENT_INTERVAL   │
    │ (either fetched or fallback)     │
    └────────────┬────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────┐
    │ callGetSuffixAPI()              │
    │ ALWAYS includes interval_used:  │
    │ url += '&interval_used=' + ...  │
    │                                 │
    │ Even if it's the fallback value │
    └────────────┬────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────┐
    │ Database stores interval_used   │
    │ (either fetched or fallback)    │
    │                                 │
    │ If fallback: tomorrow still     │
    │ gets the value stored           │
    └────────────┬────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────┐
    │ Script Continues Successfully   │
    │ ✅ No crash                     │
    │ ⚠️ Degraded performance         │
    │    (but still functional)       │
    └─────────────────────────────────┘

Result:
- If API works: ✅ Optimized interval used
- If API fails: ✅ Fallback to 5000ms, still works!
- Never crashes: ✅ Always has a safe value
```

---

## 8. Complete System State Diagram

```
                    BEFORE (No adaptive system)
                    ════════════════════════════

Google Ads Script     ────────────────────────     Supabase
├─ Fixed delay 5s                                  └─ Only logs
├─ No optimization                                    landing pages
├─ No feedback                                        No interval
└─ Manual tuning                                      data


                    AFTER (Adaptive system deployed)
                    ════════════════════════════════════

                    ┌─────────────────────────────────────┐
                    │   AUTOMATED OPTIMIZATION CYCLE      │
                    └─────────────────────────────────────┘

                              DAY 1
                              ─────
    Google Ads Script                    Supabase Database
    ┌────────────────┐                   ┌────────────────┐
    │ Use: 5000ms    │────interval_used──→ Store: 5000ms  │
    │ (default)      │                   │ (5 rows)       │
    └────────────────┘                   └────────────────┘
                                          ↑
                                          │
                                    Historical Data


                              DAY 2
                              ─────
    ┌────────────────────────────────────────────────────┐
    │ Data Flows Through Optimization                    │
    └────────────┬─────────────────────────────────────┐
                 │                                       │
                 ▼                                       ▼
    ┌──────────────────────┐           ┌────────────────────────┐
    │ Supabase Database    │           │ get-recommended-        │
    │ ├─ Yesterday: 5000ms │─────────→ │ interval function      │
    │ ├─ Max dups: 15      │           │ ├─ Query yesterday     │
    │ └─ (ready to query)  │           │ ├─ Calculate formula   │
    └──────────────────────┘           │ ├─ New: 1667ms         │
                                       └────────────┬───────────┘
                                                    │
                                                    ▼
    ┌────────────────┐                    ┌─────────────────┐
    │ Google Ads     │←──new interval───  │ Return: 1667ms  │
    │ Script         │                    └─────────────────┘
    │ Use: 1667ms    │────interval_used──→ Supabase Database
    │ (optimized!)   │                    Store: 1667ms
    └────────────────┘                    (5 rows)
                                          Efficiency: +30%


                              DAY 3+
                              ─────
                    (Cycle repeats, system converges)

    Every day:
    └─ Read yesterday's data
       └─ Calculate optimization
          └─ Script uses new interval
             └─ New data stored
                └─ Tomorrow's calculation ready

    Final state (convergence):
    ├─ Interval: ~1000ms (floor constraint)
    ├─ Landing pages: 5 per interval (target met!)
    ├─ Performance: Optimal
    ├─ Maintenance: Zero
    └─ Status: ✅ STABLE EQUILIBRIUM
```

---

## Summary

The system creates a **completely automated feedback loop**:

1. **Script → API** (sends interval_used)
2. **API → Database** (stores interval_used_ms)
3. **Database → API** (queries yesterday)
4. **API → Script** (returns optimized interval)
5. **Script → API** (uses new interval)
6. **Repeat daily** ✅

**No external dependencies. No manual updates. Fully automatic optimization.**
