// ============================================
// CONTINUOUS CAMPAIGN UPDATE CONFIGURATION
// ============================================

// REQUIRED: Your offer name
var OFFER_NAME = 'OFFER_NAME';

// How often to call API and update campaigns (in milliseconds)
// Examples:
// - 300000 = 5 minutes (recommended)
// - 600000 = 10 minutes
// - 900000 = 15 minutes
// - 60000 = 1 minute (for testing)
var RUN_INTERVAL_MS = 300000;

// Maximum script runtime before timeout (in milliseconds)
// Google Ads limit is 30 minutes (1800000ms)
// Examples:
// - 1500000 = 25 minutes (recommended - safe buffer)
// - 1680000 = 28 minutes (aggressive - tight buffer)
// - 300000 = 5 minutes (for testing)
var MAX_RUNTIME_MS = 1500000;

// Delay between API calls (milliseconds)
var DELAY_MS = 1000;

// Update mode: "always" or "on_change"
// - "always": Update campaigns every cycle regardless of suffix changes
// - "on_change": Only update campaigns when suffix changes
var UPDATE_MODE = 'on_change';

// ============================================
// CAMPAIGN FILTERING OPTIONS (Choose ONE)
// ============================================

// Option 1: Filter by Campaign IDs (recommended - most precise)
// Array of campaign IDs to update. Leave empty [] to disable.
// Example: ['12345678', '87654321', '11223344']
// To find campaign IDs: Go to Campaigns tab, click on campaign, check URL for campaignId=XXXXXXXXXX
var CAMPAIGN_IDS = [];

// Option 2: Filter by Label (fallback if no IDs specified)
// Empty string = all enabled campaigns
// Example: 'auto-update' or 'offer-campaigns'
var CAMPAIGN_LABEL_FILTER = '';

// Dry run mode: Set to true to test without actually updating campaigns
var DRY_RUN_MODE = false;

// ============================================
// STATE TRACKING
// ============================================
var executionState = {
  startTime: new Date().getTime(),
  lastApiCall: 0,
  lastSuffix: '',
  totalApiCalls: 0,
  totalCampaignsUpdated: 0,
  cycleNumber: 0,
  errors: []
};

// ============================================
// API CALL FUNCTION
// ============================================
function callGetSuffixAPI() {
  executionState.totalApiCalls++;

  var url = 'https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/get-suffix?offer_name=' + encodeURIComponent(OFFER_NAME);

  var options = {
    'method': 'get',
    'muteHttpExceptions': true
  };

  var maxRetries = 3;
  var retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      var callStart = new Date().getTime();
      var response = UrlFetchApp.fetch(url, options);
      var callEnd = new Date().getTime();
      var json = JSON.parse(response.getContentText());

      if (json.success && json.suffix) {
        Logger.log('[API SUCCESS] Response time: ' + (callEnd - callStart) + 'ms');
        return {
          success: true,
          suffix: json.suffix,
          finalUrl: json.final_url,
          changed: json.suffix !== executionState.lastSuffix,
          timestamp: new Date()
        };
      } else {
        Logger.log('[API ERROR] Invalid response: ' + JSON.stringify(json));
      }
    } catch (e) {
      retryCount++;
      Logger.log('[API ERROR] Attempt ' + retryCount + '/' + maxRetries + ': ' + e.toString());

      if (retryCount < maxRetries) {
        Utilities.sleep(2000 * retryCount);
      } else {
        executionState.errors.push({
          type: 'api_error',
          message: e.toString(),
          timestamp: new Date()
        });
      }
    }
  }

  return {
    success: false,
    error: 'Failed after ' + maxRetries + ' attempts'
  };
}

// ============================================
// CAMPAIGN UPDATE FUNCTION
// ============================================
function updateCampaigns() {
  var campaignSelector;

  // Priority 1: Filter by Campaign IDs if provided
  if (CAMPAIGN_IDS && CAMPAIGN_IDS.length > 0) {
    Logger.log('[FILTER] Using Campaign IDs: ' + CAMPAIGN_IDS.join(', '));
    
    // Build ID filter condition
    var idConditions = [];
    for (var i = 0; i < CAMPAIGN_IDS.length; i++) {
      idConditions.push('Id = ' + CAMPAIGN_IDS[i]);
    }
    var idFilter = '(' + idConditions.join(' OR ') + ')';
    
    campaignSelector = AdsApp.campaigns()
      .withCondition('Status = ENABLED')
      .withCondition(idFilter);
  }
  // Priority 2: Filter by Label if no IDs specified
  else if (CAMPAIGN_LABEL_FILTER && CAMPAIGN_LABEL_FILTER !== '') {
    Logger.log('[FILTER] Using Label: ' + CAMPAIGN_LABEL_FILTER);
    campaignSelector = AdsApp.campaigns()
      .withCondition('Status = ENABLED')
      .withCondition('LabelNames CONTAINS_ANY ["' + CAMPAIGN_LABEL_FILTER + '"]');
  }
  // Priority 3: All enabled campaigns
  else {
    Logger.log('[FILTER] Using all enabled campaigns');
    campaignSelector = AdsApp.campaigns()
      .withCondition('Status = ENABLED');
  }

  var campaigns = campaignSelector.get();
  var updatedCount = 0;
  var failedCount = 0;
  var skippedCount = 0;
  var apiCallsThisCycle = 0;

  while (campaigns.hasNext()) {
    var campaign = campaigns.next();

    try {
      if (DRY_RUN_MODE) {
        Logger.log('[DRY RUN] Would call API and update campaign: ' + campaign.getName() + ' (ID: ' + campaign.getId() + ')');
        skippedCount++;
      } else {
        // Call API to get UNIQUE suffix for THIS campaign
        var apiResult = callGetSuffixAPI();
        apiCallsThisCycle++;
        
        if (apiResult.success) {
          campaign.urls().setFinalUrlSuffix(apiResult.suffix);
          Logger.log('[UPDATED] ' + campaign.getName() + ' (ID: ' + campaign.getId() + ') with unique suffix: ' + apiResult.suffix.substring(0, 50) + '...');
          updatedCount++;
          
          // Add small delay between API calls to avoid rate limits
          if (DELAY_MS > 0) {
            Utilities.sleep(DELAY_MS);
          }
        } else {
          failedCount++;
          Logger.log('[API ERROR] Failed to get suffix for ' + campaign.getName() + ' (ID: ' + campaign.getId() + '): ' + (apiResult.error || 'Unknown error'));
          executionState.errors.push({
            type: 'api_error',
            campaign: campaign.getName(),
            campaignId: campaign.getId(),
            message: apiResult.error || 'Failed to get suffix from API',
            timestamp: new Date()
          });
        }
      }
    } catch (e) {
      failedCount++;
      Logger.log('[CAMPAIGN ERROR] Failed to update ' + campaign.getName() + ' (ID: ' + campaign.getId() + '): ' + e.toString());
      executionState.errors.push({
        type: 'campaign_update_error',
        campaign: campaign.getName(),
        campaignId: campaign.getId(),
        message: e.toString(),
        timestamp: new Date()
      });
    }
  }

  executionState.totalCampaignsUpdated += updatedCount;

  return {
    updated: updatedCount,
    failed: failedCount,
    skipped: skippedCount,
    apiCalls: apiCallsThisCycle
  };
}

// ============================================
// TIME CALCULATION HELPERS
// ============================================
function getElapsedMs() {
  return new Date().getTime() - executionState.startTime;
}

function getRemainingMs() {
  return MAX_RUNTIME_MS - getElapsedMs();
}

function hasEnoughTime() {
  return getRemainingMs() > (RUN_INTERVAL_MS + 120000);
}

function formatMs(ms) {
  var seconds = Math.floor(ms / 1000);
  var minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return minutes + 'm ' + seconds + 's';
}

// ============================================
// LOGGING FUNCTIONS
// ============================================
function logScriptStart() {
  Logger.log('====================================');
  Logger.log('CONTINUOUS CAMPAIGN UPDATER STARTED');
  Logger.log('====================================');
  Logger.log('Configuration:');
  Logger.log('  Offer Name: ' + OFFER_NAME);
  Logger.log('  Run Interval: ' + formatMs(RUN_INTERVAL_MS));
  Logger.log('  Max Runtime: ' + formatMs(MAX_RUNTIME_MS));
  Logger.log('  Update Mode: ' + UPDATE_MODE);
  
  if (CAMPAIGN_IDS && CAMPAIGN_IDS.length > 0) {
    Logger.log('  Campaign Filter: IDs [' + CAMPAIGN_IDS.join(', ') + ']');
  } else if (CAMPAIGN_LABEL_FILTER) {
    Logger.log('  Campaign Filter: Label "' + CAMPAIGN_LABEL_FILTER + '"');
  } else {
    Logger.log('  Campaign Filter: All enabled campaigns');
  }
  
  Logger.log('  Dry Run: ' + (DRY_RUN_MODE ? 'YES' : 'NO'));
  Logger.log('  Delay Between Calls: ' + DELAY_MS + 'ms');
  Logger.log('====================================');
}

function logCycleStart() {
  executionState.cycleNumber++;
  Logger.log('');
  Logger.log('--- CYCLE #' + executionState.cycleNumber + ' ---');
  Logger.log('Time: ' + new Date().toLocaleString());
  Logger.log('Elapsed: ' + formatMs(getElapsedMs()) + ' / ' + formatMs(MAX_RUNTIME_MS));
  Logger.log('Remaining: ' + formatMs(getRemainingMs()));
}

function logCycleEnd(apiResult, updateResult) {
  if (apiResult.success) {
    Logger.log('[CYCLE COMPLETE]');
    Logger.log('  API Calls: ' + executionState.totalApiCalls);
    Logger.log('  Suffix Changed: ' + (apiResult.changed ? 'YES' : 'NO'));

    if (updateResult) {
      Logger.log('  Campaigns Updated: ' + updateResult.updated);
      Logger.log('  Campaigns Failed: ' + updateResult.failed);
      Logger.log('  Campaigns Skipped: ' + updateResult.skipped);
    }
  } else {
    Logger.log('[CYCLE FAILED] ' + (apiResult.error || 'Unknown error'));
  }
}

function logFinalSummary() {
  Logger.log('');
  Logger.log('====================================');
  Logger.log('EXECUTION SUMMARY');
  Logger.log('====================================');
  Logger.log('Total Runtime: ' + formatMs(getElapsedMs()));
  Logger.log('Total Cycles: ' + executionState.cycleNumber);
  Logger.log('Total API Calls: ' + executionState.totalApiCalls);
  Logger.log('Total Campaigns Updated: ' + executionState.totalCampaignsUpdated);
  Logger.log('Total Errors: ' + executionState.errors.length);

  if (executionState.errors.length > 0) {
    Logger.log('');
    Logger.log('Error Details:');
    for (var i = 0; i < executionState.errors.length; i++) {
      var error = executionState.errors[i];
      Logger.log('  [' + error.type + '] ' + error.message);
      if (error.campaignId) {
        Logger.log('    Campaign ID: ' + error.campaignId);
      }
    }
  }

  Logger.log('====================================');
  Logger.log('Script finished at: ' + new Date().toLocaleString());
  Logger.log('====================================');
}

// ============================================
// MAIN EXECUTION LOOP
// ============================================
function main() {
  logScriptStart();

  try {
    while (hasEnoughTime()) {
      logCycleStart();

      // Add delay if configured
      if (DELAY_MS > 0 && executionState.cycleNumber > 1) {
        Utilities.sleep(DELAY_MS);
      }

      // Call API to get fresh suffix
      var apiResult = callGetSuffixAPI();

      if (apiResult.success) {
        var shouldUpdate = false;

        if (UPDATE_MODE === 'always') {
          shouldUpdate = true;
          Logger.log('[UPDATE MODE] Always update mode - updating campaigns');
        } else if (UPDATE_MODE === 'on_change') {
          if (apiResult.changed) {
            shouldUpdate = true;
            Logger.log('[UPDATE MODE] Suffix changed - updating campaigns');
            Logger.log('  Old: ' + executionState.lastSuffix);
            Logger.log('  New: ' + apiResult.suffix);
          } else {
            Logger.log('[UPDATE MODE] Suffix unchanged - skipping campaign updates');
          }
        }

        var updateResult = null;

        if (shouldUpdate) {
          updateResult = updateCampaigns(apiResult.suffix, apiResult.finalUrl);
        }

        // Update last known suffix
        executionState.lastSuffix = apiResult.suffix;

        logCycleEnd(apiResult, updateResult);
      } else {
        logCycleEnd(apiResult, null);
      }

      // Calculate sleep time until next cycle
      var sleepTime = RUN_INTERVAL_MS - DELAY_MS;

      if (sleepTime > 0 && hasEnoughTime()) {
        Logger.log('[WAITING] Sleeping for ' + formatMs(sleepTime) + ' until next cycle...');
        Utilities.sleep(sleepTime);
      }
    }

    Logger.log('');
    Logger.log('[TIMEOUT APPROACHING] Stopping execution to prevent timeout');

  } catch (e) {
    Logger.log('[FATAL ERROR] ' + e.toString());
    executionState.errors.push({
      type: 'fatal_error',
      message: e.toString(),
      timestamp: new Date()
    });
  }

  logFinalSummary();
}

// ============================================
// HELPER: Find Campaign IDs
// ============================================
// Uncomment and run this function once to find your campaign IDs
/*
function listCampaignIds() {
  Logger.log('====================================');
  Logger.log('LISTING ALL CAMPAIGN IDs');
  Logger.log('====================================');
  
  var campaigns = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .get();
  
  var count = 0;
  while (campaigns.hasNext()) {
    var campaign = campaigns.next();
    count++;
    Logger.log(count + '. ' + campaign.getName());
    Logger.log('   ID: ' + campaign.getId());
    Logger.log('   Status: ' + campaign.isEnabled() ? 'ENABLED' : 'DISABLED');
    Logger.log('');
  }
  
  Logger.log('====================================');
  Logger.log('Total campaigns: ' + count);
  Logger.log('====================================');
}
*/
