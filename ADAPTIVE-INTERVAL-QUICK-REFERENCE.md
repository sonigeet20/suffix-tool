# Quick Reference: Adaptive Interval System

## 🚀 What You Have Now

### Three Scripts Available:
1. **Baseline (Constant Delay)** - Fallback with fixed 5000ms delay
2. **Adaptive (Smart Interval)** ⭐ RECOMMENDED - Auto-adjusts daily
3. Plus landing page, tracking pixel, and conversion scripts

---

## 🔄 The Feedback Loop (30-Second Version)

```
Day 1:  Script runs → Uses 5000ms → Passes interval_used=5000 to API
                                     ↓ (Stored in Supabase)
        
Day 2:  Script requests new interval
        API calculates: 5000 × (5 / yesterday_max_duplicates)
        Script gets optimized interval → Uses it
                                     ↓ (Stored in Supabase)
        
Day 3+: Cycle continues, auto-optimizing daily!
```

## 💾 What Gets Stored in Supabase

**Every API call stores:**
- offer_id
- visited_at (timestamp)
- interval_used_ms ✅ **(This is the key!)**
- suffix, landing_page, etc.

**No manual updates needed!** API endpoint handles it automatically.

---

## ⚙️ How It Works

| Component | Role |
|-----------|------|
| **Google Ads Script** | Fetches recommended interval at startup, passes `interval_used` parameter to API |
| **get-recommended-interval** | Queries yesterday's data, calculates new interval using formula |
| **get-suffix** | Receives interval_used parameter, stores in url_traces table |
| **Supabase** | Stores data automatically, ready for next day's calculation |

---

## 📊 The Formula

```
new_interval = yesterday_interval × (5 / max_landing_pages)
     |                                 |
     └─ Baseline from yesterday    └─ Adjust based on frequency

Safety: Constrain to [1000ms, 30000ms]
```

**Plain English:**
- If landing pages are high (15) → reduce interval (speed up) ✅
- If landing pages are low (3) → increase interval (slow down) ✅
- Never go below 1000ms (safety floor) ✅
- Never go above 30000ms (reasonable cap) ✅

---

## 🛠️ Configuration in Script

```javascript
var OFFER_NAME = 'OFFER_NAME';           // Set to your offer
var RUN_INTERVAL_MS = 300000;            // 5 min between API calls
var MAX_RUNTIME_MS = 1500000;            // 25 min total (safe)
var UPDATE_MODE = 'on_change';           // Only update if suffix changes
var CAMPAIGN_LABEL_FILTER = '';          // Empty = all campaigns
```

No other configuration needed! The adaptive interval is automatic.

---

## 📈 Expected Behavior

```
Day 1: Interval = 5000ms (default, no history)
       Landing pages recorded = 15

Day 2: Interval = 5000 × (5/15) = 1667ms (30% faster)
       Landing pages recorded = 8

Day 3: Interval = 1667 × (5/8) = 1042ms (already at floor 1000ms)
       Landing pages stabilize = 5-6 (optimal!)

Day 4+: Interval = ~1000ms (maintains target)
```

✅ System self-optimizes daily!

---

## ⚠️ When to Use Baseline Script

Use the "Baseline (Constant Delay)" script if:
- Adaptive script fails or throws errors
- You want predictable, non-changing delay
- Testing without adaptation
- Fresh offer with no data yet

The baseline script will **never send adaptive data**, so use it **only as fallback**.

---

## 🔍 Monitoring

Check the Google Ads script logs to see:

```
✅ [ADAPTIVE] Using interval: 1667ms
   Yesterday interval: 5000ms
   Max duplicates: 15
   Used fallback: false
```

This confirms:
- ✅ API is responding
- ✅ Interval is being fetched
- ✅ Data from yesterday is available
- ✅ Calculation is working

---

## 🚨 Troubleshooting

| Issue | Reason | Fix |
|-------|--------|-----|
| "Using default 5000ms" | No yesterday data | Normal on Day 1, wait 24h |
| Interval unchanged after 2 days | Landing pages = target (5) | Perfect! System is optimal |
| Interval keeps dropping to 1000ms | Too many landing pages | Adjust ad targeting or landing page |
| Script errors on API call | get-recommended-interval down | Check Supabase, falls back to 5000ms |

---

## 📋 Deployment Checklist

- ✅ Database migration deployed (`supabase db push`)
- ✅ Edge function deployed (`supabase functions deploy get-recommended-interval`)
- ✅ get-suffix endpoint modified to accept interval_used parameter
- ✅ Google Ads script updated with fetchRecommendedInterval()
- ✅ Scripts.tsx UI showing both baseline and adaptive scripts
- ✅ Feedback loop documentation created

**Status: Ready for Production!** 🚀

---

## Next Actions

1. Copy the **Adaptive (Smart Interval)** script into Google Ads
2. Set OFFER_NAME to your actual offer name
3. Schedule to run every 30 minutes
4. Monitor logs for "Using interval: XXXms"
5. Wait 24 hours for first optimization
6. Keep **Baseline script handy** as fallback

---

## Key Insight

**The `interval_used` parameter is the entire feedback loop.**

It's passed by the script → stored by the API → read by the recommender → used for tomorrow's calculation.

No manual intervention needed. It's automatic!

```javascript
// This one line creates the closed-loop system:
url += '&interval_used=' + CURRENT_INTERVAL_MS;  // ← Magic happens here!
```

That parameter goes into Supabase → Next day it's queried → New interval calculated → Script fetches it → Cycle repeats.

**Completely autonomous optimization!** 🤖
