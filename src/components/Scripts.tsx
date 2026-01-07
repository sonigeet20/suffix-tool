import { useState } from 'react';
import { Copy, CheckCircle, FileCode, Code2, FileText, Play, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Scripts() {
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const [testUrl, setTestUrl] = useState('https://amzn.to/3BxQqXv');
  const [tracerMode, setTracerMode] = useState('http_only');
  const [isTracing, setIsTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<any>(null);

  const copyToClipboard = (text: string, scriptName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(scriptName);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const handleTraceTest = async () => {
    setIsTracing(true);
    setTraceResult(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();

      if (!user || !session) {
        alert('Please log in to test the tracer');
        return;
      }

      // Determine timeout based on tracer mode
      let timeout_ms = 60000;
      if (tracerMode === 'anti_cloaking') timeout_ms = 90000;
      else if (tracerMode === 'interactive') timeout_ms = 120000;
      else if (tracerMode === 'brightdata_browser') timeout_ms = 90000;

      const requestBody: any = {
        url: testUrl,
        max_redirects: 20,
        timeout_ms,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        tracer_mode: tracerMode,
      };

      // For Bright Data Browser mode, include user_id to auto-load API key from settings
      if (tracerMode === 'brightdata_browser') {
        requestBody.user_id = user.id;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/trace-redirects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      setTraceResult(result);
    } catch (error: any) {
      setTraceResult({
        success: false,
        error: error.message,
      });
    } finally {
      setIsTracing(false);
    }
  };

  const googleAdsScript = `// ============================================
// RATE CONTROL CONFIGURATION
// ============================================
// Adjust DELAY_MS to control API call speed:
// - 0 = No delay (fastest, use for testing)
// - 1000 = 1 second delay (60 calls/minute)
// - 2000 = 2 second delay (30 calls/minute)
// - 5000 = 5 second delay (12 calls/minute)
var DELAY_MS = 1000;

// Replace 'OFFER_NAME' with your actual offer name
var OFFER_NAME = 'OFFER_NAME';

// ============================================
// MAIN FUNCTION
// ============================================
function getTrackingUrl() {
  // Add delay to control API call rate
  if (DELAY_MS > 0) {
    Utilities.sleep(DELAY_MS);
  }

  var url = '${supabaseUrl}/functions/v1/get-suffix?offer_name=' + encodeURIComponent(OFFER_NAME);

  var options = {
    'method': 'get',
    'muteHttpExceptions': true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());

    if (json.success && json.suffix) {
      return json.final_url + '?' + json.suffix;
    }
  } catch (e) {
    Logger.log('Error fetching URL: ' + e.toString());
  }

  return '';
}

function main() {
  var trackingUrl = getTrackingUrl();
  Logger.log('Tracking URL: ' + trackingUrl);

  // Use this URL in your ad customizers
  return trackingUrl;
}`;

  const googleAdsScheduledScript = `// ============================================
// ADAPTIVE INTERVAL CONFIGURATION (V2)
// ============================================
// Dynamic delay based on yesterday's landing page frequency
// Automatically fetched from API endpoint
// V2: Script collects and sends its own landing page data
var CURRENT_INTERVAL_MS = 5000; // Default fallback (will be overridden by API)
var ACCOUNT_ID = ''; // Will be set at startup

// Configuration for interval calculation
var SUPABASE_URL = '${supabaseUrl}';
var OFFER_NAME = 'OFFER_NAME';
var DEFAULT_INTERVAL_MS = 5000;
var MIN_INTERVAL_MS = 1000;     // Minimum speed (never go below)
var MAX_INTERVAL_MS = 30000;    // Maximum speed (never go above)

// ============================================
// ACCOUNT ID HELPER
// ============================================
function getAccountId() {
  try {
    return AdsApp.currentAccount().getCustomerId();
  } catch (error) {
    Logger.log('⚠️ [ACCOUNT] Failed to get account ID: ' + error);
    return 'unknown';
  }
}

// ============================================
// GET YESTERDAY'S LANDING PAGES WITH CLICKS (NO REPORTS)
// ============================================
// Collects yesterday's landing page data using FINAL_URL_REPORT (working approach)
// Returns {url: clicks} for API calculation
function getYesterdayLandingPages() {
  try {
    Logger.log('[GOOGLE ADS] Collecting yesterday landing pages via FINAL_URL_REPORT...');
    
    var query = 'SELECT EffectiveFinalUrl, Clicks ' +
                'FROM FINAL_URL_REPORT ' +
                'DURING YESTERDAY';
    
    var report = AdsApp.report(query);
    var rows = report.rows();
    
    var landingPages = {};
    var totalClicks = 0;
    var processedRows = 0;
    
    while (rows.hasNext()) {
      var row = rows.next();
      var url = row['EffectiveFinalUrl'] || '';
      var clicks = parseInt(row['Clicks'], 10) || 0;
      
      if (url && clicks > 0) {
        landingPages[url] = (landingPages[url] || 0) + clicks;
        totalClicks += clicks;
        processedRows++;
      }
    }
    
    var uniquePages = Object.keys(landingPages).length;
    Logger.log('[REPORT] Yesterday results:');
    Logger.log('  Rows processed: ' + processedRows);
    Logger.log('  Unique landing pages: ' + uniquePages);
    Logger.log('  Total clicks: ' + totalClicks);
    
    // Log each landing page and its click count
    for (var url in landingPages) {
      Logger.log('  [LP] URL: ' + url + ' -> ' + landingPages[url] + ' clicks');
    }

    if (uniquePages > 0 && totalClicks > 0) {
      Logger.log('  Sending landing_page_counts to API');
      return landingPages;
    }
    return null;
  } catch (error) {
    Logger.log('⚠️ [REPORT] Failed to collect yesterday data: ' + error);
    return null;
  }
}

// ============================================
// FETCH RECOMMENDED INTERVAL (STARTUP)
// ============================================
function fetchRecommendedInterval() {
  Logger.log('[ADAPTIVE] Fetching recommended interval for offer: ' + OFFER_NAME);
  Logger.log('[ADAPTIVE] Account ID: ' + ACCOUNT_ID);
  
  try {
    // Get yesterday's landing page data (for click count)
    var yesterdayData = getYesterdayLandingPages();
    
    // Get account timezone for proper yesterday calculation
    var accountTimezone = '';
    try {
      accountTimezone = AdsApp.currentAccount().getTimeZone();
      Logger.log('[ADAPTIVE] Account Timezone: ' + accountTimezone);
    } catch (e) {
      Logger.log('⚠️ [ADAPTIVE] Could not get timezone, API will use UTC');
    }
    
    var url = SUPABASE_URL + '/functions/v1/get-recommended-interval?offer_name=' + encodeURIComponent(OFFER_NAME);
    url += '&account_id=' + encodeURIComponent(ACCOUNT_ID);
    
    var options = { 
      muteHttpExceptions: true,
      method: 'post',
      contentType: 'application/json'
    };
    
    // If we have yesterday's data, send click count and timezone
    if (yesterdayData && Object.keys(yesterdayData).length > 0) {
      var totalClicks = 0;
      for (var url_key in yesterdayData) {
        totalClicks += yesterdayData[url_key];
      }
      var uniqueLandingPages = Object.keys(yesterdayData).length;
      
      Logger.log('[ADAPTIVE] Sending: ' + totalClicks + ' clicks, ' + uniqueLandingPages + ' unique landing pages + timezone to API');
      options.payload = JSON.stringify({
        yesterday_total_clicks: totalClicks,
        yesterday_unique_landing_pages: uniqueLandingPages,
        account_timezone: accountTimezone
      });
    } else {
      Logger.log('[ADAPTIVE] No yesterday data available, using database fallback');
      options.payload = JSON.stringify({
        yesterday_total_clicks: 0,
        yesterday_unique_landing_pages: 0,
        account_timezone: accountTimezone
      });
    }
    
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    Logger.log('[DEBUG] API Response Code: ' + responseCode);
    Logger.log('[DEBUG] API Response: ' + responseText.substring(0, 500));
    
    if (responseCode === 200) {
      var data = JSON.parse(responseText);
      Logger.log('[DEBUG] Parsed data - interval: ' + data.recommended_interval_ms);
      if (data.recommended_interval_ms) {
        CURRENT_INTERVAL_MS = data.recommended_interval_ms;
        Logger.log('✅ [ADAPTIVE] Using interval: ' + CURRENT_INTERVAL_MS + 'ms');
        Logger.log('   Data source: ' + (data.data_source || 'database'));
        Logger.log('   Yesterday interval: ' + (data.yesterday_interval_ms || 'none') + 'ms');
        Logger.log('   Yesterday clicks: ' + data.yesterday_clicks);
        Logger.log('   Yesterday landing pages: ' + data.yesterday_landing_pages);
        Logger.log('   Average repeats per page: ' + data.average_repeats);
        Logger.log('   Used fallback: ' + data.used_default_fallback);
        return true;
      } else {
        Logger.log('⚠️ [ADAPTIVE] API returned 200 but no recommended_interval_ms in response');
        Logger.log('[DEBUG] Full response: ' + responseText);
      }
    } else {
      Logger.log('⚠️ [ADAPTIVE] Failed to fetch interval (status ' + responseCode + '), using default');
      Logger.log('[DEBUG] Response: ' + responseText);
    }
  } catch (error) {
    Logger.log('⚠️ [ADAPTIVE] Error fetching interval: ' + error + ', using default');
  }
  
  CURRENT_INTERVAL_MS = DEFAULT_INTERVAL_MS;
  return false;
}

// ============================================
// CONTINUOUS CAMPAIGN UPDATE CONFIGURATION
// ============================================

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

// NOTE: Delay between individual campaign updates is now fetched dynamically
// from the endpoint via getCurrentIntervalFromAPI() - no hardcoded delay

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

// Yesterday's data - calculated ONCE at startup, reused for all API calls
var YESTERDAY_DATA_CACHE = null;
var YESTERDAY_TOTAL_CLICKS = 0;
var YESTERDAY_UNIQUE_PAGES = 0;

// ============================================
// DYNAMIC INTERVAL FETCHING
// ============================================
function getCurrentIntervalFromAPI() {
  try {
    // Use cached yesterday data (already calculated at startup)
    var totalClicks = YESTERDAY_TOTAL_CLICKS;
    var uniqueLandingPages = YESTERDAY_UNIQUE_PAGES;
    
    Logger.log('[INTERVAL] Using cached yesterday data: ' + totalClicks + ' clicks, ' + uniqueLandingPages + ' pages (no recalculation)');
    
    if (uniqueLandingPages === 0) {
      Logger.log('[INTERVAL] No landing page data, using default: ' + DEFAULT_INTERVAL_MS + 'ms');
      return DEFAULT_INTERVAL_MS;
    }
    
    var accountTimezone = AdsApp.currentAccount().getTimeZone();
    
    // Build URL with offer_name and account_id as query parameters (required by endpoint)
    var url = SUPABASE_URL + '/functions/v1/get-recommended-interval?offer_name=' + encodeURIComponent(OFFER_NAME);
    url += '&account_id=' + encodeURIComponent(ACCOUNT_ID);
    
    var payload = {
      yesterday_total_clicks: totalClicks,
      yesterday_unique_landing_pages: uniqueLandingPages,
      account_timezone: accountTimezone
    };
    
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();
    
    if (responseCode === 200) {
      var result = JSON.parse(responseText);
      if (result.recommended_interval_ms) {
        var cacheInfo = result.data_source === 'cache' ? ' (from API daily cache)' : ' (newly calculated)';
        Logger.log('[INTERVAL] Fetched: ' + result.recommended_interval_ms + 'ms' + cacheInfo);
        return result.recommended_interval_ms;
      }
    }
    
    Logger.log('[INTERVAL] API call failed, using default: ' + DEFAULT_INTERVAL_MS + 'ms');
    return DEFAULT_INTERVAL_MS;
  } catch (error) {
    Logger.log('[INTERVAL] Error fetching: ' + error + ', using default: ' + DEFAULT_INTERVAL_MS + 'ms');
    return DEFAULT_INTERVAL_MS;
  }
}

// ============================================
// API CALL FUNCTION
// ============================================
function callGetSuffixAPI(campaignCount, intervalToUse) {
  executionState.totalApiCalls++;
  
  campaignCount = campaignCount || 1;
  intervalToUse = intervalToUse || DEFAULT_INTERVAL_MS;
  
  var url = SUPABASE_URL + '/functions/v1/get-suffix?offer_name=' + encodeURIComponent(OFFER_NAME);
  
  // Add account_id parameter for multi-account support
  url += '&account_id=' + encodeURIComponent(ACCOUNT_ID);
  
  // Add campaign_count parameter for batch requests
  if (campaignCount > 1) {
    url += '&campaign_count=' + campaignCount;
    Logger.log('[API] Requesting ' + campaignCount + ' unique suffixes');
  }
  
  // Pass the interval to track actual speed used
  if (intervalToUse > 0) {
    url += '&interval_used=' + intervalToUse;
  }

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

      if (json.success) {
        Logger.log('[API SUCCESS] Response time: ' + (callEnd - callStart) + 'ms');
        
        return {
          success: true,
          suffix: json.suffix || '',
          suffixes: json.suffixes || [],
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
function updateCampaigns(currentInterval) {
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

  // First, count campaigns
  var campaigns = campaignSelector.get();
  var campaignList = [];
  while (campaigns.hasNext()) {
    campaignList.push(campaigns.next());
  }
  
  var campaignCount = campaignList.length;
  Logger.log('[INFO] Found ' + campaignCount + ' campaigns to update');
  
  if (campaignCount === 0) {
    return {
      updated: 0,
      failed: 0,
      skipped: 0,
      apiCalls: 0
    };
  }

  var updatedCount = 0;
  var failedCount = 0;
  var skippedCount = 0;

  // Use the interval passed from main loop (already fetched once per cycle)
  Logger.log('[INTERVAL] Using pre-fetched interval: ' + currentInterval + 'ms');

  if (DRY_RUN_MODE) {
    Logger.log('[DRY RUN] Would call API once for ' + campaignCount + ' campaigns');
    for (var i = 0; i < campaignList.length; i++) {
      Logger.log('[DRY RUN] Would update: ' + campaignList[i].getName() + ' (ID: ' + campaignList[i].getId() + ')');
      skippedCount++;
    }
    return {
      updated: 0,
      failed: 0,
      skipped: skippedCount,
      apiCalls: 0
    };
  }

  // Make SINGLE API call requesting multiple unique suffixes
  Logger.log('[API] Calling API once with campaign_count=' + campaignCount);
  var apiResult = callGetSuffixAPI(campaignCount, currentInterval);
  
  if (!apiResult.success) {
    Logger.log('[API ERROR] Failed to get suffixes: ' + (apiResult.error || 'Unknown error'));
    executionState.errors.push({
      type: 'api_error',
      message: apiResult.error || 'Failed to get suffixes from API',
      timestamp: new Date()
    });
    return {
      updated: 0,
      failed: campaignCount,
      skipped: 0,
      apiCalls: 1
    };
  }
  
  // Get suffixes array (or single suffix for backward compatibility)
  var suffixes = [];
  if (apiResult.suffixes && apiResult.suffixes.length > 0) {
    suffixes = apiResult.suffixes;
    Logger.log('[API] Received ' + suffixes.length + ' unique suffixes');
  } else if (apiResult.suffix) {
    // Backward compatibility: single suffix
    suffixes = [{ suffix: apiResult.suffix }];
    Logger.log('[API] Received single suffix (backward compatibility mode)');
  }
  
  if (suffixes.length === 0) {
    Logger.log('[ERROR] No suffixes received from API');
    return {
      updated: 0,
      failed: campaignCount,
      skipped: 0,
      apiCalls: 1
    };
  }

  // Distribute unique suffixes to campaigns
  for (var i = 0; i < campaignList.length; i++) {
    var campaign = campaignList[i];
    
    // Use suffix from array, or reuse last if we run out
    var suffixIndex = Math.min(i, suffixes.length - 1);
    var suffixData = suffixes[suffixIndex];
    var suffix = suffixData.suffix || suffixData;
    
    try {
      campaign.urls().setFinalUrlSuffix(suffix);
      Logger.log('[UPDATED] ' + campaign.getName() + ' (ID: ' + campaign.getId() + ') with unique suffix #' + (suffixIndex + 1));
      updatedCount++;
      
      // Use pre-fetched interval for delay between campaigns
      if (i < campaignList.length - 1 && currentInterval > 0) {
        Logger.log('[DELAY] Waiting ' + currentInterval + 'ms before next update');
        Utilities.sleep(currentInterval);
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
    apiCalls: 1
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
  // Check if we have enough time for another cycle (max interval + 2min buffer)
  // Using MAX_INTERVAL_MS (30000) + 120000 buffer = 150000ms = 2.5 minutes
  return getRemainingMs() > (MAX_INTERVAL_MS + 120000);
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
  
  // Show filter method
  if (CAMPAIGN_IDS && CAMPAIGN_IDS.length > 0) {
    Logger.log('  Filter Method: Campaign IDs');
    Logger.log('  Campaign IDs: ' + CAMPAIGN_IDS.join(', '));
  } else if (CAMPAIGN_LABEL_FILTER && CAMPAIGN_LABEL_FILTER !== '') {
    Logger.log('  Filter Method: Campaign Label');
    Logger.log('  Campaign Label: ' + CAMPAIGN_LABEL_FILTER);
  } else {
    Logger.log('  Filter Method: All enabled campaigns');
  }
  
  Logger.log('  Dry Run: ' + (DRY_RUN_MODE ? 'YES' : 'NO'));
  Logger.log('  Note: Interval fetched dynamically from endpoint before each delay');
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
  // Set account ID at startup
  ACCOUNT_ID = getAccountId();
  Logger.log('[STARTUP] Account ID: ' + ACCOUNT_ID);
  
  logScriptStart();

  // Calculate yesterday's data ONCE at startup (expensive query)
  Logger.log('[STARTUP] Calculating yesterday\\'s landing page data (one-time calculation)...');
  YESTERDAY_DATA_CACHE = getYesterdayLandingPages();
  
  if (YESTERDAY_DATA_CACHE) {
    YESTERDAY_TOTAL_CLICKS = 0;
    for (var url in YESTERDAY_DATA_CACHE) {
      YESTERDAY_TOTAL_CLICKS += YESTERDAY_DATA_CACHE[url];
    }
    YESTERDAY_UNIQUE_PAGES = Object.keys(YESTERDAY_DATA_CACHE).length;
    Logger.log('[STARTUP] Cached yesterday data: ' + YESTERDAY_TOTAL_CLICKS + ' clicks, ' + YESTERDAY_UNIQUE_PAGES + ' unique pages');
  } else {
    Logger.log('[STARTUP] No yesterday data available, will use defaults');
    YESTERDAY_TOTAL_CLICKS = 0;
    YESTERDAY_UNIQUE_PAGES = 0;
  }

  // Interval is now fetched dynamically from endpoint before each use
  Logger.log('[STARTUP] Interval will be fetched dynamically from endpoint before each delay');

  try {
    while (hasEnoughTime()) {
      logCycleStart();

      // Fetch interval ONCE at the start of each cycle
      Logger.log('[INTERVAL] Fetching interval for this cycle...');
      var cycleInterval = getCurrentIntervalFromAPI();
      Logger.log('[INTERVAL] Using ' + cycleInterval + 'ms for this entire cycle');

      // Update campaigns - each campaign gets a unique suffix from API
      Logger.log('[UPDATE MODE] Calling API once per campaign for unique parameters');
      var updateResult = updateCampaigns(cycleInterval); // Pass interval to avoid re-fetching
      
      // Log cycle results
      Logger.log('[CYCLE COMPLETE]');
      Logger.log('  API Calls This Cycle: ' + updateResult.apiCalls);
      Logger.log('  Campaigns Updated: ' + updateResult.updated);
      Logger.log('  Campaigns Failed: ' + updateResult.failed);
      Logger.log('  Campaigns Skipped: ' + updateResult.skipped);
      
      executionState.totalApiCalls += updateResult.apiCalls;

      // Sleep using the same interval we already fetched (no re-query)
      if (hasEnoughTime()) {
        Logger.log('[WAITING] Sleeping for ' + cycleInterval + 'ms until next cycle...');
        Utilities.sleep(cycleInterval);
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
// HELPER FUNCTIONS
// ============================================

/**
 * List all enabled campaigns with their IDs
 * Run this once to find Campaign IDs for the CAMPAIGN_IDS array
 */
function listCampaignIds() {
  Logger.log('\\n' + '='.repeat(60));
  Logger.log('CAMPAIGN ID FINDER');
  Logger.log('='.repeat(60));
  
  var campaigns = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .get();
  
  var count = 0;
  while (campaigns.hasNext()) {
    var campaign = campaigns.next();
    count++;
    Logger.log(count + '. ' + campaign.getName());
    Logger.log('   ID: ' + campaign.getId());
    Logger.log('   Status: ' + campaign.getStatsFor('LAST_30_DAYS').getClicks() + ' clicks (30d)');
    Logger.log('');
  }
  
  Logger.log('='.repeat(60));
  Logger.log('Total: ' + count + ' enabled campaigns');
  Logger.log('='.repeat(60));
}`;

  const trackingTemplate = `${supabaseUrl}/functions/v1/get-suffix?offer_name=OFFER_NAME&redirect=true`;

  const jsSnippet = `<script>
(function() {
  // Replace 'OFFER_NAME' with your actual offer name
  var offerName = 'OFFER_NAME';

  var apiUrl = '${supabaseUrl}/functions/v1/get-suffix?offer_name=' + encodeURIComponent(offerName);

  fetch(apiUrl)
    .then(function(response) { return response.json(); })
    .then(function(data) {
      if (data.success && data.suffix) {
        var redirectUrl = data.final_url + '?' + data.suffix;
        window.location.href = redirectUrl;
      } else {
        console.error('Failed to get tracking parameters');
      }
    })
    .catch(function(error) {
      console.error('Error:', error);
    });
})();
</script>`;

  const trackHitPixel = `<!-- Replace 'OFFER_NAME' with your actual offer name -->
<img src="${supabaseUrl}/functions/v1/track-hit-instant?offer=OFFER_NAME" width="1" height="1" style="display:none" />`;

  const trackHitRedirect = `<!-- Replace 'OFFER_NAME' with your actual offer name -->
<a href="${supabaseUrl}/functions/v1/track-hit-instant?offer=OFFER_NAME&redirect=true">
  Click Here
</a>`;

  const curlExample = `# Get Suffix (with redirect)
curl "${supabaseUrl}/functions/v1/get-suffix?offer_name=OFFER_NAME&redirect=true"

# Track Hit Instant (with instant redirect - RECOMMENDED)
curl "${supabaseUrl}/functions/v1/track-hit-instant?offer=OFFER_NAME&redirect=true"

# Trace Redirects (via EC2 Proxy Service)
# Note: Configure VITE_EC2_PROXY_URL in .env first
curl -X POST "http://YOUR_EC2_IP:3000/trace" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/tracking-url",
    "max_redirects": 20,
    "timeout_ms": 60000
  }'`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Integration Scripts</h2>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Ready-to-use scripts for Google Ads, landing pages, and tracking. Replace 'OFFER_NAME' with your actual offer name.
        </p>
      </div>

      <div className="bg-gradient-to-r from-brand-50 to-brand-100 dark:from-brand-900/20 dark:to-brand-800/20 border border-brand-200 dark:border-brand-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Play className="text-brand-600 dark:text-brand-400" size={24} />
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Test Redirect Tracer</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Tracer Mode
            </label>
            <select
              value={tracerMode}
              onChange={(e) => setTracerMode(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth"
            >
              <option value="http_only">HTTP-Only (Fast, 2-5s) - Recommended for testing</option>
              <option value="browser">Browser (Complex, 10-30s) - Full JS + Popups</option>
              <option value="anti_cloaking">Anti-Cloaking (Advanced, 15-60s) - Stealth mode</option>
              <option value="interactive">Interactive (Engagement, 20-40s) - Session engagement</option>
              <option value="brightdata_browser">Bright Data Browser (5-15s) - Premium proxy, minimal bandwidth</option>
            </select>
            <div className="mt-2 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <p className="flex items-start gap-1">
                <span className="font-semibold text-success-700 dark:text-success-400">HTTP-Only:</span>
                <span>Simple redirect following. Fast and efficient.</span>
              </p>
              <p className="flex items-start gap-1">
                <span className="font-semibold text-warning-700 dark:text-warning-400">Browser:</span>
                <span>Full JavaScript execution with popup tracking.</span>
              </p>
              <p className="flex items-start gap-1">
                <span className="font-semibold text-brand-700 dark:text-brand-400">Anti-Cloaking:</span>
                <span>Bypasses bot detection, decodes obfuscation, tracks popups.</span>
              </p>
              <p className="flex items-start gap-1">
                <span className="font-semibold text-purple-700 dark:text-purple-400">Bright Data Browser:</span>
                <span>Premium residential proxy with browser automation, minimal bandwidth usage.</span>
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              URL to Trace
            </label>
            <input
              type="text"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-850 text-neutral-900 dark:text-neutral-50 focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 focus:border-brand-500 dark:focus:border-brand-400 outline-none transition-smooth placeholder-neutral-400 dark:placeholder-neutral-500"
            />
            <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
              Luna Proxy will be automatically used if credentials are configured in Settings
            </p>
          </div>

          <button
            onClick={handleTraceTest}
            disabled={isTracing || !testUrl}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTracing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Tracing...
              </>
            ) : (
              <>
                <Play size={18} />
                Trace Redirects
              </>
            )}
          </button>

          {traceResult && (
            <div className={`mt-4 p-4 rounded-lg ${traceResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {traceResult.success ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-green-900">Success!</span>
                    <div className="flex items-center gap-4">
                      <span className="text-green-700">{traceResult.total_steps} steps in {traceResult.total_timing_ms}ms</span>
                      {(traceResult as any).bandwidth_bytes && (
                        <span className="text-green-700 text-xs">📊 {((traceResult as any).bandwidth_bytes).toLocaleString()} B</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {traceResult.mode_used && (
                      <div>
                        <span className="text-green-700 font-medium">Mode Used:</span>
                        <span className={`ml-2 px-2 py-0.5 rounded font-semibold ${
                          traceResult.mode_used === 'http_only' ? 'bg-green-100 text-green-800' :
                          traceResult.mode_used === 'browser' ? 'bg-orange-100 text-orange-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>{traceResult.mode_used}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-green-700 font-medium">Proxy Used:</span>
                      <span className="ml-2 text-green-900">{traceResult.proxy_used ? 'Yes' : 'No'}</span>
                    </div>
                    {traceResult.proxy_ip && (
                      <div>
                        <span className="text-green-700 font-medium">Proxy IP:</span>
                        <span className="ml-2 text-green-900">{traceResult.proxy_ip}</span>
                      </div>
                    )}
                    {traceResult.geo_location?.country && (
                      <div>
                        <span className="text-green-700 font-medium">Location:</span>
                        <span className="ml-2 text-green-900">{traceResult.geo_location.city}, {traceResult.geo_location.country}</span>
                      </div>
                    )}
                    {traceResult.total_popups > 0 && (
                      <div>
                        <span className="text-green-700 font-medium">Popups Detected:</span>
                        <span className="ml-2 text-green-900">{traceResult.total_popups}</span>
                      </div>
                    )}
                    {traceResult.aggressiveness_level && (
                      <div>
                        <span className="text-green-700 font-medium">Aggressiveness:</span>
                        <span className="ml-2 text-green-900">{traceResult.aggressiveness_level}</span>
                      </div>
                    )}
                  </div>

                  {traceResult.cloaking_indicators && traceResult.cloaking_indicators.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded p-2">
                      <p className="text-xs font-semibold text-orange-900 mb-1">🕵️ Cloaking Indicators Detected:</p>
                      <div className="flex flex-wrap gap-1">
                        {traceResult.cloaking_indicators.map((indicator: string, idx: number) => (
                          <span key={idx} className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded">
                            {indicator}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-green-200 pt-3">
                    <p className="text-xs font-medium text-green-700 mb-2">Redirect Chain:</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {traceResult.chain?.map((step: any, idx: number) => (
                        <div key={idx} className="bg-white p-2 rounded text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-green-700">#{idx + 1}</span>
                            <span className={`px-2 py-0.5 rounded ${step.status >= 200 && step.status < 300 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {step.status}
                            </span>
                            <span className="text-gray-600">{step.redirect_type}</span>
                          </div>
                          <div className="mt-1 text-gray-700 truncate">{step.url}</div>
                          {step.timing_ms && <div className="text-gray-500 mt-1">{step.timing_ms}ms</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {traceResult.popup_chains && traceResult.popup_chains.length > 0 && (
                    <div className="border-t border-green-200 pt-3">
                      <p className="text-xs font-medium text-green-700 mb-2">🪟 Popup Windows ({traceResult.popup_chains.length}):</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {traceResult.popup_chains.map((popup: any, idx: number) => (
                          <div key={idx} className="bg-purple-50 border border-purple-200 p-2 rounded text-xs">
                            <div className="font-semibold text-purple-900 mb-1">Popup #{popup.popup_index}</div>
                            <div className="text-gray-700">
                              <span className="font-medium">From:</span> <span className="truncate block">{popup.opener_url}</span>
                            </div>
                            <div className="text-gray-700 mt-1">
                              <span className="font-medium">Final:</span> <span className="truncate block">{popup.final_url}</span>
                            </div>
                            {popup.chain && popup.chain.length > 0 && (
                              <div className="mt-1 text-gray-600">
                                {popup.chain.length} redirect step{popup.chain.length !== 1 ? 's' : ''} inside popup
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {traceResult.obfuscated_urls && traceResult.obfuscated_urls.length > 0 && (
                    <div className="border-t border-green-200 pt-3">
                      <p className="text-xs font-medium text-green-700 mb-2">🔍 Obfuscated URLs Found ({traceResult.obfuscated_urls.length}):</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {traceResult.obfuscated_urls.map((item: any, idx: number) => (
                          <div key={idx} className="bg-yellow-50 border border-yellow-200 p-2 rounded text-xs">
                            <div className="font-semibold text-yellow-900 mb-1">
                              Type: {item.type}
                            </div>
                            {item.encoded && (
                              <div className="text-gray-600 truncate">
                                <span className="font-medium">Encoded:</span> {item.encoded}
                              </div>
                            )}
                            {item.decoded && (
                              <div className="text-gray-700 truncate mt-1">
                                <span className="font-medium">Decoded:</span> {item.decoded}
                              </div>
                            )}
                            {item.url && (
                              <div className="text-gray-700 truncate mt-1">
                                <span className="font-medium">URL:</span> {item.url}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-red-900">
                  <p className="font-medium">Error:</p>
                  <p>{traceResult.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
        <p className="text-sm text-brand-900 dark:text-brand-300">
          <strong>Important:</strong> Replace 'OFFER_NAME' in all scripts with your actual offer name from the Offers page.
          The scripts will fetch fresh parameters on each call.
        </p>
      </div>

      <div className="grid gap-6">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="text-neutral-600 dark:text-neutral-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Google Ads Script (Baseline - Constant Delay)</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Fallback option: Simple script with fixed delay (5 seconds) - use if adaptive script fails
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(googleAdsScript, 'google-ads')}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-600 dark:bg-neutral-500 text-white rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-smooth"
            >
              {copiedScript === 'google-ads' ? (
                <>
                  <CheckCircle size={18} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={18} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📌 When to Use This Script</h4>
              <div className="text-sm text-blue-800 dark:text-blue-400 space-y-2">
                <p>Use this baseline script if:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>The adaptive script (below) fails or encounters errors</li>
                  <li>You want a simple, predictable constant delay</li>
                  <li>You're testing and want no dynamic interval calculation</li>
                  <li>You don't have data history yet (fresh offer)</li>
                </ul>
              </div>
            </div>

            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto max-h-96">
              {googleAdsScript}
            </pre>
            <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
              <h4 className="font-semibold text-warning-900 dark:text-warning-300 mb-2">⚙️ Rate Control Configuration</h4>
              <div className="text-sm text-warning-800 dark:text-warning-400 space-y-2">
                <p>
                  The <code className="bg-warning-100 dark:bg-warning-900/30 px-1 py-0.5 rounded">DELAY_MS</code> variable controls how fast the script calls your API endpoint.
                </p>
                <ul className="list-disc ml-5 space-y-1">
                  <li><strong>0 ms</strong> - No delay (fastest, for testing)</li>
                  <li><strong>1000 ms</strong> - 1 second between calls (60 calls/min)</li>
                  <li><strong>2000 ms</strong> - 2 seconds between calls (30 calls/min)</li>
                  <li><strong>5000 ms</strong> - 5 seconds between calls (12 calls/min, default)</li>
                </ul>
                <p className="pt-1">
                  Adjust based on your API limits and campaign requirements. Higher delays = slower API calls = lower server load.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-success-200 dark:border-success-800 overflow-hidden">
          <div className="bg-gradient-to-r from-success-50 to-emerald-50 dark:from-success-900/20 dark:to-emerald-900/20 px-6 py-4 border-b border-success-200 dark:border-success-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="text-success-600 dark:text-success-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Google Ads Script (Adaptive V2 - Multi-Account) ⚡</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  RECOMMENDED: Script collects & sends real landing page data with multi-account support for superior accuracy
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(googleAdsScheduledScript, 'google-ads-scheduled')}
              className="flex items-center gap-2 px-4 py-2 bg-success-600 dark:bg-success-500 text-white rounded-lg hover:bg-success-700 dark:hover:bg-success-600 transition-smooth"
            >
              {copiedScript === 'google-ads-scheduled' ? (
                <>
                  <CheckCircle size={18} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={18} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-success-50 dark:bg-success-900/20 border border-success-300 dark:border-success-800 rounded-lg p-4">
              <h4 className="font-semibold text-success-900 dark:text-success-300 mb-2">🚀 How Adaptive V2 Works (Better!)</h4>
              <div className="text-sm text-success-800 dark:text-success-400 space-y-2">
                <p className="font-semibold">Yesterday's Performance Data:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li><strong>Historical Data:</strong> Queries yesterday's AD_PERFORMANCE_REPORT for expanded landing pages</li>
                  <li><strong>Click Aggregation:</strong> Groups clicks by landing page URL (sums duplicates)</li>
                  <li><strong>Formula:</strong> next_interval = previous_interval × (5 / max_duplicates)</li>
                  <li><strong>Example Evolution:</strong> Day1 5000ms → 15 dup → 1666ms → 10 dup → 833ms → 6 dup → 694ms → 5 dup (stabilizes)</li>
                  <li><strong>Multi-Account:</strong> Uses account_id to track multiple accounts running same offer</li>
                  <li><strong>Daily Update:</strong> Recalculates each morning using previous day's performance</li>
                  <li><strong>Result:</strong> Adaptive interval based on yesterday's actual click distribution!</li>
                </ul>
                <p className="pt-2 font-semibold text-success-900 dark:text-success-300">
                  ✨ Uses AD_PERFORMANCE_REPORT - real yesterday's data with click metrics!
                </p>
              </div>
            </div>

            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto max-h-96">
              {googleAdsScheduledScript}
            </pre>

            <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
              <h4 className="font-semibold text-warning-900 dark:text-warning-300 mb-3">⚙️ Configuration Variables</h4>
              <div className="text-sm text-warning-800 dark:text-warning-400 space-y-3">
                <div>
                  <p className="font-semibold">OFFER_NAME</p>
                  <p className="ml-4">Your offer name (required)</p>
                </div>
                <div>
                  <p className="font-semibold">RUN_INTERVAL_MS</p>
                  <p className="ml-4">How often to call API in milliseconds (default: 300000 = 5 minutes)</p>
                  <p className="ml-4 text-xs mt-1">Examples: 60000=1m, 300000=5m, 600000=10m, 900000=15m</p>
                </div>
                <div>
                  <p className="font-semibold">MAX_RUNTIME_MS</p>
                  <p className="ml-4">Maximum runtime in milliseconds (default: 1500000 = 25 minutes)</p>
                  <p className="ml-4 text-xs mt-1">Examples: 300000=5m, 1500000=25m, 1680000=28m</p>
                </div>
                <div>
                  <p className="font-semibold">UPDATE_MODE</p>
                  <p className="ml-4">"always" = Update every cycle | "on_change" = Only when suffix changes</p>
                </div>
                <div>
                  <p className="font-semibold">CAMPAIGN_LABEL_FILTER</p>
                  <p className="ml-4">Optional: Filter campaigns by label (empty = all campaigns)</p>
                </div>
                <div>
                  <p className="font-semibold">DRY_RUN_MODE</p>
                  <p className="ml-4">Set to true to test without actually updating campaigns</p>
                </div>
                <div className="bg-success-100 dark:bg-success-900/30 rounded p-2">
                  <p className="font-semibold text-success-900 dark:text-success-200">📊 Smart Delay Calculation</p>
                  <p className="ml-4 text-xs mt-1 text-success-900 dark:text-success-300">Script calculates: <code>max(1000, min(30000, yesterday_interval × (5 / max_duplicates)))</code></p>
                  <p className="ml-4 text-xs mt-1 text-success-900 dark:text-success-300">Constraint: Between 1000ms (never overload) and 30000ms (max cap)</p>
                </div>
              </div>
            </div>

            <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-lg p-4">
              <h4 className="font-semibold text-success-900 dark:text-success-300 mb-2">📊 Expected Performance</h4>
              <div className="text-sm text-success-800 dark:text-success-400 space-y-2">
                <p>With default settings (RUN_INTERVAL_MS = 300000, MAX_RUNTIME_MS = 1500000):</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li><strong>~5 API calls</strong> during single execution (5 min intervals over 25 min)</li>
                  <li><strong>~5 campaign updates</strong> with dynamic intervals</li>
                  <li><strong>Automatic data collection:</strong> Each API call records the interval used</li>
                  <li><strong>Daily optimization:</strong> Tomorrow's interval recalculated from today's data</li>
                  <li><strong>Detailed logs:</strong> Shows actual interval used, API response times, campaign updates</li>
                </ul>
                <p className="pt-2">
                  Schedule this script every 30 minutes in Google Ads for continuous optimization!
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileCode className="text-success-600 dark:text-success-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Tracking Template (Direct)</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Paste directly into Google Ads tracking template field
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(trackingTemplate, 'tracking-template')}
              className="flex items-center gap-2 px-4 py-2 bg-success-600 dark:bg-success-500 text-white rounded-lg hover:bg-success-700 dark:hover:bg-success-600 transition-smooth"
            >
              {copiedScript === 'tracking-template' ? (
                <>
                  <CheckCircle size={18} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={18} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-6">
            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto">
              {trackingTemplate}
            </pre>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-brand-600 dark:text-brand-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">JavaScript Redirect Snippet</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Add to landing page for client-side redirect with fresh parameters
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(jsSnippet, 'js-snippet')}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth"
            >
              {copiedScript === 'js-snippet' ? (
                <>
                  <CheckCircle size={18} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={18} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-6">
            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto">
              {jsSnippet}
            </pre>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <FileCode className="text-warning-600 dark:text-warning-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Tracking Pixel & Redirect Link</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Use for visitor tracking (pixel) or redirect links
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tracking Pixel (No Redirect)</p>
                <button
                  onClick={() => copyToClipboard(trackHitPixel, 'pixel')}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-warning-600 dark:bg-warning-500 text-white rounded-lg hover:bg-warning-700 dark:hover:bg-warning-600 transition-smooth"
                >
                  {copiedScript === 'pixel' ? (
                    <>
                      <CheckCircle size={16} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto">
                {trackHitPixel}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Redirect Link</p>
                <button
                  onClick={() => copyToClipboard(trackHitRedirect, 'redirect-link')}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-warning-600 dark:bg-warning-500 text-white rounded-lg hover:bg-warning-700 dark:hover:bg-warning-600 transition-smooth"
                >
                  {copiedScript === 'redirect-link' ? (
                    <>
                      <CheckCircle size={16} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto">
                {trackHitRedirect}
              </pre>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileCode className="text-neutral-600 dark:text-neutral-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">cURL Examples</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  API testing and integration examples
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(curlExample, 'curl')}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-600 dark:bg-neutral-500 text-white rounded-lg hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-smooth"
            >
              {copiedScript === 'curl' ? (
                <>
                  <CheckCircle size={18} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={18} />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-6">
            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto">
              {curlExample}
            </pre>
          </div>
        </div>
      </div>

      <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
        <h4 className="font-semibold text-warning-900 dark:text-warning-300 mb-2">API Endpoints</h4>
        <div className="space-y-2 text-sm text-warning-800 dark:text-warning-400">
          <div>
            <strong>GET /functions/v1/get-suffix</strong>
            <p className="ml-4">Fetches fresh tracking parameters for an offer</p>
            <p className="ml-4 text-xs">Parameters: offer_name (required), redirect (optional)</p>
          </div>
          <div>
            <strong>GET /functions/v1/track-hit-instant</strong>
            <p className="ml-4">Instant redirect with background trace processing (RECOMMENDED)</p>
            <p className="ml-4 text-xs">Parameters: offer (required), gclid/fbclid (Google/Facebook tracking)</p>
            <p className="ml-4 text-xs mt-1">Response time: &lt; 200ms, processes traces asynchronously</p>
          </div>
          <div>
            <strong>POST /trace (EC2 Proxy Service)</strong>
            <p className="ml-4">Traces complete redirect chain with Luna residential proxy and dynamic user agents</p>
            <p className="ml-4 text-xs">Body: url, mode (http_only/browser), max_redirects, timeout_ms, proxy_ip (optional)</p>
            <p className="ml-4 text-xs mt-1">Modes: http_only (fast, 2-5s), browser (full rendering, 10-30s)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
