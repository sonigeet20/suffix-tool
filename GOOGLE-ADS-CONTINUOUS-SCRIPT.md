# Google Ads Continuous Campaign Updater

## Overview

The **Continuous Campaign Updater** is an advanced Google Ads script that runs in an internal loop, automatically calling your API endpoint at regular intervals and updating campaign tracking parameters without manual intervention.

## Key Features

✅ **Internal Timer Loop** - Runs continuously for up to 25 minutes before gracefully exiting
✅ **Automatic API Calls** - Calls your get-suffix API endpoint at configurable intervals (default: 5 minutes)
✅ **Auto Campaign Updates** - Automatically updates all enabled campaigns with fresh tracking parameters
✅ **Smart Update Modes** - Choose between "always update" or "only update on change"
✅ **Campaign Filtering** - Optional label-based filtering to target specific campaigns
✅ **Error Handling** - Built-in retry logic with detailed error tracking
✅ **Comprehensive Logging** - Detailed logs for each cycle + execution summary
✅ **Dry Run Mode** - Test the script without actually updating campaigns
✅ **Timeout Protection** - Exits gracefully before Google Ads 30-minute timeout

## How It Works

```
Script Start
    ↓
Configure Timer (25 min max runtime)
    ↓
    ┌─────────────────────────────┐
    │  Main Loop (while time)     │
    │                             │
    │  1. Call API for suffix     │
    │  2. Check if changed        │
    │  3. Update campaigns        │
    │  4. Log results             │
    │  5. Sleep until next cycle  │
    └─────────────────────────────┘
    ↓
Exit Gracefully & Log Summary
```

### Execution Timeline Example

With default settings (5-minute intervals, 25-minute max runtime):

```
00:00 - Script starts
00:00 - Cycle #1: API call → Update campaigns
00:05 - Cycle #2: API call → Update campaigns
00:10 - Cycle #3: API call → Update campaigns
00:15 - Cycle #4: API call → Update campaigns
00:20 - Cycle #5: API call → Update campaigns
00:25 - Exit gracefully (approaching timeout)
```

**Result**: 5 API calls and 5 campaign update cycles in a single script execution!

## Configuration Variables

### Required Configuration

```javascript
var OFFER_NAME = 'OFFER_NAME';
```
Replace with your actual offer name from the Offers page.

### Timing Configuration

```javascript
var RUN_INTERVAL_MS = 300000;
```
How often to call the API and update campaigns (in milliseconds).
- **300000 ms** (5 minutes) = 5 cycles per execution (recommended)
- **600000 ms** (10 minutes) = 2 cycles per execution
- **900000 ms** (15 minutes) = 1 cycle per execution
- **60000 ms** (1 minute) = For testing only

```javascript
var MAX_RUNTIME_MS = 1500000;
```
Maximum runtime before graceful exit (in milliseconds). Must be less than Google Ads 30-min limit (1800000ms).
- **1500000 ms** (25 minutes) = recommended (5-minute safety buffer)
- **1680000 ms** (28 minutes) = aggressive (2-minute safety buffer)
- **300000 ms** (5 minutes) = For testing only

### Update Behavior

```javascript
var UPDATE_MODE = 'on_change';
```
Controls when campaigns are updated:
- **"on_change"** = Only update when suffix changes (recommended, saves API quota)
- **"always"** = Update every cycle regardless of changes

```javascript
var DELAY_MS = 1000;
```
Milliseconds to wait between API calls (1000ms = 1 second).

### Campaign Filtering

```javascript
var CAMPAIGN_LABEL_FILTER = '';
```
Optional: Filter campaigns by label.
- **Empty string** = Update all enabled campaigns
- **"TestCampaigns"** = Only update campaigns with "TestCampaigns" label
- **"HighPriority"** = Only update campaigns with "HighPriority" label

### Testing

```javascript
var DRY_RUN_MODE = false;
```
Set to `true` to test without actually updating campaigns.
- **false** = Production mode (updates campaigns)
- **true** = Dry run mode (logs what would happen, no changes)

## Setup Instructions

### Step 1: Copy the Script

1. Go to your Google Ads account
2. Navigate to **Tools & Settings** → **Bulk Actions** → **Scripts**
3. Click **"+ New Script"**
4. Copy the **Continuous Auto-Update** script from the Scripts page
5. Paste it into the Google Ads script editor

### Step 2: Configure Variables

Update the configuration variables at the top of the script:

```javascript
var OFFER_NAME = 'MyOffer123';           // Your actual offer name
var RUN_INTERVAL_MS = 300000;            // API call frequency (300000ms = 5 min)
var MAX_RUNTIME_MS = 1500000;            // Max runtime (1500000ms = 25 min)
var UPDATE_MODE = 'on_change';           // Update mode
var CAMPAIGN_LABEL_FILTER = '';          // Optional filter
var DRY_RUN_MODE = false;                // Set to true for testing
```

### Step 3: Test in Dry Run Mode

First, test without making changes:

```javascript
var DRY_RUN_MODE = true;
```

Run the script and check the logs. You should see:
- Configuration summary
- Cycle-by-cycle execution logs
- API response times
- Campaigns that WOULD be updated (but aren't in dry run mode)
- Execution summary

### Step 4: Run in Production Mode

Once testing is successful, switch to production:

```javascript
var DRY_RUN_MODE = false;
```

Run the script. It will now actually update your campaigns.

### Step 5: Schedule the Script

To keep campaigns continuously updated:

1. In Google Ads Scripts, select your script
2. Click **"Create Schedule"**
3. Set frequency: **Every 30 minutes** (recommended)
4. Set time range: **All day** or specific hours

This ensures the script runs every 30 minutes, giving you 5 API calls per execution.

## Understanding the Logs

### Script Start Log

```
====================================
CONTINUOUS CAMPAIGN UPDATER STARTED
====================================
Configuration:
  Offer Name: MyOffer123
  Run Interval: 5 minutes
  Max Runtime: 25 minutes
  Update Mode: on_change
  Campaign Filter: All enabled campaigns
  Dry Run: NO
  Delay Between Calls: 1000ms
====================================
```

### Cycle Logs

```
--- CYCLE #1 ---
Time: 12/19/2025, 2:30:00 PM
Elapsed: 0.02 / 25 minutes
Remaining: 24.98 minutes
[API SUCCESS] Response time: 234ms
[UPDATE MODE] Suffix changed - updating campaigns
  Old: utm_source=google&utm_campaign=old123
  New: utm_source=google&utm_campaign=new456
[CYCLE COMPLETE]
  API Calls: 1
  Suffix Changed: YES
  Campaigns Updated: 15
  Campaigns Failed: 0
  Campaigns Skipped: 0
[WAITING] Sleeping for 299 seconds until next cycle...
```

### Execution Summary

```
====================================
EXECUTION SUMMARY
====================================
Total Runtime: 25.03 minutes
Total Cycles: 5
Total API Calls: 5
Total Campaigns Updated: 75
Total Errors: 0
====================================
Script finished at: 12/19/2025, 2:55:03 PM
====================================
```

## Error Handling

The script includes robust error handling:

### API Call Errors

- **Automatic Retry**: Up to 3 attempts per API call
- **Exponential Backoff**: 2s, 4s, 6s delays between retries
- **Logging**: All failed attempts are logged with details

### Campaign Update Errors

- **Continue on Failure**: If one campaign fails, others still update
- **Detailed Logging**: Failed campaign names and error messages logged
- **Error Summary**: Total error count in execution summary

### Timeout Protection

- **Time Monitoring**: Continuously checks remaining time
- **Graceful Exit**: Stops before Google Ads timeout
- **Complete Logs**: Ensures final summary is always logged

## Best Practices

### For Maximum API Calls

```javascript
var RUN_INTERVAL_MS = 300000;    // 300000ms = 5 min (5 API calls per execution)
var MAX_RUNTIME_MS = 1500000;    // 1500000ms = 25 min (safe timeout buffer)
```

Schedule every 30 minutes = **240 API calls per day**

### For Balanced Performance

```javascript
var RUN_INTERVAL_MS = 600000;    // 600000ms = 10 min (2 API calls per execution)
var MAX_RUNTIME_MS = 1500000;    // 1500000ms = 25 min
```

Schedule every 30 minutes = **96 API calls per day**

### For Conservative Usage

```javascript
var RUN_INTERVAL_MS = 900000;    // 900000ms = 15 min (1-2 API calls per execution)
var MAX_RUNTIME_MS = 1500000;    // 1500000ms = 25 min
```

Schedule every 60 minutes = **24 API calls per day**

### For Specific Campaigns

```javascript
var CAMPAIGN_LABEL_FILTER = 'AutoUpdate';
```

Create a label "AutoUpdate" in Google Ads and apply it only to campaigns you want auto-updated.

### For Testing

```javascript
var DRY_RUN_MODE = true;
var RUN_INTERVAL_MS = 60000;     // 60000ms = 1 min (fast cycles for testing)
var MAX_RUNTIME_MS = 300000;     // 300000ms = 5 min (short runtime for testing)
```

## Troubleshooting

### Issue: Script times out

**Solution**: Reduce MAX_RUNTIME_MS to 1380000-1440000 ms (23-24 minutes)

### Issue: API calls failing

**Solution**: Check OFFER_NAME is correct, verify API endpoint is accessible

### Issue: Campaigns not updating

**Solution**:
- Check DRY_RUN_MODE is false
- Verify campaigns are enabled
- Check CAMPAIGN_LABEL_FILTER if using labels

### Issue: Too many API calls

**Solution**: Increase RUN_INTERVAL_MS or use UPDATE_MODE = 'on_change'

### Issue: Not enough API calls

**Solution**: Decrease RUN_INTERVAL_MS or schedule script more frequently

## Advanced Usage

### Update Only High-Value Campaigns

1. Create label "HighValue" in Google Ads
2. Apply to important campaigns
3. Set script: `var CAMPAIGN_LABEL_FILTER = 'HighValue';`

### Different Scripts for Different Offers

Create multiple scripts with different configurations:
- Script 1: OFFER_NAME = 'Offer1', RUN_INTERVAL_MS = 300000 (5 min)
- Script 2: OFFER_NAME = 'Offer2', RUN_INTERVAL_MS = 600000 (10 min)
- Script 3: OFFER_NAME = 'Offer3', RUN_INTERVAL_MS = 900000 (15 min)

### Monitoring Execution

Check Google Ads script logs regularly to:
- Verify API calls are succeeding
- Monitor campaign update counts
- Track errors and failures
- Optimize timing configuration

## Comparison: Basic vs Continuous Script

| Feature | Basic Script | Continuous Script |
|---------|-------------|-------------------|
| API Calls per Run | 1 | 5+ (configurable) |
| Campaign Updates | Manual | Automatic |
| Runtime | < 1 second | 25 minutes |
| Timing Control | External schedule only | Internal timer + external schedule |
| Update Modes | N/A | "always" or "on_change" |
| Error Handling | Basic | Advanced with retry |
| Logging | Minimal | Comprehensive |
| Dry Run Mode | No | Yes |

## Performance Metrics

With recommended settings (RUN_INTERVAL_MS = 300000, scheduled every 30 min):

- **48 script executions per day**
- **240 API calls per day**
- **240 campaign update cycles per day** (if UPDATE_MODE = "always")
- **~20 hours of total execution time per day** (48 executions × 25 min each)

## Support

For issues or questions:
1. Check the execution logs in Google Ads Scripts
2. Review the configuration variables
3. Test in DRY_RUN_MODE first
4. Consult the API endpoint documentation

## Version History

- **v1.0** - Initial release with continuous loop, internal timer, auto-updates, comprehensive logging
