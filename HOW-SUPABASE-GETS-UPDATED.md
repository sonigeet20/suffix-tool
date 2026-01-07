# How Supabase Gets Updated via the Google Ads Script

## Direct Answer to Your Question

**How does Supabase get updated?** → Via the `interval_used` parameter in the Google Ads script!

### The Process (Step by Step)

```
Step 1: Google Ads Script Runs
        └─ Fetches recommended interval from API
        └─ Stores in variable: CURRENT_INTERVAL_MS

Step 2: Script Makes API Calls
        └─ Calls: /get-suffix?offer_name=X&interval_used=CURRENT_INTERVAL_MS
                                                       ↑
                                            THIS PARAMETER!

Step 3: get-suffix Endpoint Receives It
        └─ Parses: const intervalUsed = parseInt(params.get('interval_used') || '0')
        └─ Gets the value: intervalUsed = 5000 (or whatever CURRENT_INTERVAL_MS is)

Step 4: INSERT into Database
        └─ INSERT INTO url_traces (..., interval_used_ms, ...)
           VALUES (..., 5000, ...)  ← Automatically stored!

Step 5: Supabase Updated ✅
        └─ url_traces table now contains: interval_used_ms = 5000
        └─ Query can read it tomorrow for recalculation
```

---

## The Code That Makes It Happen

### In Google Ads Script (Scripts.tsx)

```javascript
// Function that calls the API
function callGetSuffixAPI(campaignCount) {
  var url = SUPABASE_URL + '/functions/v1/get-suffix?offer_name=' + 
            encodeURIComponent(OFFER_NAME);
  
  // ← HERE'S THE MAGIC →
  if (CURRENT_INTERVAL_MS > 0) {
    url += '&interval_used=' + CURRENT_INTERVAL_MS;  // ← This line!
  }
  
  // Make the API call
  var response = UrlFetchApp.fetch(url, options);
  // ...rest of code
}
```

### In get-suffix Endpoint (index.ts)

```typescript
// Receive the parameter
const intervalUsed = parseInt(params.get('interval_used') || '0');

// Later, when inserting into database:
const insertResult = await supabase.from('url_traces').insert({
  offer_id: offerId,
  visited_at: new Date(),
  suffix: generatedSuffix,
  landing_page: landingPage,
  interval_used_ms: intervalUsed > 0 ? intervalUsed : null  // ← Stored here!
});
```

---

## Visual Flow

```
┌──────────────────────────────────┐
│   Google Ads Script              │
│   ┌────────────────────────────┐ │
│   │ CURRENT_INTERVAL_MS = 5000 │ │
│   └────────┬───────────────────┘ │
└────────────┼────────────────────┘
             │
             ▼ (Includes in URL)
┌──────────────────────────────────────────────────┐
│ /get-suffix?offer_name=X&interval_used=5000     │
│                              ↑                    │
│                       Parameter sent!             │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼ (Endpoint receives it)
┌──────────────────────────────────────────────────┐
│   get-suffix Endpoint                            │
│   ┌──────────────────────────────────────────┐  │
│   │ intervalUsed = parseInt(params.get       │  │
│   │   ('interval_used') || '0')              │  │
│   │ // intervalUsed = 5000 now               │  │
│   └──────────────┬───────────────────────────┘  │
└────────────────┼────────────────────────────────┘
                 │
                 ▼ (Stores in database)
┌──────────────────────────────────────────────────┐
│   INSERT INTO url_traces                         │
│   (offer_id, visited_at, interval_used_ms, ...) │
│   VALUES (abc-123, NOW(), 5000, ...)             │
│                              ↑                    │
│                      Stored in DB!               │
└────────────────┬─────────────────────────────────┘
                 │
                 ▼ (Available for query)
┌──────────────────────────────────────────────────┐
│   Supabase url_traces table                      │
│   ┌──────────────────────────────────────────┐  │
│   │ offer_id | visited_at | interval_used_ms│  │
│   │ abc-123  | 2025-01-10 | 5000            │  │
│   │ abc-123  | 2025-01-10 | 5000            │  │
│   │ abc-123  | 2025-01-09 | 4500            │  │
│   └──────────────────────────────────────────┘  │
│                                                  │
│   Ready for tomorrow's API query! ✅             │
└──────────────────────────────────────────────────┘
```

---

## Timeline Example: How Data Actually Flows

### January 10, 2:00 PM (Day 1)

```
1. Google Ads Script starts
2. Script calls: /get-recommended-interval?offer_name=offer1
3. API returns: { recommended_interval_ms: 5000 }  [Default, no history]
4. Script sets: CURRENT_INTERVAL_MS = 5000

5. Script calls API 5 times with:
   /get-suffix?offer_name=offer1&interval_used=5000
                                  ↑
                         Parameter passed!

6. get-suffix receives: intervalUsed = 5000
7. Database INSERT:
   INSERT INTO url_traces (offer_id, visited_at, interval_used_ms)
   VALUES ('abc123', '2025-01-10 14:00:00', 5000)  ← Stored!
   
   (This happens 5 times, all with interval_used_ms = 5000)
```

### January 11, 2:00 PM (Day 2)

```
1. Google Ads Script starts again
2. Script calls: /get-recommended-interval?offer_name=offer1
3. API queries database:
   SELECT AVG(interval_used_ms) FROM url_traces
   WHERE offer_id = 'abc123'
   AND visited_at::DATE = '2025-01-10'
   
   Result: 5000 (average of yesterday's values)

4. API queries landing page count:
   Result: max duplicates = 15

5. API calculates:
   new_interval = 5000 × (5 / 15) = 1667ms

6. API returns: { recommended_interval_ms: 1667 }
7. Script sets: CURRENT_INTERVAL_MS = 1667

8. Script calls API 5 times with:
   /get-suffix?offer_name=offer1&interval_used=1667
                                  ↑
                      NEW value passed!

9. get-suffix receives: intervalUsed = 1667
10. Database INSERT:
    INSERT INTO url_traces (offer_id, visited_at, interval_used_ms)
    VALUES ('abc123', '2025-01-11 14:00:00', 1667)  ← Stored!
    
    (This happens 5 times, all with interval_used_ms = 1667)
```

### January 12, 2:00 PM (Day 3)

```
1. Same cycle repeats
2. API queries yesterday (Jan 11):
   AVG(interval_used_ms) = 1667
   max duplicates = 8 (improved!)

3. API calculates:
   new_interval = 1667 × (5 / 8) = 1042ms
   After constraint: max(1000, min(30000, 1042)) = 1042ms

4. Script uses 1042ms intervals
5. Data stored with interval_used_ms = 1042
6. System continues optimizing...
```

---

## What Actually Gets Stored

### Database Table: url_traces

```sql
CREATE TABLE url_traces (
  id UUID PRIMARY KEY,
  offer_id UUID,
  visited_at TIMESTAMP,
  suffix TEXT,
  landing_page TEXT,
  interval_used_ms INTEGER,  -- ← NEW COLUMN
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Example Data After Running Adaptive Script

```
id       | offer_id | visited_at      | suffix        | interval_used_ms
────────┼──────────┼─────────────────┼───────────────┼──────────────────
abc-001  | xyz-123  | 2025-01-10 14:00| param=val1    | 5000
abc-002  | xyz-123  | 2025-01-10 14:05| param=val2    | 5000  ← Same day
abc-003  | xyz-123  | 2025-01-10 14:10| param=val3    | 5000
abc-004  | xyz-123  | 2025-01-10 14:15| param=val4    | 5000
abc-005  | xyz-123  | 2025-01-10 14:20| param=val5    | 5000
────────┼──────────┼─────────────────┼───────────────┼──────────────────
abc-006  | xyz-123  | 2025-01-11 14:00| param=val1    | 1667  ← Different!
abc-007  | xyz-123  | 2025-01-11 14:05| param=val2    | 1667  ← Optimized
abc-008  | xyz-123  | 2025-01-11 14:10| param=val3    | 1667
abc-009  | xyz-123  | 2025-01-11 14:15| param=val4    | 1667
abc-010  | xyz-123  | 2025-01-11 14:20| param=val5    | 1667
────────┼──────────┼─────────────────┼───────────────┼──────────────────
abc-011  | xyz-123  | 2025-01-12 14:00| param=val1    | 1042  ← Further optimized
...
```

Notice: `interval_used_ms` changes daily as the system optimizes! ✅

---

## No Manual Updates Required

### You DON'T Need to:
- ❌ Manually insert data into database
- ❌ Write any SQL updates
- ❌ Call any additional endpoints
- ❌ Set up cron jobs or webhooks
- ❌ Configure any upload mechanisms
- ❌ Monitor database inserts

### The System Automatically:
- ✅ Receives interval_used parameter from script
- ✅ Stores it in url_traces table
- ✅ Queries it next day for recalculation
- ✅ Calculates new interval
- ✅ Returns it to script
- ✅ Script uses it
- ✅ Process repeats

---

## Why This Design Works

### Single Responsibility
```
Script's job:  Pass the interval we're using
API's job:     Store what we passed
API's job:     Query what we stored yesterday
Script's job:  Use the new interval

Everyone does one thing well!
```

### Automatic Closed Loop
```
Day N:  Script → API → Database
              ↑            ↓
        (tomorrow's data source)

Day N+1: Database → API → Script
                ↑         ↓
          (yesterday's data)

No missing steps!
```

### No External Dependencies
```
✅ All data flows internally
✅ No external APIs needed
✅ No third-party webhooks
✅ No additional infrastructure
✅ Uses existing Supabase connection
✅ Completely self-contained
```

---

## Verification: How to Confirm It's Working

### Check the Data Was Stored

Run this SQL query in Supabase:

```sql
SELECT 
  offer_id,
  visited_at,
  interval_used_ms,
  COUNT(*) OVER (PARTITION BY visited_at::DATE) as daily_calls
FROM url_traces
WHERE offer_id = 'your-offer-id'
AND interval_used_ms IS NOT NULL
ORDER BY visited_at DESC
LIMIT 10;
```

### Expected Output

```
offer_id   | visited_at      | interval_used_ms | daily_calls
───────────┼─────────────────┼──────────────────┼─────────────
xyz-123    | 2025-01-11 14:05| 1667             | 5
xyz-123    | 2025-01-11 14:00| 1667             | 5
xyz-123    | 2025-01-10 14:20| 5000             | 5
xyz-123    | 2025-01-10 14:15| 5000             | 5
xyz-123    | 2025-01-10 14:10| 5000             | 5
```

✅ **This proves:** Data is flowing from script → API → Supabase!

### Check the Script Logs

In Google Ads script logs, you should see:

```
✅ [ADAPTIVE] Using interval: 1667ms
   Yesterday interval: 5000ms
   Max duplicates: 15
   Used fallback: false
```

✅ **This proves:** Script is fetching and using the updated interval!

---

## Summary: The Complete Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Google Ads Script (In Google Ads Account)                   │
│                                                              │
│ var CURRENT_INTERVAL_MS = 5000; // ← Set by API             │
│                                                              │
│ function callGetSuffixAPI() {                               │
│   url += '&interval_used=' + CURRENT_INTERVAL_MS; // ← Send!│
│   UrlFetchApp.fetch(url);                                   │
│ }                                                            │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼ HTTPS REQUEST
┌─────────────────────────────────────────────────────────────┐
│ Supabase Edge Function: get-suffix                          │
│                                                              │
│ const intervalUsed = parseInt(params.get('interval_used')); │
│                                                              │
│ await supabase.from('url_traces').insert({                 │
│   interval_used_ms: intervalUsed  // ← Store!              │
│ });                                                          │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼ SQL INSERT
┌─────────────────────────────────────────────────────────────┐
│ Supabase PostgreSQL Database                                │
│                                                              │
│ url_traces table                                            │
│ [interval_used_ms = 5000] ✅ STORED!                        │
│                                                              │
│ Next Day Query:                                             │
│ SELECT AVG(interval_used_ms) WHERE visited_at = YESTERDAY   │
│ Result: 5000                                                │
│                                                              │
│ → Used to calculate tomorrow's interval! ✅                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Final Answer

**"How does Supabase get updated via the Google Ads script?"**

→ The script passes the `interval_used` parameter to the API
→ The API receives and stores it in the url_traces table
→ Next day, the API queries what was stored yesterday
→ Uses that data to calculate a new interval
→ Script fetches the new interval and uses it
→ Cycle repeats, system self-optimizes daily

**It's completely automatic!** No manual intervention needed after deploying the script. The feedback loop is built-in. 🚀
