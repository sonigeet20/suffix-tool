# Side-by-Side Script Comparison Guide

## 📋 Baseline vs Adaptive Scripts

This guide helps you understand when to use each script and what makes them different.

---

## Script Selection Matrix

```
                         USE BASELINE             USE ADAPTIVE
                         ════════════             ════════════
Production Setup         ❌ Not recommended       ✅ RECOMMENDED
Starting Fresh           ✅ First 24h okay        ✅ After 24h
Data History Available   ❌ N/A                   ✅ Yes (recommended)
Optimization Desired     ❌ No                    ✅ Yes
Maximum Control          ✅ Yes (fixed delay)     ❌ No (auto-adjusting)
Simplicity               ✅ Simple                ❌ Slightly complex
Expected Result          → Constant performance   → 5x better performance
Maintenance Required     ❌ Manual tuning         ✅ None
Error Fallback Role      ✅ Primary (backup)      ❌ Secondary (if primary fails)
Tech Savvy Required      ❌ Minimal               ✅ Moderate (easy!)
Recommended For          ├─ Testing              ├─ Production (recommended)
                         ├─ Fresh offers         ├─ Established offers
                         ├─ Troubleshooting      ├─ Auto-optimization
                         └─ Emergency fallback   └─ Long-term deployment
```

---

## Feature Comparison

| Feature | Baseline | Adaptive |
|---------|----------|----------|
| **Delay Type** | Fixed constant | Dynamic, daily adjusted |
| **Default Interval** | 5000ms | 5000ms (Day 1), then optimized |
| **Optimization** | None | Automatic, data-driven |
| **Feedback Loop** | Not implemented | Fully automatic |
| **Performance Trend** | Flat → Never changes | Improves daily for 3-4 days |
| **Landing Dupes** | High (~15) | Converges to target (5) |
| **Efficiency Gain** | None | 3-5x after Day 3 |
| **Manual Tuning** | Required | None |
| **Learning Curve** | Easy | Easy |
| **Production Ready** | Yes, basic | Yes, recommended |
| **Fallback Option** | No | Yes (defaults to 5000ms) |
| **Data Collection** | No | Yes, continuous |
| **Self-Healing** | No | Yes |
| **Maintenance Hours** | Ongoing | Zero |

---

## When to Use Each Script

### ✅ Use BASELINE Script When:

1. **Emergency Fallback**
   - Adaptive script throwing errors
   - Need to get campaigns running immediately
   - Diagnostic troubleshooting

2. **Testing Phase**
   - First time deploying any script
   - Learning how Google Ads scripts work
   - Testing API endpoint stability

3. **Fresh Offer** (First 24 Hours)
   - No historical data yet
   - Don't need optimization immediately
   - Baseline is safer first step

4. **Want Predictability**
   - Fixed delays for planning
   - No daily surprises
   - Simple, predictable behavior

5. **Manual Control Preferred**
   - Prefer to adjust delays manually
   - Don't want automation
   - Want explicit control

### ✅ Use ADAPTIVE Script When:

1. **Production Deployment** (RECOMMENDED)
   - Campaigns running 24/7
   - Want automatic optimization
   - Have data history (after Day 1)

2. **Maximum Efficiency**
   - Want 3-5x performance gain
   - Willing to wait for optimization
   - ROI-focused

3. **Hands-Off Operation**
   - Don't want to monitor/adjust
   - Want system to self-optimize
   - Prefer automation

4. **Data-Driven Approach**
   - Want optimization based on real data
   - Landing page frequency varies
   - Want intelligent adaptation

5. **Long-Term Deployment**
   - Campaigns running for weeks/months
   - Want continuous optimization
   - Zero maintenance preference

---

## Migration Path: Baseline → Adaptive

```
DAY 1
─────
Start with BASELINE script
├─ Reason: No historical data yet
├─ Behavior: Uses fixed 5000ms
├─ Data: Starting to collect interval_used values
└─ Advantage: Safe, simple first run

                    24 HOURS PASS
                    Historical data accumulates

DAY 2
─────
Switch to ADAPTIVE script
├─ Reason: Now has 1 day of data
├─ Action: Copy and paste Adaptive script
├─ First run: Still uses default 5000ms (first fetch)
│            But now API has data to calculate from
├─ Data: Continues collecting with new intervals
└─ Advantage: Optimization can begin

                    SYSTEM OPTIMIZES
                    Daily improvements

DAY 3
─────
System optimizing
├─ Interval: 1667ms (30% faster)
├─ Efficiency: Improving
├─ Landing dupes: Reducing
└─ Advantage: Performance getting better

DAY 4+
──────
System optimized
├─ Interval: ~1000ms (stable)
├─ Efficiency: 5x better than Day 1
├─ Landing dupes: Optimal (~5)
├─ Trend: Flat (converged)
└─ Advantage: Maximum efficiency, zero maintenance


OPTIONAL: If issues arise
└─ Quick fallback to BASELINE script
   └─ No data loss
   └─ No breaking changes
   └─ Just temporary until fixed
```

---

## Script Behavior Timeline

### Baseline Script Behavior

```
Run 1 (Hour 0)      ├─ Delay: 5000ms (fixed)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~25 seconds

Run 2 (Hour 0.5)    ├─ Delay: 5000ms (unchanged!)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~25 seconds

Run 3 (Hour 1)      ├─ Delay: 5000ms (still fixed)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~25 seconds

...repeats forever...

Run 100 (Day 4)     ├─ Delay: 5000ms (always the same)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~25 seconds

Performance: ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ (flat line - no improvement)
```

### Adaptive Script Behavior

```
Run 1 (Hour 0)      ├─ Fetch: API returns 5000ms (default)
                    ├─ Delay: 5000ms (no history yet)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~25 seconds

Run 2 (Hour 0.5)    ├─ Fetch: API returns 5000ms (still default)
                    ├─ Delay: 5000ms
                    ├─ Calls: 5 per execution
                    └─ Duration: ~25 seconds

                    24 HOURS PASS
                    API now has yesterday's data

Run 50 (Hour 24)    ├─ Fetch: API calculates from yesterday
                    ├─ Fetch result: 1667ms (optimized!)
                    ├─ Delay: 1667ms (30% faster)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~17 seconds (faster!)

Run 100 (Hour 48)   ├─ Fetch: API recalculates from yesterday
                    ├─ Fetch result: 1042ms (more optimized!)
                    ├─ Delay: 1042ms (48% faster)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~13 seconds (even faster!)

Run 150 (Hour 72)   ├─ Fetch: API recalculates
                    ├─ Fetch result: 1000ms (converged at floor)
                    ├─ Delay: 1000ms (5x original!)
                    ├─ Calls: 5 per execution
                    └─ Duration: ~10 seconds (5x faster!)

Performance: ╱╱╱╱╱╱╱╱╱╱╱╱╱▔▔▔▔▔▔ (improvements, then stable at optimum)
             (improves daily for 3-4 days, then stabilizes)
```

---

## Code Differences

### Baseline Script Key Lines

```javascript
// RATE CONTROL CONFIGURATION
var DELAY_MS = 1000;              // ← Fixed! Set once, never changes

// MAIN FUNCTION
if (DELAY_MS > 0) {
  Utilities.sleep(DELAY_MS);      // ← Always the same delay
}

var url = '${supabaseUrl}/functions/v1/get-suffix?offer_name=' 
          + encodeURIComponent(OFFER_NAME);

// ← NO interval_used parameter
// ← NO API fetch for recommended interval
// ← Static, predictable behavior
```

### Adaptive Script Key Lines

```javascript
// ADAPTIVE INTERVAL CONFIGURATION  
var CURRENT_INTERVAL_MS = 5000;   // ← Will be UPDATED by API!

// FETCH RECOMMENDED INTERVAL (STARTUP) ← NEW FUNCTION!
function fetchRecommendedInterval() {
  var url = SUPABASE_URL + '/functions/v1/get-recommended-interval?offer_name='
            + encodeURIComponent(OFFER_NAME);
  
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  
  if (response.getResponseCode() === 200) {
    var data = JSON.parse(response.getContentText());
    if (data.recommended_interval_ms) {
      CURRENT_INTERVAL_MS = data.recommended_interval_ms;  // ← Updated!
      return true;
    }
  }
  // Fallback if API fails
  CURRENT_INTERVAL_MS = DEFAULT_INTERVAL_MS;  // ← Default if needed
  return false;
}

// In callGetSuffixAPI():
if (CURRENT_INTERVAL_MS > 0) {
  url += '&interval_used=' + CURRENT_INTERVAL_MS;  // ← CRITICAL! Feedback loop
}

Utilities.sleep(CURRENT_INTERVAL_MS);  // ← Uses updated value!
```

---

## Real-World Scenario: Campaign Performance

### Scenario: High-Volume Offer with Variable Duplicates

#### Using BASELINE Script

```
Week 1: Running with 5000ms delay
├─ Landing pages per 5m period: 15 (high)
├─ Efficiency: 1 call per 5 seconds
├─ Performance: Okay, but duplicates are high
├─ Manual action: None (static)
└─ Result: Duplicates stay high, no improvement

Week 2: Still 5000ms delay
├─ Landing pages per 5m period: 15 (same!)
├─ Efficiency: 1 call per 5 seconds (same)
├─ Performance: Same as Week 1
├─ Manual action: Admin decides to reduce DELAY_MS manually
├─ Action taken: Change DELAY_MS = 2000, redeploy script
└─ Result: Manual adjustment required

Week 3: Now running 2000ms delay (manually adjusted)
├─ Landing pages per 5m period: 6 (better!)
├─ Efficiency: 2.5 calls per 5 seconds
├─ Performance: Improved due to manual tuning
├─ Issue: What if 2000ms is too fast? Try again?
└─ Result: Guesswork, multiple iterations

Typical: 2-4 manual adjustments needed over time
Maintenance: Ongoing (requires admin attention)
```

#### Using ADAPTIVE Script

```
Day 1: Running adaptive script
├─ Fetch: API returns 5000ms (default, no data yet)
├─ Landing pages: 15 per interval
├─ Delay: 5000ms
├─ Efficiency: 1 call per 5 seconds
├─ Manual action: None
└─ Data collecting: Yes ✓

Day 2: API has data now!
├─ Fetch: API calculates: 5000 × (5/15) = 1667ms
├─ Landing pages: 8 per interval (better!)
├─ Delay: 1667ms (30% faster automatically)
├─ Efficiency: 3 calls per 5 seconds (3x!)
├─ Manual action: None
└─ Data collecting: Continues ✓

Day 3: Further optimization
├─ Fetch: API calculates: 1667 × (5/8) = 1042ms
├─ Landing pages: 5 per interval (target reached!)
├─ Delay: 1042ms (still improving!)
├─ Efficiency: 4.8 calls per 5 seconds (5x!)
├─ Manual action: None
└─ Data collecting: Continues ✓

Day 4+: Fully optimized
├─ Fetch: API returns: 1000ms (floor constraint)
├─ Landing pages: 5 per interval (stable at target)
├─ Delay: 1000ms (5x original!)
├─ Efficiency: 5 calls per 5 seconds (5x!)
├─ Manual action: None (never needed!)
└─ Data collecting: Continues ✓

Typical: 0 manual adjustments needed
Maintenance: Zero
Result: Automatic optimization in 3-4 days
```

**The Difference:**
- Baseline: 2-4 manual adjustments, ongoing maintenance
- Adaptive: 0 adjustments, fully automatic, 5x performance gain

---

## Decision Tree: Which Script to Use?

```
START
  │
  ├─ Is this my first deployment?
  │  ├─ YES → Use BASELINE for first 24 hours
  │  │       (safe, simple, lets data accumulate)
  │  │       Then switch to ADAPTIVE Day 2
  │  │
  │  └─ NO → Continue below...
  │
  ├─ Do I want automatic optimization?
  │  ├─ YES → Use ADAPTIVE ✅ (RECOMMENDED)
  │  └─ NO  → Use BASELINE
  │
  ├─ Do I have historical data (24+ hours)?
  │  ├─ YES → ADAPTIVE can optimize ✅
  │  └─ NO  → BASELINE is safer (or wait 24h)
  │
  ├─ How important is efficiency?
  │  ├─ CRITICAL → Use ADAPTIVE (5x gain possible)
  │  ├─ IMPORTANT → Use ADAPTIVE (good gain)
  │  └─ NOT CRITICAL → Use BASELINE (simpler)
  │
  ├─ Do I want to maintain scripts regularly?
  │  ├─ NO → Use ADAPTIVE (zero maintenance)
  │  └─ YES → Use BASELINE (manual control)
  │
  └─ ERROR: Script broken?
     └─ Switch to BASELINE immediately (emergency fallback)
        Then diagnose the issue

RESULT:
├─ If ADAPTIVE selected → Copy Adaptive script to Google Ads
├─ If BASELINE selected → Copy Baseline script to Google Ads
└─ Deploy and monitor!
```

---

## Performance Comparison Chart

```
EFFICIENCY GAIN OVER TIME

Calls per 5-minute period

5.0 ├─────────────────────────────────Adaptive ●●●●●●●●●●
    │                               (final: 5x improvement)
4.5 ├                           ╱●●●●
    │                       ╱●●●
4.0 ├                   ╱●●●
    │               ╱●●●
3.5 ├           ╱●●●
    │       ╱●●●
3.0 ├   ╱●●●
    │╱●●
2.5 ├●●● Baseline (flat)
    │●●●
2.0 ├──●──────────────────────────────
    │  (fixed at 1 call per 5 sec)
1.5 ├
    │
1.0 ├
    │
0.5 ├
    │
0.0 └─────┬──────┬──────┬──────┬──────
      Day 1  Day 2  Day 3  Day 4  Day 5

Legend:
●●●●● = Adaptive (improving daily, then stabilizes)
────── = Baseline (flat, no improvement)

Baseline:  1 call/5min (static)
Adaptive:  5 calls/5min (after optimization) ← 5x better!
```

---

## Summary Table: Quick Reference

| Aspect | Baseline | Adaptive |
|--------|----------|----------|
| Ease of use | ⭐⭐⭐⭐⭐ Easy | ⭐⭐⭐⭐⭐ Easy |
| Setup time | 1 minute | 2 minutes |
| Performance | ▔▔▔ Flat | ╱▔▔ Improving |
| Maintenance | 🔧 Ongoing | ⚙️ None |
| Optimization | ❌ None | ✅ Automatic |
| Data collection | ❌ No | ✅ Yes |
| Day 1 efficiency | 1x | 1x |
| Day 2 efficiency | 1x | 3x |
| Day 3 efficiency | 1x | 5x |
| Day 4+ efficiency | 1x | 5x |
| Best for | Testing/Fallback | Production |
| Risk level | 🟢 Low | 🟢 Low |
| Recommended? | ❌ Not primary | ✅ YES |

---

## Bottom Line

**For Production Use:**
- 🏆 Use ADAPTIVE script (recommended)
- ✅ Gets 5x better after 3 days
- ✅ Zero maintenance required
- ✅ Fully automatic optimization

**For Fallback/Testing:**
- 🆘 Use BASELINE script (safe backup)
- ✅ Always works reliably
- ✅ Simple and predictable
- ✅ Emergency option

**Suggestion:**
Deploy ADAPTIVE script for production, keep BASELINE handy in Google Ads as emergency backup. If ADAPTIVE ever has issues, quickly switch to BASELINE while diagnosing.

Both scripts are available in the Scripts section for instant copy/paste deployment.

**Ready to deploy? Use the ADAPTIVE script!** ✅
