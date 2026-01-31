# Quick Reference: V5 Polling Configuration

**Status**: ✅ Live in both `Scripts.tsx` and `v5-google-ads-script-fixed.gs`

## Where to Find It

In your Google Ads Script, look for these lines near the top (after initial variable declarations):

```javascript
// ⚙️ POLLING INTERVAL CONTROL (Configure the polling frequency here)
var POLLING_INTERVAL_MS = 5000;  // 5 seconds between polls (adjust as needed)
var MAX_RUNTIME_MS = 540000;     // 9 minutes max (Google Ads Script limit is 10min)
var POLLING_CYCLES = 10;         // Max polling cycles per execution
```

## What Each Variable Does

| Variable | Default | Purpose | Range |
|----------|---------|---------|-------|
| `POLLING_INTERVAL_MS` | 5000 | Time between polling cycles (milliseconds) | 1000-30000 |
| `MAX_RUNTIME_MS` | 540000 | Maximum total execution time (9 minutes) | 300000-540000 |
| `POLLING_CYCLES` | 10 | How many times to poll per execution | 1-50 |

## Quick Adjustments

### For Fast, Real-Time Processing
```javascript
var POLLING_INTERVAL_MS = 1000;  // Check every 1 second
var MAX_RUNTIME_MS = 540000;     // Full 9 minutes
var POLLING_CYCLES = 50;         // Many cycles
```
**Use when**: High volume of webhooks, need immediate processing

### For Balanced Performance
```javascript
var POLLING_INTERVAL_MS = 5000;  // Check every 5 seconds (DEFAULT)
var MAX_RUNTIME_MS = 540000;     // Full 9 minutes
var POLLING_CYCLES = 10;         // Standard cycles
```
**Use when**: Normal operation, typical webhook volume

### For Low-Overhead Mode
```javascript
var POLLING_INTERVAL_MS = 15000; // Check every 15 seconds
var MAX_RUNTIME_MS = 300000;     // 5 minutes max
var POLLING_CYCLES = 5;          // Few cycles
```
**Use when**: Low webhook volume, want to minimize API usage

## Calculation Examples

**Configuration A: Fast Mode**
- Polls every 1 second
- Max 50 cycles
- Total time: ~50 seconds
- API calls: ~50 per execution
- Frequency needed: Every 1-2 minutes

**Configuration B: Default Mode**
- Polls every 5 seconds
- Max 10 cycles
- Total time: ~50 seconds
- API calls: ~10 per execution
- Frequency needed: Every 5-10 minutes

**Configuration C: Efficient Mode**
- Polls every 15 seconds
- Max 5 cycles
- Total time: ~75 seconds
- API calls: ~5 per execution
- Frequency needed: Every 15-30 minutes

## Monitoring Your Polling

Check Google Ads Script logs for these messages:

```
[POLL] Cycle 1/10 - Elapsed: 45ms
[POLL] Processing 3 webhooks
[POLL] This cycle: 3 webhooks, 2 ads updated
[POLL] Cycle 2/10 - Elapsed: 5150ms
[POLL] No webhooks in queue. Polling will continue...
...
[DONE] Total webhooks processed: 3, ads updated: 2
[CONFIG] To adjust polling: Change POLLING_INTERVAL_MS and POLLING_CYCLES at top of script
```

## When to Adjust

### Increase `POLLING_CYCLES` if:
- Queue often has 10+ webhooks when script runs
- You're hitting API rate limits (try 5 instead of 20)
- Webhooks are arriving faster than script processes them

### Decrease `POLLING_INTERVAL_MS` if:
- You need real-time campaign updates
- Webhooks arrive in bursts
- Using fast script schedule (every 1-5 minutes)

### Increase `POLLING_INTERVAL_MS` if:
- You want to reduce API calls
- Queue is usually empty
- Using slower script schedule (every 30+ minutes)

## Common Scenarios

### Scenario 1: Real-Time Conversions
Trackier sends conversion webhook → Need campaign update within seconds

**Recommended**:
```javascript
var POLLING_INTERVAL_MS = 2000;
var MAX_RUNTIME_MS = 540000;
var POLLING_CYCLES = 20;
```
**Schedule**: Every 1-2 minutes in Google Ads

### Scenario 2: Batch Processing
Process 100+ conversions per hour

**Recommended**:
```javascript
var POLLING_INTERVAL_MS = 3000;
var MAX_RUNTIME_MS = 540000;
var POLLING_CYCLES = 30;
```
**Schedule**: Every 2-5 minutes in Google Ads

### Scenario 3: Always-On Processing
Continuous polling to catch any new webhooks

**Recommended**:
```javascript
var POLLING_INTERVAL_MS = 5000;
var MAX_RUNTIME_MS = 540000;
var POLLING_CYCLES = 50;
```
**Schedule**: Every 1 minute in Google Ads (Google Ads limit)

## Google Ads Script Scheduling

After updating polling config, set script schedule in Google Ads UI:

1. Open **Tools** → **Scripts**
2. Select your V5 script
3. Click **⋮** → **Edit schedules**
4. Set frequency based on your polling config:
   - **Fast Mode**: Every 1 minute
   - **Default Mode**: Every 5-10 minutes
   - **Efficient Mode**: Every 15-30 minutes
5. Click **Save**

## Troubleshooting

**Q: Script logs show "[POLL] No webhooks in queue" repeatedly**  
A: This is normal! Queue is empty, so script continues polling. If this happens every cycle, webhooks aren't arriving or are processed faster than they arrive.

**Q: Script timeout errors in logs**  
A: Increase `MAX_RUNTIME_MS` or decrease `POLLING_CYCLES`. Default 9 minutes should be safe.

**Q: Only seeing 1-2 cycles in logs**  
A: You might have hit `MAX_RUNTIME_MS` limit. Check elapsed time in logs. Increase limit if below 9 minutes.

**Q: API quota exceeded**  
A: Reduce `POLLING_CYCLES` and/or `BATCH_SIZE`. Decrease script schedule frequency (run less often).

## Optimization Tips

1. **Monitor your queue size**: If queue stays at 15 (BATCH_SIZE), increase `POLLING_CYCLES`
2. **Check elapsed time**: If logs show polling ended at 2 minutes, reduce `POLLING_CYCLES` to save resources
3. **Balance API calls**: Each poll fetches up to BATCH_SIZE (15) items. Total calls = POLLING_CYCLES × (1 fetch + 1 update per webhook)
4. **Schedule frequency**: More frequent schedule = can use fewer polling cycles

---

**Next Steps**:
1. Copy the script from `Scripts.tsx` to Google Ads UI
2. Adjust polling variables based on your webhook volume
3. Set script schedule frequency
4. Monitor logs for the first 3 days
5. Fine-tune based on actual webhook patterns

