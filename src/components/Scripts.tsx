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
  // Scheduler panel state
  const [schedOfferName, setSchedOfferName] = useState('OFFER_NAME');
  const [schedAccountId, setSchedAccountId] = useState('');
  const [schedMinInterval, setSchedMinInterval] = useState<number>(1800);
  const [schedPaused, setSchedPaused] = useState<boolean>(false);
  const [schedAutoSchedule, setSchedAutoSchedule] = useState<boolean>(false);
  const [schedNextRun, setSchedNextRun] = useState<string>('');
  const [schedLoading, setSchedLoading] = useState<boolean>(false);
  const [schedMessage, setSchedMessage] = useState<string>('');
  // Executions status panel state
  const [execLoading, setExecLoading] = useState<boolean>(false);
  const [executions, setExecutions] = useState<any[]>([]);
  const [execMessage, setExecMessage] = useState<string>('');

  const copyToClipboard = (text: string, scriptName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(scriptName);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const loadSchedulerConfig = async () => {
    try {
      setSchedLoading(true);
      setSchedMessage('');
      if (!schedOfferName || !schedAccountId) {
        setSchedMessage('Offer name and account id are required');
        return;
      }
      const res = await fetch(`${supabaseUrl}/functions/v1/schedule-script-execution?action=get_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_name: schedOfferName, account_id: schedAccountId })
      });
      const json = await res.json();
      if (res.ok && json?.config) {
        setSchedPaused(!!json.config.is_paused);
        setSchedAutoSchedule(!!json.config.auto_schedule);
        setSchedMinInterval(json.config.min_interval_seconds ?? 1800);
        setSchedNextRun(json.config.next_earliest_run_at || '');
        setSchedMessage('Loaded current config');
      } else {
        setSchedMessage(json?.error || 'Failed to load config');
      }
    } catch (e: any) {
      setSchedMessage(e?.message || 'Error loading config');
    } finally {
      setSchedLoading(false);
    }
  };

  const saveSchedulerConfig = async () => {
    try {
      setSchedLoading(true);
      setSchedMessage('');
      if (!schedOfferName || !schedAccountId) {
        setSchedMessage('Offer name and account id are required');
        return;
      }
      const body: any = {
        offer_name: schedOfferName,
        account_id: schedAccountId,
        is_paused: schedPaused,
        auto_schedule: schedAutoSchedule,
        min_interval_seconds: Number(schedMinInterval)
      };
      const res = await fetch(`${supabaseUrl}/functions/v1/schedule-script-execution?action=update_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (res.ok) {
        setSchedMessage('Saved configuration');
      } else {
        setSchedMessage(json?.error || 'Failed to save');
      }
    } catch (e: any) {
      setSchedMessage(e?.message || 'Error saving config');
    } finally {
      setSchedLoading(false);
    }
  };

  const loadExecutions = async () => {
    try {
      setExecLoading(true);
      setExecMessage('');
      setExecutions([]);
      if (!schedOfferName || !schedAccountId) {
        setExecMessage('Offer name and account id are required');
        return;
      }
      const res = await fetch(`${supabaseUrl}/functions/v1/schedule-script-execution?action=list_executions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_name: schedOfferName, account_id: schedAccountId })
      });
      const json = await res.json();
      if (res.ok && json?.executions) {
        setExecutions(json.executions);
        setExecMessage(`Loaded ${json.executions.length} runs`);
      } else {
        setExecMessage(json?.error || 'Failed to load runs');
      }
    } catch (e: any) {
      setExecMessage(e?.message || 'Error loading runs');
    } finally {
      setExecLoading(false);
    }
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
// RATIO CONFIGURATION (V2+ DYNAMIC SLOWDOWN)
// ============================================
var TARGET_REPEAT_RATIO = 5;    // Target repeats per landing page (speedup)
var MIN_REPEAT_RATIO = 1.0;     // Minimum repeats per landing page (slowdown trigger)

// ============================================
// CALL BUDGET CONFIGURATION
// ============================================
// Max daily API calls = yesterday's clicks × this multiplier
// Example: 100 clicks × 10 = 1000 max calls per day
// Database override (per account+offer) takes highest priority
var CALL_BUDGET_MULTIPLIER = 10;

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
      Logger.log('[INTERVAL] No landing page data; delegating default to API with constraints. Default=' + DEFAULT_INTERVAL_MS + 'ms');
    }
    
    var accountTimezone = AdsApp.currentAccount().getTimeZone();
    
    // Build URL with offer_name and account_id as query parameters (required by endpoint)
    var url = SUPABASE_URL + '/functions/v1/get-recommended-interval?offer_name=' + encodeURIComponent(OFFER_NAME);
    url += '&account_id=' + encodeURIComponent(ACCOUNT_ID);
    
    // Pass script-level constraints to API (including day-0 default)
    var payload = {
      yesterday_total_clicks: totalClicks,
      yesterday_unique_landing_pages: uniqueLandingPages,
      account_timezone: accountTimezone,
      min_interval_ms: MIN_INTERVAL_MS,
      max_interval_ms: MAX_INTERVAL_MS,
      target_repeat_ratio: TARGET_REPEAT_RATIO,
      min_repeat_ratio: MIN_REPEAT_RATIO,
      call_budget_multiplier: CALL_BUDGET_MULTIPLIER,
      default_interval_ms: DEFAULT_INTERVAL_MS
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
      
      // No delay between campaigns for maximum speed
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
  // Run until time is up - no buffer for maximum 30-minute utilization
  return getRemainingMs() > 0;
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

      // Use the adaptive interval to pace how often the suffix API is called (one call per cycle)
      if (cycleInterval > 0) {
        Logger.log('[INTERVAL] Waiting ' + cycleInterval + 'ms before next cycle');
        Utilities.sleep(cycleInterval);
      }
    }

    Logger.log('');
    Logger.log('[RUNTIME COMPLETE] Reached 30-minute limit');

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

  const googleAdsV5AllIn = `// =============================================================
// GOOGLE ADS SCRIPT (V5 WEBHOOK ALL-IN)
// Single-webhook-per-offer, offer+account controls, bucket + queue
// 
// FLOW:
// 1. Webhook arrives → Gets suffix from bucket → Triggers trace → Queues (suffix attached)
// 2. Script polls queue → Gets pending webhooks (suffix already populated)
// 3. For each webhook:
//    - Apply suffix to Google Ads campaign
//    - Mark queue item as completed
// 4. Zero-click suffixes (once daily) → Stored in bucket
// 5. Background traces (triggered by webhook) → Update bucket
//
// BUCKET = Single source of truth for all suffixes
// Trace happens in WEBHOOK HANDLER, not in this script
//
// HOW TO USE
// 1) Set SUPABASE_URL to your project URL (already injected here).
// 2) Fill OFFER_BY_CAMPAIGN or OFFER_DEFAULT. Campaign mapping wins.
// 3) Optional: set ALLOWED_CAMPAIGN_IDS to limit updates.
// 4) Schedule hourly (or faster) in Google Ads scripts.
// 5) Trackier calls v5-webhook-conversion → handles trace + bucket + queue
// =============================================================

var SUPABASE_URL = '${supabaseUrl}';
var OFFER_DEFAULT = 'OFFER_NAME'; // used when no campaign-specific mapping found
var ACCOUNT_ID = ''; // auto-set at runtime

// Map Campaign IDs -> Offer names (single webhook per offer)
// Example: {'1234567890': 'OfferA', '2345678901': 'OfferB'}
var OFFER_BY_CAMPAIGN = {};

// Optional allow-list: leave empty to update all enabled campaigns
var ALLOWED_CAMPAIGN_IDS = [];

// Batch controls
var BATCH_SIZE = 15; // how many webhooks per run

// Zero-click fetch controls
var ZERO_CLICK_LOOKBACK_DAYS = 7; // fetch last 7 days
var ZERO_CLICK_FETCH_KEY = 'v5-zero-click-fetch'; // PropertiesService key

// Daily stats cache (repeat ratio helper)
var CACHE_KEY_STATS = 'v5-daily-stats';
var CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours cache

// =============================================================
// ENTRY POINT
// =============================================================
function main() {
  ACCOUNT_ID = getAccountId();
  Logger.log('=== V5 WEBHOOK (ALL-IN) ===');
  Logger.log('Account: ' + ACCOUNT_ID);

  // Step 1: Check and fetch zero-click suffixes (once daily)
  checkAndFetchZeroClickSuffixes();

  // Step 2: Collect landing page stats (cached for the day)
  var stats = getCachedLandingPages();
  if (!stats) {
    stats = collectYesterdayLandingPages();
    if (stats) {
      cacheStats(stats);
    }
  }

  // Step 3: Process webhook queue (suffix already attached by webhook handler)
  var webhooks = fetchWebhookQueue(BATCH_SIZE);

  if (webhooks.length === 0) {
    Logger.log('[IDLE] Nothing to process.');
    return;
  }

  var summary = applySuffixes(webhooks);
  if (summary.queueIds.length > 0) {
    markQueueItemsProcessed(summary.queueIds);
  }

  Logger.log('[DONE] Webhooks processed: ' + summary.processed + ', ads updated: ' + summary.updatedAds);
}

// =============================================================
// CORE FLOW
// =============================================================
function fetchWebhookQueue(limit) {
  try {
    var url = SUPABASE_URL + '/functions/v1/v5-fetch-queue?' +
      'account_id=' + encodeURIComponent(ACCOUNT_ID) +
      '&limit=' + encodeURIComponent(limit || BATCH_SIZE);

    var response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('[QUEUE] Non-200 response: ' + code);
      return [];
    }
    var data = JSON.parse(response.getContentText());
    if (!data || !data.success || !data.webhooks) return [];
    Logger.log('[QUEUE] Received ' + data.webhooks.length + ' items');
    
    // Map queue items to expected format with queue_id
    return data.webhooks.map(function(item) {
      return {
        queue_id: item.id,
        campaign_id: item.campaign_id,
        offer_name: item.offer_name,
        new_suffix: item.new_suffix || '', // Will be fetched from bucket if null
        source: 'webhook'
      };
    });
  } catch (e) {
    Logger.log('[QUEUE] Fetch failed: ' + e);
    return [];
  }
}



function applySuffixes(webhooks) {
  var queueIds = [];
  var updatedAds = 0;

  var iterator = getEligibleAds();
  while (iterator.hasNext()) {
    var ad = iterator.next();
    var campaignId = String(ad.getCampaign().getId());
    var match = popNextForCampaign(webhooks, campaignId);
    if (!match) {
      continue;
    }

    // Suffix is already attached by webhook handler
    if (!match.new_suffix) {
      Logger.log('[SKIP] No suffix attached for campaign ' + campaignId);
      continue;
    }
    
    var baseUrl = ad.urls().getFinalUrl();
    var nextUrl = appendSuffix(baseUrl, match.new_suffix);
    if (nextUrl === baseUrl) {
      Logger.log('[SKIP] No change for ad ' + ad.getId());
      continue;
    }

    ad.urls().setFinalUrl(nextUrl);
    updatedAds++;
    Logger.log('[UPDATE] Campaign ' + campaignId + ' updated with suffix: ' + match.new_suffix);

    // Mark queue item for completion
    if (match.queue_id) {
      queueIds.push(match.queue_id);
    }
  }

  return {
    processed: queueIds.length,
    queueIds: queueIds,
    updatedAds: updatedAds
  };
}

function popNextForCampaign(list, campaignId) {
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (item.campaign_id && String(item.campaign_id) !== String(campaignId)) {
      continue;
    }
    list.splice(i, 1);
    return item;
  }
  return null;
}

function getEligibleAds() {
  var selector = AdsApp.ads().withCondition('Status = ENABLED');
  if (ALLOWED_CAMPAIGN_IDS.length > 0) {
    var orParts = ALLOWED_CAMPAIGN_IDS.map(function(id) { return 'CampaignId = ' + id; });
    selector = selector.withCondition(orParts.join(' OR '));
  }
  return selector.get();
}

function resolveOfferName(item, campaignId) {
  if (item.offer_name) return item.offer_name;
  if (OFFER_BY_CAMPAIGN[campaignId]) return OFFER_BY_CAMPAIGN[campaignId];
  return OFFER_DEFAULT;
}

function appendSuffix(url, suffix) {
  if (!url) return url;
  if (!suffix) return url;

  var hasQuery = url.indexOf('?') !== -1;
  var separator = hasQuery ? '&' : '?';
  var cleanedSuffix = suffix.replace(/^\?+/, '');
  return url + separator + cleanedSuffix;
}







function markQueueItemsProcessed(queueIds) {
  if (!queueIds || queueIds.length === 0) return;
  try {
    // Call edge function to mark queue items as completed
    var payload = { queue_ids: queueIds, status: 'completed' };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(SUPABASE_URL + '/functions/v1/v5-update-queue-status', options);
    Logger.log('[MARK-QUEUE] Response: ' + resp.getResponseCode());
  } catch (e) {
    Logger.log('[MARK-QUEUE] Failed: ' + e);
  }
}



// =============================================================
// ZERO-CLICK SUFFIX FETCHING (DAILY)
// =============================================================
function checkAndFetchZeroClickSuffixes() {
  try {
    var props = PropertiesService.getScriptProperties();
    var lastFetch = props.getProperty(ZERO_CLICK_FETCH_KEY);
    var now = new Date().getTime();
    var ONE_DAY_MS = 24 * 60 * 60 * 1000;

    if (lastFetch) {
      var elapsed = now - parseInt(lastFetch, 10);
      if (elapsed < ONE_DAY_MS) {
        Logger.log('[ZERO-CLICK] Already fetched today. Next fetch in ' + Math.round((ONE_DAY_MS - elapsed) / 3600000) + ' hours');
        return;
      }
    }

    Logger.log('[ZERO-CLICK] Starting daily fetch (last ' + ZERO_CLICK_LOOKBACK_DAYS + ' days)...');

    // Fetch all campaigns (or use ALLOWED_CAMPAIGN_IDS if set)
    var campaignSelector = AdsApp.campaigns().withCondition('Status = ENABLED');
    if (ALLOWED_CAMPAIGN_IDS.length > 0) {
      var orParts = ALLOWED_CAMPAIGN_IDS.map(function(id) { return 'Id = ' + id; });
      campaignSelector = campaignSelector.withCondition(orParts.join(' OR '));
    }
    var campaigns = campaignSelector.get();

    var totalStored = 0;

    while (campaigns.hasNext()) {
      var campaign = campaigns.next();
      var campaignId = String(campaign.getId());
      var offerName = OFFER_BY_CAMPAIGN[campaignId] || OFFER_DEFAULT;

      Logger.log('[ZERO-CLICK] Fetching for campaign ' + campaignId + ' (offer: ' + offerName + ')...');

      var suffixes = fetchZeroClickForCampaign(campaignId);
      if (suffixes.length > 0) {
        var stored = storeZeroClickSuffixes(offerName, suffixes);
        totalStored += stored;
        Logger.log('[ZERO-CLICK] Stored ' + stored + ' suffixes for ' + offerName);
      }
    }

    Logger.log('[ZERO-CLICK] Complete! Total suffixes stored: ' + totalStored);
    props.setProperty(ZERO_CLICK_FETCH_KEY, String(now));

  } catch (e) {
    Logger.log('[ZERO-CLICK] Error: ' + e);
  }
}

function fetchZeroClickForCampaign(campaignId) {
  try {
    var query = 'SELECT EffectiveFinalUrl, Clicks, Impressions ' +
                'FROM FINAL_URL_REPORT ' +
                'WHERE CampaignId = ' + campaignId + ' ' +
                'AND Clicks = 0 ' +
                'AND Impressions > 0 ' +
                'DURING LAST_' + ZERO_CLICK_LOOKBACK_DAYS + '_DAYS';

    var report = AdsApp.report(query);
    var rows = report.rows();
    var suffixes = [];

    while (rows.hasNext()) {
      var row = rows.next();
      var finalUrl = row['EffectiveFinalUrl'] || '';
      var clicks = parseInt(row['Clicks'], 10) || 0;
      var impressions = parseInt(row['Impressions'], 10) || 0;

      if (finalUrl && clicks === 0 && impressions > 0) {
        var suffix = extractSuffixFromUrl(finalUrl);
        if (suffix && suffix.length > 10) {
          suffixes.push(suffix);
        }
      }
    }

    return suffixes;

  } catch (e) {
    Logger.log('[ZERO-CLICK] Fetch error for campaign ' + campaignId + ': ' + e);
    return [];
  }
}

function extractSuffixFromUrl(url) {
  try {
    if (!url || url.indexOf('?') === -1) return null;
    var parts = url.split('?');
    if (parts.length < 2) return null;
    return parts[1]; // Everything after the ?
  } catch (e) {
    return null;
  }
}

function storeZeroClickSuffixes(offerName, suffixes) {
  try {
    var payload = {
      account_id: ACCOUNT_ID,
      offer_name: offerName,
      suffixes: suffixes.map(function(s) {
        return { suffix: s, source: 'zero_click' };
      })
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(SUPABASE_URL + '/functions/v1/v5-store-traced-suffixes', options);
    var data = JSON.parse(resp.getContentText());
    return (data && data.stored) || 0;
  } catch (e) {
    Logger.log('[STORE-ZERO-CLICK] Failed: ' + e);
    return 0;
  }
}

// =============================================================
// LANDING PAGE STATS (DAILY CACHE)
// =============================================================
function collectYesterdayLandingPages() {
  try {
    var query = 'SELECT EffectiveFinalUrl, Clicks ' +
                'FROM FINAL_URL_REPORT ' +
                'DURING YESTERDAY';
    var report = AdsApp.report(query);
    var rows = report.rows();

    var landingPages = {};
    while (rows.hasNext()) {
      var row = rows.next();
      var url = row['EffectiveFinalUrl'] || '';
      var clicks = parseInt(row['Clicks'], 10) || 0;
      if (url && clicks > 0) {
        landingPages[url] = (landingPages[url] || 0) + clicks;
      }
    }

    if (Object.keys(landingPages).length === 0) return null;
    Logger.log('[STATS] Cached yesterday landing pages: ' + Object.keys(landingPages).length);
    return landingPages;
  } catch (e) {
    Logger.log('[STATS] Failed to collect: ' + e);
    return null;
  }
}

function cacheStats(stats) {
  try {
    var cache = CacheService.getScriptCache();
    cache.put(CACHE_KEY_STATS, JSON.stringify(stats), CACHE_TTL_SECONDS);
  } catch (e) {
    Logger.log('[CACHE] Failed to write: ' + e);
  }
}

function getCachedLandingPages() {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(CACHE_KEY_STATS);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    Logger.log('[CACHE] Read miss: ' + e);
    return null;
  }
}

// =============================================================
// HELPERS
// =============================================================
function getAccountId() {
  try {
    return AdsApp.currentAccount().getCustomerId();
  } catch (e) {
    return 'unknown';
  }
}`;

  const googleAdsMultiOfferV4 = `// ============================================
// MULTI-OFFER ADAPTIVE INTERVAL SCRIPT (V4)
// ============================================
// V4: Multi-offer support with flexible campaign mapping
// - Supports array of offers OR single offer string
// - Manual campaign-to-offer mapping OR automatic round-robin distribution
// - Unique suffix per campaign per call from assigned offer
// - Per-offer interval calculation and statistics tracking
// - Fully backward compatible with single-offer mode

var SUPABASE_URL = '${supabaseUrl}';
var ACCOUNT_ID = ''; // Will be set at startup

// ============================================
// MULTI-OFFER CONFIGURATION
// ============================================

// OFFER_NAMES: Accept array OR single string
// Examples:
//   var OFFER_NAMES = ['offer1', 'offer2', 'offer3'];
//   var OFFER_NAMES = 'single-offer';
var OFFER_NAMES = 'OFFER_NAME'; // Replace with your offer(s)

// CAMPAIGN_MAPPING: Manual mode - explicit campaign ID to offer name mapping
// Leave empty {} or null for automatic round-robin distribution
// Example:
//   var CAMPAIGN_MAPPING = {
//     '12345678': 'offer1',
//     '87654321': 'offer2',
//     '11223344': 'offer3'
//   };
var CAMPAIGN_MAPPING = {};

// ============================================
// INTERVAL CONFIGURATION
// ============================================
var DEFAULT_INTERVAL_MS = 5000;
var MIN_INTERVAL_MS = 1000;
var MAX_INTERVAL_MS = 30000;
var TARGET_REPEAT_RATIO = 5;
var MIN_REPEAT_RATIO = 1.0;

// ============================================
// CALL BUDGET CONFIGURATION
// ============================================
// Max daily API calls = yesterday's clicks × this multiplier
// Example: 100 clicks × 10 = 1000 max calls per day
// Database override (per account+offer) takes highest priority
var CALL_BUDGET_MULTIPLIER = 10;

// ============================================
// CAMPAIGN FILTERING
// ============================================
var CAMPAIGN_IDS = []; // Leave empty to process all campaigns
var CAMPAIGN_LABEL_FILTER = '';
var DRY_RUN_MODE = false;

// ============================================
// RUNTIME CONFIGURATION
// ============================================
var MAX_RUNTIME_MS = 1500000; // 25 minutes
var UPDATE_MODE = 'on_change';

// ============================================
// GLOBAL STATE
// ============================================
var executionState = {
  startTime: new Date().getTime(),
  totalApiCalls: 0,
  totalCampaignsUpdated: 0,
  cycleNumber: 0,
  errors: []
};

// Normalized offer names (always an array)
var NORMALIZED_OFFERS = [];

// Campaign to offer assignment map
var campaignToOfferMap = {};

// Per-offer tracking
var perOfferStats = {};

// Per-offer yesterday data cache
var perOfferYesterdayCache = {};

// ============================================
// INITIALIZATION HELPERS
// ============================================

function getAccountId() {
  try {
    return AdsApp.currentAccount().getCustomerId();
  } catch (error) {
    Logger.log('⚠️ [ACCOUNT] Failed to get account ID: ' + error);
    return 'unknown';
  }
}

function normalizeOfferNames() {
  // Convert OFFER_NAMES to array format
  if (typeof OFFER_NAMES === 'string') {
    NORMALIZED_OFFERS = [OFFER_NAMES];
    Logger.log('[INIT] Single offer mode: ' + OFFER_NAMES);
  } else if (Array.isArray(OFFER_NAMES)) {
    NORMALIZED_OFFERS = OFFER_NAMES;
    Logger.log('[INIT] Multi-offer mode: ' + NORMALIZED_OFFERS.length + ' offers');
    for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
      Logger.log('  ' + (i + 1) + '. ' + NORMALIZED_OFFERS[i]);
    }
  } else {
    Logger.log('⚠️ [INIT] Invalid OFFER_NAMES format, using default');
    NORMALIZED_OFFERS = ['default-offer'];
  }
  
  // Initialize per-offer stats
  for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
    var offerName = NORMALIZED_OFFERS[i];
    perOfferStats[offerName] = {
      currentInterval: DEFAULT_INTERVAL_MS,
      totalClicks: 0,
      uniquePages: 0,
      apiCalls: 0,
      campaignsUpdated: 0
    };
  }
}

function getCampaignList() {
  var campaignSelector;

  if (CAMPAIGN_IDS && CAMPAIGN_IDS.length > 0) {
    Logger.log('[FILTER] Using Campaign IDs: ' + CAMPAIGN_IDS.join(', '));
    var idConditions = [];
    for (var i = 0; i < CAMPAIGN_IDS.length; i++) {
      idConditions.push('Id = ' + CAMPAIGN_IDS[i]);
    }
    var idFilter = '(' + idConditions.join(' OR ') + ')';
    campaignSelector = AdsApp.campaigns()
      .withCondition('Status = ENABLED')
      .withCondition(idFilter);
  } else if (CAMPAIGN_LABEL_FILTER && CAMPAIGN_LABEL_FILTER !== '') {
    Logger.log('[FILTER] Using Label: ' + CAMPAIGN_LABEL_FILTER);
    campaignSelector = AdsApp.campaigns()
      .withCondition('Status = ENABLED')
      .withCondition('LabelNames CONTAINS_ANY ["' + CAMPAIGN_LABEL_FILTER + '"]');
  } else {
    Logger.log('[FILTER] Using all enabled campaigns');
    campaignSelector = AdsApp.campaigns()
      .withCondition('Status = ENABLED');
  }

  var campaigns = campaignSelector.get();
  var campaignList = [];
  while (campaigns.hasNext()) {
    campaignList.push(campaigns.next());
  }
  
  return campaignList;
}

function assignCampaignsToOffers(campaignList) {
  Logger.log('[MAPPING] Assigning campaigns to offers...');
  
  // Check if manual mapping provided
  var hasManualMapping = CAMPAIGN_MAPPING && Object.keys(CAMPAIGN_MAPPING).length > 0;
  
  if (hasManualMapping) {
    Logger.log('[MAPPING] Using manual campaign mapping');
    for (var i = 0; i < campaignList.length; i++) {
      var campaign = campaignList[i];
      var campaignId = campaign.getId();
      var assignedOffer = CAMPAIGN_MAPPING[campaignId];
      
      if (assignedOffer) {
        campaignToOfferMap[campaignId] = assignedOffer;
        Logger.log('  Campaign ' + campaignId + ' -> ' + assignedOffer);
      } else {
        Logger.log('  ⚠️ Campaign ' + campaignId + ' has no mapping, skipping');
      }
    }
  } else {
    Logger.log('[MAPPING] Using automatic round-robin distribution');
    var offerCount = NORMALIZED_OFFERS.length;
    
    for (var i = 0; i < campaignList.length; i++) {
      var campaign = campaignList[i];
      var campaignId = campaign.getId();
      var offerIndex = i % offerCount;
      var assignedOffer = NORMALIZED_OFFERS[offerIndex];
      
      campaignToOfferMap[campaignId] = assignedOffer;
      Logger.log('  Campaign ' + campaignId + ' -> ' + assignedOffer + ' (round-robin #' + offerIndex + ')');
    }
  }
  
  // Log summary
  var assignedCount = Object.keys(campaignToOfferMap).length;
  Logger.log('[MAPPING] Total campaigns assigned: ' + assignedCount);
  
  // Count campaigns per offer
  var offerCounts = {};
  for (var campaignId in campaignToOfferMap) {
    var offer = campaignToOfferMap[campaignId];
    offerCounts[offer] = (offerCounts[offer] || 0) + 1;
  }
  
  Logger.log('[MAPPING] Campaigns per offer:');
  for (var offer in offerCounts) {
    Logger.log('  ' + offer + ': ' + offerCounts[offer] + ' campaigns');
  }
}

// ============================================
// YESTERDAY'S DATA COLLECTION (PER-OFFER)
// ============================================

function getYesterdayLandingPagesForOffer(offerName) {
  try {
    Logger.log('[GOOGLE ADS] Collecting yesterday landing pages for offer: ' + offerName);
    
    // Get campaigns assigned to this offer
    var offerCampaignIds = [];
    for (var campaignId in campaignToOfferMap) {
      if (campaignToOfferMap[campaignId] === offerName) {
        offerCampaignIds.push(campaignId);
      }
    }
    
    if (offerCampaignIds.length === 0) {
      Logger.log('[REPORT] No campaigns assigned to offer: ' + offerName);
      return null;
    }
    
    // Build campaign filter
    var campaignFilter = '';
    for (var i = 0; i < offerCampaignIds.length; i++) {
      if (i > 0) campaignFilter += ' OR ';
      campaignFilter += 'CampaignId = ' + offerCampaignIds[i];
    }
    
    var query = 'SELECT EffectiveFinalUrl, Clicks ' +
                'FROM FINAL_URL_REPORT ' +
                'WHERE (' + campaignFilter + ') ' +
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
    Logger.log('[REPORT] Offer "' + offerName + '" yesterday results:');
    Logger.log('  Rows processed: ' + processedRows);
    Logger.log('  Unique landing pages: ' + uniquePages);
    Logger.log('  Total clicks: ' + totalClicks);

    if (uniquePages > 0 && totalClicks > 0) {
      return {
        landingPages: landingPages,
        totalClicks: totalClicks,
        uniquePages: uniquePages
      };
    }
    return null;
  } catch (error) {
    Logger.log('⚠️ [REPORT] Failed to collect yesterday data for ' + offerName + ': ' + error);
    return null;
  }
}

function collectAllOfferYesterdayData() {
  Logger.log('[STARTUP] Collecting yesterday data for all offers...');
  
  for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
    var offerName = NORMALIZED_OFFERS[i];
    var yesterdayData = getYesterdayLandingPagesForOffer(offerName);
    
    if (yesterdayData) {
      perOfferYesterdayCache[offerName] = yesterdayData;
      perOfferStats[offerName].totalClicks = yesterdayData.totalClicks;
      perOfferStats[offerName].uniquePages = yesterdayData.uniquePages;
      Logger.log('[STARTUP] Cached data for ' + offerName + ': ' + yesterdayData.totalClicks + ' clicks, ' + yesterdayData.uniquePages + ' pages');
    } else {
      Logger.log('[STARTUP] No yesterday data for ' + offerName);
      perOfferStats[offerName].totalClicks = 0;
      perOfferStats[offerName].uniquePages = 0;
    }
  }
}

// ============================================
// PER-OFFER INTERVAL FETCHING
// ============================================

function getIntervalForOffer(offerName) {
  try {
    var stats = perOfferStats[offerName];
    if (!stats) {
      Logger.log('⚠️ [INTERVAL] No stats for offer: ' + offerName);
      return DEFAULT_INTERVAL_MS;
    }
    
    Logger.log('[INTERVAL] Fetching interval for offer: ' + offerName);
    
    var accountTimezone = AdsApp.currentAccount().getTimeZone();
    var url = SUPABASE_URL + '/functions/v1/get-recommended-interval?offer_name=' + encodeURIComponent(offerName);
    url += '&account_id=' + encodeURIComponent(ACCOUNT_ID);
    
    var payload = {
      yesterday_total_clicks: stats.totalClicks,
      yesterday_unique_landing_pages: stats.uniquePages,
      account_timezone: accountTimezone,
      min_interval_ms: MIN_INTERVAL_MS,
      max_interval_ms: MAX_INTERVAL_MS,
      target_repeat_ratio: TARGET_REPEAT_RATIO,
      min_repeat_ratio: MIN_REPEAT_RATIO,
      call_budget_multiplier: CALL_BUDGET_MULTIPLIER,
      default_interval_ms: DEFAULT_INTERVAL_MS
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
        stats.currentInterval = result.recommended_interval_ms;
        Logger.log('[INTERVAL] Offer "' + offerName + '" interval: ' + stats.currentInterval + 'ms');
        Logger.log('  Data source: ' + (result.data_source || 'database'));
        Logger.log('  Yesterday clicks: ' + result.yesterday_clicks);
        Logger.log('  Yesterday pages: ' + result.yesterday_landing_pages);
        Logger.log('  Average repeats: ' + result.average_repeats);
        return stats.currentInterval;
      }
    }
    
    Logger.log('⚠️ [INTERVAL] API failed for ' + offerName + ', using default');
    return DEFAULT_INTERVAL_MS;
  } catch (error) {
    Logger.log('⚠️ [INTERVAL] Error for ' + offerName + ': ' + error);
    return DEFAULT_INTERVAL_MS;
  }
}

// ============================================
// UNIFIED SUFFIX FETCHING (ALL CAMPAIGNS ONE CALL)
// ============================================

function getAllSuffixesUnified(campaignToOfferMapping, intervalToUse) {
  try {
    Logger.log('[API UNIFIED] Fetching unique suffixes for all campaigns in single call...');
    Logger.log('[API UNIFIED] Campaign count: ' + Object.keys(campaignToOfferMapping).length);
    
    var url = SUPABASE_URL + '/functions/v1/get-suffix-batch';
    url += '?account_id=' + encodeURIComponent(ACCOUNT_ID);
    
    if (intervalToUse > 0) {
      url += '&interval_used=' + intervalToUse;
    }

    var payload = {
      campaign_offer_mapping: campaignToOfferMapping, // { campaignId: offerName, ... }
      campaign_count: Object.keys(campaignToOfferMapping).length
    };

    var options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var json = JSON.parse(response.getContentText());

    if (responseCode === 200 && json.success && json.suffixes && json.suffixes.length > 0) {
      Logger.log('[API UNIFIED] ✅ Got ' + json.suffixes.length + ' unique suffixes for ' + Object.keys(campaignToOfferMapping).length + ' campaigns');
      executionState.totalApiCalls++;
      return {
        success: true,
        suffixes: json.suffixes // Array of { campaign_id, suffix, offer_name }
      };
    } else {
      Logger.log('[API ERROR] Unified API failed or returned invalid data');
      return { success: false };
    }
  } catch (e) {
    Logger.log('[API ERROR] Failed unified suffix fetch: ' + e.toString());
    executionState.errors.push({
      type: 'api_error',
      message: 'Unified suffix fetch failed: ' + e.toString(),
      timestamp: new Date()
    });
    return { success: false };
  }
}

// ============================================
// CAMPAIGN UPDATE FUNCTION (UNIFIED CALL)
// ============================================

function updateCampaigns() {
  var campaignList = getCampaignList();
  var totalCampaigns = campaignList.length;
  
  Logger.log('[UPDATE] Processing ' + totalCampaigns + ' campaigns (unified single API call)');
  
  if (totalCampaigns === 0) {
    return {
      updated: 0,
      failed: 0,
      skipped: 0
    };
  }

  var updatedCount = 0;
  var failedCount = 0;
  var skippedCount = 0;

  if (DRY_RUN_MODE) {
    Logger.log('[DRY RUN] Would update ' + totalCampaigns + ' campaigns with unified call');
    for (var i = 0; i < campaignList.length; i++) {
      var campaign = campaignList[i];
      var campaignId = campaign.getId();
      var offerName = campaignToOfferMap[campaignId];
      Logger.log('[DRY RUN] Campaign ' + campaign.getName() + ' (ID: ' + campaignId + ') -> ' + offerName);
      skippedCount++;
    }
    return { updated: 0, failed: 0, skipped: skippedCount };
  }

  // Build campaign ID to offer name mapping for API call
  var campaignMapping = {};
  var campaignListMap = {}; // Keep reference to campaign objects by ID
  
  for (var i = 0; i < campaignList.length; i++) {
    var campaign = campaignList[i];
    var campaignId = campaign.getId();
    var offerName = campaignToOfferMap[campaignId];
    
    if (!offerName) {
      Logger.log('[SKIP] Campaign ' + campaignId + ' has no offer assignment');
      skippedCount++;
      continue;
    }
    
    campaignMapping[campaignId] = offerName;
    campaignListMap[campaignId] = campaign;
  }

  if (Object.keys(campaignMapping).length === 0) {
    Logger.log('[ERROR] No campaigns with offer assignments');
    return { updated: 0, failed: 0, skipped: skippedCount };
  }

  // Calculate average interval for delay between cycles
  var totalInterval = 0;
  for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
    totalInterval += perOfferStats[NORMALIZED_OFFERS[i]].currentInterval;
  }
  var avgInterval = Math.floor(totalInterval / NORMALIZED_OFFERS.length);

  // SINGLE unified API call for ALL campaigns at once
  var apiResult = getAllSuffixesUnified(campaignMapping, avgInterval);
  
  if (!apiResult.success) {
    Logger.log('[ERROR] Unified API call failed, all campaigns failed');
    return {
      updated: 0,
      failed: Object.keys(campaignMapping).length,
      skipped: skippedCount
    };
  }

  var suffixes = apiResult.suffixes || [];
  Logger.log('[UPDATE] Received ' + suffixes.length + ' suffixes, applying to campaigns...');

  // Apply each suffix to its corresponding campaign
  for (var i = 0; i < suffixes.length; i++) {
    var suffixData = suffixes[i];
    var campaignId = suffixData.campaign_id;
    var suffix = suffixData.suffix;
    var offerName = suffixData.offer_name;
    
    var campaign = campaignListMap[campaignId];
    if (!campaign) {
      Logger.log('[ERROR] Campaign ' + campaignId + ' not found in campaign list');
      failedCount++;
      continue;
    }
    
    try {
      campaign.urls().setFinalUrlSuffix(suffix);
      Logger.log('[UPDATED] ' + campaign.getName() + ' (ID: ' + campaignId + ') with unique suffix from offer: ' + offerName);
      updatedCount++;
      
      // Track per-offer
      if (perOfferStats[offerName]) {
        perOfferStats[offerName].campaignsUpdated++;
        perOfferStats[offerName].apiCalls++; // Count this campaign's portion of the unified call
      }
    } catch (e) {
      failedCount++;
      Logger.log('[ERROR] Failed to update campaign ' + campaignId + ': ' + e.toString());
      executionState.errors.push({
        type: 'campaign_update_error',
        campaign: campaign.getName(),
        campaignId: campaignId,
        offerName: offerName,
        message: e.toString(),
        timestamp: new Date()
      });
    }
  }

  executionState.totalCampaignsUpdated += updatedCount;

  return {
    updated: updatedCount,
    failed: failedCount,
    skipped: skippedCount
  };
}

// ============================================
// TIME HELPERS
// ============================================

function getElapsedMs() {
  return new Date().getTime() - executionState.startTime;
}

function getRemainingMs() {
  return MAX_RUNTIME_MS - getElapsedMs();
}

function hasEnoughTime() {
  return getRemainingMs() > 0;
}

function formatMs(ms) {
  var seconds = Math.floor(ms / 1000);
  var minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return minutes + 'm ' + seconds + 's';
}

// ============================================
// LOGGING
// ============================================

function logScriptStart() {
  Logger.log('====================================');
  Logger.log('MULTI-OFFER CAMPAIGN UPDATER V4');
  Logger.log('====================================');
  Logger.log('Configuration:');
  Logger.log('  Account ID: ' + ACCOUNT_ID);
  Logger.log('  Offers: ' + NORMALIZED_OFFERS.join(', '));
  Logger.log('  Mapping Mode: ' + (Object.keys(CAMPAIGN_MAPPING).length > 0 ? 'Manual' : 'Auto Round-Robin'));
  Logger.log('  Max Runtime: ' + formatMs(MAX_RUNTIME_MS));
  Logger.log('  Update Mode: ' + UPDATE_MODE);
  Logger.log('  Dry Run: ' + (DRY_RUN_MODE ? 'YES' : 'NO'));
  Logger.log('  API Strategy: Unified single call with campaign-offer mapping');
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
  Logger.log('EXECUTION SUMMARY (V4)');
  Logger.log('====================================');
  Logger.log('Total Runtime: ' + formatMs(getElapsedMs()));
  Logger.log('Total Cycles: ' + executionState.cycleNumber);
  Logger.log('Total API Calls: ' + executionState.totalApiCalls);
  Logger.log('Total Campaigns Updated: ' + executionState.totalCampaignsUpdated);
  Logger.log('Total Errors: ' + executionState.errors.length);
  Logger.log('');
  Logger.log('Per-Offer Statistics:');
  for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
    var offerName = NORMALIZED_OFFERS[i];
    var stats = perOfferStats[offerName];
    Logger.log('  ' + offerName + ':');
    Logger.log('    API Calls: ' + stats.apiCalls);
    Logger.log('    Campaigns Updated: ' + stats.campaignsUpdated);
    Logger.log('    Current Interval: ' + stats.currentInterval + 'ms');
    Logger.log('    Yesterday Clicks: ' + stats.totalClicks);
    Logger.log('    Yesterday Pages: ' + stats.uniquePages);
  }

  if (executionState.errors.length > 0) {
    Logger.log('');
    Logger.log('Error Details:');
    for (var i = 0; i < executionState.errors.length && i < 10; i++) {
      var error = executionState.errors[i];
      Logger.log('  [' + error.type + '] ' + error.message);
    }
    if (executionState.errors.length > 10) {
      Logger.log('  ... and ' + (executionState.errors.length - 10) + ' more errors');
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
  // Initialize
  ACCOUNT_ID = getAccountId();
  normalizeOfferNames();
  
  logScriptStart();

  // Get all campaigns and assign to offers
  var campaignList = getCampaignList();
  Logger.log('[INIT] Found ' + campaignList.length + ' campaigns');
  
  if (campaignList.length === 0) {
    Logger.log('[ERROR] No campaigns found to process');
    return;
  }
  
  assignCampaignsToOffers(campaignList);
  
  // Collect yesterday's data for all offers (one-time at startup)
  collectAllOfferYesterdayData();
  
  // Fetch initial intervals for all offers
  Logger.log('[STARTUP] Fetching initial intervals for all offers...');
  for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
    var offerName = NORMALIZED_OFFERS[i];
    getIntervalForOffer(offerName);
  }

  try {
    while (hasEnoughTime()) {
      logCycleStart();

      // Update all campaigns (each gets unique suffix from its assigned offer)
      var updateResult = updateCampaigns();
      
      Logger.log('[CYCLE COMPLETE]');
      Logger.log('  Campaigns Updated: ' + updateResult.updated);
      Logger.log('  Campaigns Failed: ' + updateResult.failed);
      Logger.log('  Campaigns Skipped: ' + updateResult.skipped);
      
      // Calculate average interval across all offers for cycle delay
      var totalInterval = 0;
      for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
        totalInterval += perOfferStats[NORMALIZED_OFFERS[i]].currentInterval;
      }
      var avgInterval = Math.floor(totalInterval / NORMALIZED_OFFERS.length);
      
      Logger.log('[INTERVAL] Average interval across all offers: ' + avgInterval + 'ms');
      Logger.log('[INTERVAL] Waiting before next cycle...');
      
      if (avgInterval > 0) {
        Utilities.sleep(avgInterval);
      }
      
      // Periodically refresh intervals (every 10 cycles)
      if (executionState.cycleNumber % 10 === 0) {
        Logger.log('[REFRESH] Refreshing intervals for all offers...');
        for (var i = 0; i < NORMALIZED_OFFERS.length; i++) {
          getIntervalForOffer(NORMALIZED_OFFERS[i]);
        }
      }
    }

    Logger.log('');
    Logger.log('[RUNTIME COMPLETE] Reached maximum runtime limit');

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
 * Run this once to find Campaign IDs for the CAMPAIGN_IDS array or CAMPAIGN_MAPPING
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

  const googleAdsAutoScheduleV3 = `// ============================================
// ADAPTIVE INTERVAL + AUTO-SCHEDULE (V3)
// ============================================
// V3: Same as V2 but with scheduler check/report for central control
// Also sets expected repeat count to 2 (more aggressive speed optimization)
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
// SCHEDULER INTEGRATION (CHECK + REPORT)
// ============================================
function schedulerCheck() {
  try {
    var url = SUPABASE_URL + '/functions/v1/schedule-script-execution?action=check';
    var payload = {
      offer_name: OFFER_NAME,
      account_id: ACCOUNT_ID,
      client: 'google_ads',
      version: 'v3'
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      if (data && data.allow === false) {
        Logger.log('[SCHEDULER] Execution denied by controller. Reason: ' + (data.reason || 'unspecified'));
        if (data.next_allowed_at) {
          Logger.log('[SCHEDULER] Next allowed at: ' + data.next_allowed_at);
        }
        return false;
      }
      Logger.log('[SCHEDULER] Execution allowed.');
      return true;
    }
    Logger.log('⚠️ [SCHEDULER] Non-200 response, proceeding by default');
  } catch (e) {
    Logger.log('⚠️ [SCHEDULER] Check failed (' + e + '), proceeding');
  }
  return true; // default permissive if scheduler unavailable
}

function schedulerReport(summary) {
  try {
    var url = SUPABASE_URL + '/functions/v1/schedule-script-execution?action=report';
    var payload = {
      offer_name: OFFER_NAME,
      account_id: ACCOUNT_ID,
      client: 'google_ads',
      version: 'v3',
      summary: summary || {}
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, options);
    Logger.log('[SCHEDULER] Report sent (' + response.getResponseCode() + ')');
  } catch (e) {
    Logger.log('⚠️ [SCHEDULER] Report failed: ' + e);
  }
}

// ============================================
// GET YESTERDAY'S LANDING PAGES WITH CLICKS
// ============================================
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
// CONTINUOUS CAMPAIGN UPDATE CONFIGURATION
// ============================================

// Maximum script runtime before timeout (in milliseconds)
// Google Ads limit is 30 minutes (1800000ms)
// Examples:
// - 1500000 = 25 minutes (recommended - safe buffer)
// - 1680000 = 28 minutes (aggressive - tight buffer)
// - 300000 = 5 minutes (for testing)
var MAX_RUNTIME_MS = 1500000;

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
// DYNAMIC INTERVAL FETCHING (TARGET REPEATS = 2)
// ============================================
function getCurrentIntervalFromAPI() {
  try {
    // Use cached yesterday data (already calculated at startup)
    var totalClicks = YESTERDAY_TOTAL_CLICKS;
    var uniqueLandingPages = YESTERDAY_UNIQUE_PAGES;
    
    Logger.log('[INTERVAL] Using cached yesterday data: ' + totalClicks + ' clicks, ' + uniqueLandingPages + ' pages (no recalculation)');
    
    if (uniqueLandingPages === 0) {
      Logger.log('[INTERVAL] No landing page data; delegating default to API with constraints. Default=' + DEFAULT_INTERVAL_MS + 'ms');
    }
    
    var accountTimezone = AdsApp.currentAccount().getTimeZone();
    
    // Build URL with offer_name and account_id as query parameters (required by endpoint)
    var url = SUPABASE_URL + '/functions/v1/get-recommended-interval?offer_name=' + encodeURIComponent(OFFER_NAME);
    url += '&account_id=' + encodeURIComponent(ACCOUNT_ID);
    
    // Pass script-level constraints to API (V3 uses target_average_repeats=2 for more aggressive speed)
    var payload = {
      yesterday_total_clicks: totalClicks,
      yesterday_unique_landing_pages: uniqueLandingPages,
      account_timezone: accountTimezone,
      min_interval_ms: MIN_INTERVAL_MS,
      max_interval_ms: MAX_INTERVAL_MS,
      target_average_repeats: 2,
      default_interval_ms: DEFAULT_INTERVAL_MS
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
        Logger.log('[INTERVAL V3] Fetched: ' + result.recommended_interval_ms + 'ms' + cacheInfo);
        return result.recommended_interval_ms;
      }
    }
    
    Logger.log('[INTERVAL V3] API call failed, using default: ' + DEFAULT_INTERVAL_MS + 'ms');
    return DEFAULT_INTERVAL_MS;
  } catch (error) {
    Logger.log('[INTERVAL V3] Error fetching: ' + error + ', using default: ' + DEFAULT_INTERVAL_MS + 'ms');
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
      
      // No delay between campaigns for maximum speed
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
  // Run until time is up - no buffer for maximum 30-minute utilization
  return getRemainingMs() > 0;
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
  Logger.log('CONTINUOUS CAMPAIGN UPDATER (V3)');
  Logger.log('====================================');
  Logger.log('Configuration:');
  Logger.log('  Offer Name: ' + OFFER_NAME);
  Logger.log('  Max Runtime: ' + formatMs(MAX_RUNTIME_MS));
  Logger.log('  Update Mode: ' + UPDATE_MODE);
  Logger.log('  Target Repeats: 2 (more aggressive)');
  
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
  Logger.log('EXECUTION SUMMARY (V3)');
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
// MAIN EXECUTION LOOP (WITH SCHEDULER)
// ============================================
function main() {
  // Set account ID at startup
  ACCOUNT_ID = getAccountId();
  Logger.log('[STARTUP V3] Account ID: ' + ACCOUNT_ID);
  
  // Scheduler check - exit early if denied
  if (!schedulerCheck()) {
    Logger.log('[EXIT] Scheduler denied execution.');
    return;
  }
  
  var startedAt = new Date();
  
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

      // Use the adaptive interval to pace how often the suffix API is called (one call per cycle)
      if (cycleInterval > 0) {
        Logger.log('[INTERVAL] Waiting ' + cycleInterval + 'ms before next cycle');
        Utilities.sleep(cycleInterval);
      }
    }

    Logger.log('');
    Logger.log('[RUNTIME COMPLETE] Reached 30-minute limit');

  } catch (e) {
    Logger.log('[FATAL ERROR] ' + e.toString());
    executionState.errors.push({
      type: 'fatal_error',
      message: e.toString(),
      timestamp: new Date()
    });
  }

  logFinalSummary();
  
  // Report to scheduler
  var finishedAt = new Date();
  schedulerReport({
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    total_api_calls: executionState.totalApiCalls,
    total_campaigns_updated: executionState.totalCampaignsUpdated,
    total_campaigns_failed: executionState.errors.length
  });
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
}
`;

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

  const webhookMasterScript = `/**
 * WEBHOOK MASTER SCRIPT - ALL-IN-ONE
 * 
 * This single Google Ads script handles everything:
 * 1. Auto-creates campaign mapping on first run (only once per campaign)
 * 2. Continuously polls webhook queue for Trackier conversion webhooks
 * 3. On every webhook: Updates final URL suffix + triggers new traces
 * 4. Once per day: Fetches last 7 days zero-click suffixes and stores in bucket
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to Google Ads → Tools & Settings → Bulk Actions → Scripts
 * 2. Click "+ New Script" button
 * 3. Name it "WEBHOOK-MASTER"
 * 4. Paste this entire script
 * 5. Update ONLY the OFFER_NAME below (e.g., 'SURFSHARK_US', 'VPN_OFFER')
 *    - SUPABASE_ANON_KEY and PROXY_SERVICE_URL are pre-configured
 * 6. Click "Preview" to test on one campaign first
 * 7. Click "Save" and then "Run" → "Schedule" → Every 30 minutes
 * 
 * WHAT IT DOES:
 * - First run: Creates mappings for ALL enabled campaigns in your account
 * - Ongoing: Polls queue every 2 seconds for webhook-triggered suffix updates
 * - On webhook: Fetches fresh zero-click suffixes, stores them, updates campaign
 */

// ============================================
// CONFIGURATION - UPDATE THESE 3 VALUES
// ============================================

const CONFIG = {
  // 1. YOUR OFFER NAME (REQUIRED)
  OFFER_NAME: 'YOUR_OFFER_NAME_HERE',  // Replace with your offer (e.g., 'SURFSHARK_US')
  
  // 2. SUPABASE ANON KEY (Pre-configured)
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEwNDgsImV4cCI6MjA4MTUzNzA0OH0.pi_6p2H2nuPfJvdT3pHNGpk0BTI3WQKTSzsj8dxQBA8',
  
  // 3. Supabase URL (Pre-configured)
  SUPABASE_URL: '${supabaseUrl}',
  
  // 4. Proxy Service URL (Pre-configured - your EC2 ALB endpoint)
  PROXY_SERVICE_URL: 'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com',
  
  // Advanced Settings (usually no need to change)
  QUEUE_POLL_INTERVAL_SECONDS: 2,
  MAX_RUNTIME_MINUTES: 28,
  ZERO_CLICK_LOOKBACK_DAYS: 7,
  SUFFIX_UPDATE_LAST_RUN: 'SUFFIX_UPDATE_LAST_RUN_' // PropertiesService key for daily updates
};

// ============================================
// MAIN EXECUTION
// ============================================

function main() {
  Logger.log('=== WEBHOOK MASTER SCRIPT STARTED ===');
  Logger.log('Time: ' + new Date().toISOString());
  Logger.log('Offer: ' + CONFIG.OFFER_NAME);
  
  // Validate configuration
  if (CONFIG.OFFER_NAME === 'YOUR_OFFER_NAME_HERE') {
    Logger.log('❌ ERROR: Please update OFFER_NAME in CONFIG');
    return;
  }
  
  // Anon key is pre-configured, no validation needed
  
  const accountId = AdsApp.currentAccount().getCustomerId();
  Logger.log('Account ID: ' + accountId);
  
  // Step 1: Ensure all campaign mappings exist (runs once per campaign)
  Logger.log('\\n--- Step 1: Ensuring Campaign Mappings ---');
  ensureAllCampaignMappings(accountId);
  
  // Step 2: Check if daily zero-click fetch is needed
  Logger.log('\\n--- Step 2: Checking Daily Zero-Click Suffix Fetch ---');
  checkAndFetchDailyZeroClickSuffixes(accountId);
  
  // Step 3: Continuous queue polling (webhooks apply suffixes immediately)
  Logger.log('\\n--- Step 3: Starting Queue Polling ---');
  const startTime = new Date().getTime();
  const maxRuntime = CONFIG.MAX_RUNTIME_MINUTES * 60 * 1000;
  
  let cycleCount = 0;
  
  while (true) {
    const elapsed = new Date().getTime() - startTime;
    if (elapsed > maxRuntime) {
      Logger.log('⏰ Max runtime reached. Script will restart automatically.');
      break;
    }
    
    cycleCount++;
    Logger.log('\\nCycle ' + cycleCount + ' - Polling queue...');
    
    // Process webhooks (applies suffix + traces + stores in bucket)
    const processed = processUpdateQueue(accountId);
    
    if (processed > 0) {
      Logger.log('✓ Processed ' + processed + ' webhooks (applied + traced + stored)');
    }
    
    Utilities.sleep(CONFIG.QUEUE_POLL_INTERVAL_SECONDS * 1000);
  }
  
  Logger.log('\\n=== WEBHOOK MASTER SCRIPT COMPLETED ===');
}

// ============================================
// AUTO-MAPPING FUNCTIONS
// ============================================

function ensureAllCampaignMappings(accountId) {
  try {
    const campaignIterator = AdsApp.campaigns()
      .withCondition('Status = ENABLED')
      .get();
    
    let checkedCount = 0;
    let createdCount = 0;
    
    while (campaignIterator.hasNext()) {
      const campaign = campaignIterator.next();
      const campaignId = campaign.getId().toString();
      const campaignName = campaign.getName();
      
      checkedCount++;
      
      // Check if mapping already exists
      const exists = checkMappingExists(accountId, campaignId);
      
      if (!exists) {
        Logger.log('Creating mapping for: ' + campaignName + ' (ID: ' + campaignId + ')');
        const created = createMapping(accountId, campaignId, campaignName);
        if (created) {
          createdCount++;
        }
      } else {
        Logger.log('✓ Mapping exists for: ' + campaignName);
      }
    }
    
    Logger.log('\\nMapping Summary:');
    Logger.log('- Campaigns checked: ' + checkedCount);
    Logger.log('- New mappings created: ' + createdCount);
    
  } catch (error) {
    Logger.log('❌ Error in ensureAllCampaignMappings: ' + error.message);
  }
}

function checkMappingExists(accountId, campaignId) {
  try {
    const url = CONFIG.PROXY_SERVICE_URL + '/api/webhook-campaign/check' +
                '?account_id=' + encodeURIComponent(accountId) +
                '&campaign_id=' + encodeURIComponent(campaignId);
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      return data.exists === true;
    }
    
    return false;
  } catch (error) {
    Logger.log('❌ Error checking mapping: ' + error.message);
    return false;
  }
}

function createMapping(accountId, campaignId, campaignName) {
  try {
    const url = CONFIG.PROXY_SERVICE_URL + '/api/webhook-campaign/auto-create';
    
    const payload = {
      accountId: accountId,
      campaignId: campaignId,
      campaignName: campaignName,
      offerName: CONFIG.OFFER_NAME
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data.success) {
        Logger.log('✓ Mapping created successfully');
        if (data.trackier && data.trackier.webhookUrl) {
          Logger.log('📋 Trackier Webhook URL: ' + data.trackier.webhookUrl);
          Logger.log('   (Add this to your Trackier campaign S2S postback)');
        }
        return true;
      }
    }
    
    Logger.log('❌ Failed to create mapping: HTTP ' + response.getResponseCode());
    return false;
    
  } catch (error) {
    Logger.log('❌ Error creating mapping: ' + error.message);
    return false;
  }
}

// ============================================
// QUEUE PROCESSING FUNCTIONS
// ============================================

function processUpdateQueue(accountId) {
  try {
    const queueItems = fetchPendingQueueItems(accountId);
    
    if (!queueItems || queueItems.length === 0) {
      return 0;
    }
    
    Logger.log('Found ' + queueItems.length + ' pending webhooks');
    
    let processedCount = 0;
    
    for (var i = 0; i < queueItems.length; i++) {
      const item = queueItems[i];
      
      Logger.log('\\nProcessing webhook for campaign: ' + item.campaign_id);
      Logger.log('Webhook suffix (will be traced): ' + item.new_suffix);
      
      markQueueItemProcessing(item.id);
      
      try {
        const mapping = fetchMappingByIds(accountId, item.campaign_id);
        
        if (!mapping || !mapping.mapping_id) {
          markQueueItemFailed(item.id, 'Mapping not found');
          Logger.log('❌ Mapping not found for campaign');
          continue;
        }
        
        // Step 1: Get next suffix FROM BUCKET (not from webhook!)
        Logger.log('Step 1: Getting next suffix from bucket...');
        const bucketSuffix = getNextSuffixFromBucket(mapping.mapping_id);
        
        if (!bucketSuffix) {
          Logger.log('⚠️  No suffixes in bucket. Will trace webhook suffix and store for next time.');
          
          // Trace webhook suffix and store in bucket for future use
          const tracedSuffixes = triggerTraceAndExtractSuffixes(
            item.new_suffix, 
            mapping.campaign_name,
            CONFIG.OFFER_NAME
          );
          
          if (tracedSuffixes && tracedSuffixes.length > 0) {
            const storedCount = storeSuffixesInBucket(mapping.mapping_id, tracedSuffixes);
            Logger.log('✓ Stored ' + storedCount + ' traced suffixes for future use');
          }
          
          markQueueItemCompleted(item.id);
          processedCount++;
          continue;
        }
        
        Logger.log('✓ Got suffix from bucket (ID: ' + bucketSuffix.suffix_id + ')');
        
        // Step 2: Apply BUCKET suffix to campaign
        Logger.log('Step 2: Applying bucket suffix to campaign...');
        const applied = applySuffixUpdate(item.campaign_id, bucketSuffix.suffix);
        
        if (!applied) {
          markQueueItemFailed(item.id, 'Failed to apply bucket suffix to campaign');
          Logger.log('❌ Failed to apply bucket suffix');
          continue;
        }
        
        // Step 3: Mark bucket suffix as used
        Logger.log('Step 3: Marking bucket suffix as used...');
        markBucketSuffixAsUsed(bucketSuffix.suffix_id);
        
        // Step 4: Trace webhook suffix in background and store results
        Logger.log('Step 4: Tracing webhook suffix and storing results...');
        const tracedSuffixes = triggerTraceAndExtractSuffixes(
          item.new_suffix, 
          mapping.campaign_name,
          CONFIG.OFFER_NAME
        );
        
        if (tracedSuffixes && tracedSuffixes.length > 0) {
          Logger.log('✓ Traced ' + tracedSuffixes.length + ' suffixes from webhook');
          const storedCount = storeSuffixesInBucket(mapping.mapping_id, tracedSuffixes);
          Logger.log('✓ Stored ' + storedCount + ' new suffixes in bucket');
        } else {
          Logger.log('⚠️  No suffixes traced from webhook');
        }
        
        markQueueItemCompleted(item.id);
        processedCount++;
        Logger.log('✅ Webhook processed: Campaign updated with bucket suffix, webhook suffix traced & stored');
        
      } catch (error) {
        markQueueItemFailed(item.id, error.message);
        Logger.log('❌ Error processing webhook: ' + error.message);
      }
    }
    
    return processedCount;
    
  } catch (error) {
    Logger.log('❌ Error in processUpdateQueue: ' + error.message);
    return 0;
  }
}

function fetchPendingQueueItems(accountId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_update_queue' +
                '?account_id=eq.' + accountId +
                '&status=eq.pending' +
                '&order=webhook_received_at.asc' +
                '&limit=10' +
                '&select=*';
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    }
    
    return [];
  } catch (error) {
    Logger.log('❌ Error fetching queue items: ' + error.message);
    return [];
  }
}

function applySuffixUpdate(campaignId, newSuffix) {
  try {
    const campaign = AdsApp.campaigns()
      .withCondition('Id = ' + campaignId)
      .get()
      .next();
    
    if (!campaign) {
      Logger.log('❌ Campaign not found: ' + campaignId);
      return false;
    }
    
    // Update FINAL URL SUFFIX at CAMPAIGN LEVEL
    const currentSuffix = campaign.urls().getFinalUrlSuffix() || '';
    
    campaign.urls().setFinalUrlSuffix(newSuffix);
    
    Logger.log('✓ Updated campaign final URL suffix: ' + newSuffix);
    Logger.log('  Old: ' + (currentSuffix || '(none)'));
    Logger.log('  New: ' + newSuffix);
    
    return true;
    
  } catch (error) {
    Logger.log('❌ Error applying suffix: ' + error.message);
    return false;
  }
}

// ============================================
// BUCKET HELPER FUNCTIONS (SEQUENTIAL)
// ============================================

function getNextSuffixFromBucket(mappingId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_bucket' +
                '?mapping_id=eq.' + mappingId +
                '&is_valid=eq.true' +
                '&times_used=eq.0' +  // Only get unused suffixes
                '&order=id.asc' +  // Sequential order (oldest first)
                '&limit=1' +
                '&select=id,suffix,times_used';
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data && data.length > 0) {
        return {
          suffix_id: data[0].id,
          suffix: data[0].suffix,
          times_used: data[0].times_used
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('❌ Error getting next suffix: ' + error.message);
    return null;
  }
}

function markBucketSuffixAsUsed(suffixId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/rpc/mark_suffix_used';
    
    const payload = {
      p_suffix_id: suffixId
    };
    
    UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
  } catch (error) {
    Logger.log('❌ Error marking suffix as used: ' + error.message);
  }
}

function storeSingleSuffixInBucket(mappingId, suffix, source) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_bucket';
    
    const payload = {
      mapping_id: mappingId,
      suffix: suffix,
      suffix_hash: Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, suffix)
        .map(function(byte) {
          return ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }).join(''),
      source: source,
      is_valid: true
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    return response.getResponseCode() === 201;
    
  } catch (error) {
    // Likely duplicate - that's OK
    return true;
  }
}

// ============================================
// TRACE AND EXTRACT SUFFIXES
// ============================================

function fetchOfferTracerConfig(offerName) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/offers' +
                '?name=eq.' + encodeURIComponent(offerName) +
                '&select=tracer_mode,geo_target_country,luna_api_customer_id,luna_api_username,luna_api_password' +
                '&limit=1';
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data && data.length > 0) {
        return {
          tracerMode: data[0].tracer_mode || 'http_only',
          geoTarget: data[0].geo_target_country || null,
          lunaCustomerId: data[0].luna_api_customer_id || null,
          lunaUsername: data[0].luna_api_username || null,
          lunaPassword: data[0].luna_api_password || null
        };
      }
    }
    
    // Default to http_only if offer not found
    Logger.log('⚠️  Offer config not found, using default: http_only');
    return {
      tracerMode: 'http_only',
      geoTarget: null,
      lunaCustomerId: null,
      lunaUsername: null,
      lunaPassword: null
    };
    
  } catch (error) {
    Logger.log('⚠️  Error fetching offer config: ' + error.message + ', using http_only');
    return {
      tracerMode: 'http_only',
      geoTarget: null,
      lunaCustomerId: null,
      lunaUsername: null,
      lunaPassword: null
    };
  }
}

function triggerTraceAndExtractSuffixes(suffix, campaignName, offerName) {
  try {
    // Fetch saved tracer configuration for this offer
    Logger.log('Fetching tracer config for offer: ' + offerName);
    const config = fetchOfferTracerConfig(offerName);
    
    Logger.log('Using tracer mode: ' + config.tracerMode);
    if (config.geoTarget) {
      Logger.log('Using geo target: ' + config.geoTarget);
    }
    
    // Build a test URL with the suffix (use a dummy domain)
    const testUrl = 'https://example.com/click?' + suffix;
    
    Logger.log('Tracing URL: ' + testUrl);
    
    const traceUrl = CONFIG.PROXY_SERVICE_URL + '/trace';
    
    const payload = {
      url: testUrl,
      mode: config.tracerMode,
      metadata: {
        source: 'webhook',
        campaign: campaignName,
        offer: offerName
      }
    };
    
    // Add geo target if configured
    if (config.geoTarget) {
      payload.geoTarget = config.geoTarget;
    }
    
    // Add Luna proxy credentials if configured
    if (config.lunaCustomerId && config.lunaUsername && config.lunaPassword) {
      payload.lunaProxy = {
        customerId: config.lunaCustomerId,
        username: config.lunaUsername,
        password: config.lunaPassword
      };
    }
    
    const response = UrlFetchApp.fetch(traceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      Logger.log('⚠️  Trace request failed: HTTP ' + response.getResponseCode());
      return [];
    }
    
    const result = JSON.parse(response.getContentText());
    
    if (!result.success || !result.chain || result.chain.length === 0) {
      Logger.log('⚠️  No redirect chain found');
      return [];
    }
    
    Logger.log('✓ Trace complete. Chain length: ' + result.chain.length);
    
    // Extract suffixes from all URLs in the chain
    const suffixes = [];
    
    for (var i = 0; i < result.chain.length; i++) {
      const step = result.chain[i];
      const url = step.url || '';
      
      if (url) {
        const extractedSuffix = extractSuffixFromUrl(url);
        if (extractedSuffix) {
          suffixes.push({
            suffix: extractedSuffix,
            clicks: 0,
            impressions: 0
          });
        }
      }
    }
    
    Logger.log('Extracted ' + suffixes.length + ' unique suffixes from trace');
    
    return suffixes;
    
  } catch (error) {
    Logger.log('❌ Error tracing URL: ' + error.message);
    return [];
  }
}

// ============================================
// QUEUE STATUS UPDATE FUNCTIONS
// ============================================

function markQueueItemProcessing(itemId) {
  updateQueueItemStatus(itemId, 'processing', null);
}

function markQueueItemCompleted(itemId) {
  updateQueueItemStatus(itemId, 'completed', null);
}

function markQueueItemFailed(itemId, errorMessage) {
  updateQueueItemStatus(itemId, 'failed', errorMessage);
}

function updateQueueItemStatus(itemId, status, errorMessage) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_update_queue?id=eq.' + itemId;
    
    const payload = {
      status: status,
      attempts: 1
    };
    
    if (status === 'processing') {
      payload.processing_started_at = new Date().toISOString();
    }
    
    if (status === 'completed') {
      payload.completed_at = new Date().toISOString();
    }
    
    if (errorMessage) {
      payload.error_message = errorMessage;
      payload.last_error_at = new Date().toISOString();
    }
    
    UrlFetchApp.fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
  } catch (error) {
    Logger.log('❌ Error updating queue status: ' + error.message);
  }
}

// ============================================
// ZERO-CLICK SUFFIX FETCHING
// ============================================

function checkAndFetchDailyZeroClickSuffixes(accountId) {
  try {
    // Get last fetch timestamp from script property
    const scriptProperties = PropertiesService.getScriptProperties();
    const lastFetchKey = 'ZERO_CLICK_LAST_FETCH_' + accountId;
    const lastFetchTimestamp = scriptProperties.getProperty(lastFetchKey);
    const now = new Date().getTime();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    // Check if 24 hours have passed since last fetch
    if (lastFetchTimestamp) {
      const timeSinceLastFetch = now - parseInt(lastFetchTimestamp);
      if (timeSinceLastFetch < ONE_DAY_MS) {
        const hoursRemaining = Math.floor((ONE_DAY_MS - timeSinceLastFetch) / (60 * 60 * 1000));
        Logger.log('⏭️  Zero-click fetch already done today. Next run in ~' + hoursRemaining + ' hours');
        return;
      }
    }
    
    Logger.log('📊 Fetching zero-click suffixes for all mappings...');
    
    // Get all mappings for this account
    const mappings = fetchAllMappingsForAccount(accountId);
    
    if (!mappings || mappings.length === 0) {
      Logger.log('ℹ️  No mappings found for this account');
      return;
    }
    
    let totalFetched = 0;
    
    for (var i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];
      Logger.log('\\nFetching for campaign: ' + mapping.campaign_name + ' (ID: ' + mapping.campaign_id + ')');
      
      // Clean bucket before fetching: delete used suffixes + old zero-click suffixes
      // This keeps only: unused traced suffixes that were never sent to Google
      Logger.log('  Cleaning old bucket data...');
      cleanOldUsedSuffixes(mapping.mapping_id);
      
      // Now fetch fresh zero-click suffixes from Google
      const count = fetchAndStoreZeroClickSuffixes(mapping.campaign_id, mapping.mapping_id);
      totalFetched += count;
    }
    
    Logger.log('\\n✓ Daily zero-click fetch complete. Total suffixes stored: ' + totalFetched);
    
    // Update last fetch timestamp
    scriptProperties.setProperty(lastFetchKey, now.toString());
    
  } catch (error) {
    Logger.log('❌ Error in daily zero-click fetch: ' + error.message);
  }
}

// ============================================
// DAILY SEQUENTIAL SUFFIX UPDATE
// ============================================

function checkAndUpdateSuffixesDaily(accountId) {
  try {
    // Get last update timestamp from script property
    const scriptProperties = PropertiesService.getScriptProperties();
    const lastUpdateKey = CONFIG.SUFFIX_UPDATE_LAST_RUN + accountId;
    const lastUpdateTimestamp = scriptProperties.getProperty(lastUpdateKey);
    const now = new Date().getTime();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    // Check if 24 hours have passed since last update
    if (lastUpdateTimestamp) {
      const timeSinceLastUpdate = now - parseInt(lastUpdateTimestamp);
      if (timeSinceLastUpdate < ONE_DAY_MS) {
        const hoursRemaining = Math.floor((ONE_DAY_MS - timeSinceLastUpdate) / (60 * 60 * 1000));
        Logger.log('⏭️  Sequential suffix update already done today. Next run in ~' + hoursRemaining + ' hours');
        return;
      }
    }
    
    Logger.log('🔄 Running daily sequential suffix update...');
    
    // Update suffixes sequentially and clean old/used ones
    updateCampaignSuffixesSequentially(accountId);
    
    // Update last update timestamp
    scriptProperties.setProperty(lastUpdateKey, now.toString());
    
  } catch (error) {
    Logger.log('❌ Error in daily suffix update: ' + error.message);
  }
}

function updateCampaignSuffixesSequentially(accountId) {
  try {
    const mappings = fetchAllMappingsForAccount(accountId);
    
    if (!mappings || mappings.length === 0) {
      Logger.log('ℹ️  No active mappings to update');
      return;
    }
    
    let updatedCount = 0;
    
    for (var i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];
      
      // Get next unused suffix from bucket (sequential order)
      const nextSuffix = getNextSuffixFromBucket(mapping.mapping_id);
      
      if (nextSuffix) {
        Logger.log('\\nUpdating suffix for: ' + mapping.campaign_name);
        Logger.log('  Suffix: ' + nextSuffix.suffix);
        Logger.log('  Sequential ID: ' + nextSuffix.suffix_id);
        
        const success = applySuffixUpdate(mapping.campaign_id, nextSuffix.suffix);
        
        if (success) {
          markBucketSuffixAsUsed(nextSuffix.suffix_id);
          updatedCount++;
        }
      } else {
        Logger.log('⚠️  No unused suffixes in bucket for: ' + mapping.campaign_name);
      }
    }
    
    Logger.log('\\n✓ Sequential update complete. Updated ' + updatedCount + ' campaigns');
    
  } catch (error) {
    Logger.log('❌ Error in sequential suffix update: ' + error.message);
  }
}

// ============================================
// AUTOMATIC CLEANUP (USED + OLD ZERO-CLICK)
// ============================================

function cleanOldUsedSuffixes(mappingId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/rpc/clean_old_used_suffixes';
    
    const payload = {
      p_mapping_id: mappingId
    };
    
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data && data.length > 0 && data[0].deleted_count > 0) {
        Logger.log('  🧹 Cleaned ' + data[0].deleted_count + ' suffixes (used + old zero-click)');
      }
    }
    
  } catch (error) {
    Logger.log('❌ Error cleaning bucket: ' + error.message);
  }
}

function fetchAllMappingsForAccount(accountId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_campaign_mappings' +
                '?account_id=eq.' + accountId +
                '&is_active=eq.true' +
                '&select=*';
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    }
    
    return [];
  } catch (error) {
    Logger.log('❌ Error fetching mappings: ' + error.message);
    return [];
  }
}

function fetchAndStoreZeroClickSuffixes(campaignId, mappingId) {
  try {
    // Fetch ALL zero-click suffixes from last 7 days
    const lookbackDays = CONFIG.ZERO_CLICK_LOOKBACK_DAYS;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);
    const dateString = Utilities.formatDate(startDate, AdsApp.currentAccount().getTimeZone(), 'yyyyMMdd');
    
    const query = 'SELECT EffectiveFinalUrl, Clicks, Impressions ' +
                  'FROM FINAL_URL_REPORT ' +
                  'WHERE CampaignId = ' + campaignId + ' ' +
                  'AND Clicks = 0 ' +
                  'AND Impressions > 0 ' +
                  'DURING ' + dateString + ',' + Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyyMMdd');
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    const suffixes = [];
    while (rows.hasNext()) {
      const row = rows.next();
      const finalUrl = row['EffectiveFinalUrl'] || row['FinalUrls'] || '';
      const clicks = parseInt(row['Clicks']);
      const impressions = parseInt(row['Impressions']);
      
      if (finalUrl && clicks === 0 && impressions > 0) {
        const suffix = extractSuffixFromUrl(finalUrl);
        if (suffix) {
          suffixes.push({
            suffix: suffix,
            clicks: clicks,
            impressions: impressions
          });
        }
      }
    }
    
    Logger.log('Found ' + suffixes.length + ' zero-click suffixes');
    
    if (suffixes.length > 0) {
      return storeSuffixesInBucket(mappingId, suffixes);
    }
    
    return 0;
    
  } catch (error) {
    Logger.log('❌ Error fetching zero-click suffixes: ' + error.message);
    return 0;
  }
}

function extractSuffixFromUrl(url) {
  try {
    if (!url || url.indexOf('?') === -1) {
      return null;
    }
    
    const parts = url.split('?');
    if (parts.length < 2) {
      return null;
    }
    
    return parts[1];
  } catch (error) {
    return null;
  }
}

function storeSuffixesInBucket(mappingId, suffixes) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_bucket';
    
    let storedCount = 0;
    
    for (var i = 0; i < suffixes.length; i++) {
      const item = suffixes[i];
      
      const payload = {
        mapping_id: mappingId,
        suffix: item.suffix,
        suffix_hash: Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, item.suffix)
          .map(function(byte) {
            return ('0' + (byte & 0xFF).toString(16)).slice(-2);
          }).join(''),
        original_clicks: item.clicks,
        original_impressions: item.impressions,
        source: 'zero_click',
        is_valid: true
      };
      
      try {
        const response = UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
        
        if (response.getResponseCode() === 201) {
          storedCount++;
        }
      } catch (error) {
        // Likely duplicate - skip
      }
    }
    
    return storedCount;
  } catch (error) {
    Logger.log('❌ Error storing suffixes: ' + error.message);
    return 0;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function fetchMappingByIds(accountId, campaignId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_campaign_mappings' +
                '?account_id=eq.' + accountId +
                '&campaign_id=eq.' + campaignId +
                '&select=*' +
                '&limit=1';
    
    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      if (data && data.length > 0) {
        return data[0];
      }
    }
    
    return null;
  } catch (error) {
    Logger.log('❌ Error fetching mapping: ' + error.message);
    return null;
  }
}`;

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
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-indigo-200 dark:border-indigo-800 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 px-6 py-4 border-b border-indigo-200 dark:border-indigo-800">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Script Scheduler Control</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Pause/resume and set minimum interval (seconds) per offer/account</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Offer Name</label>
                <input value={schedOfferName} onChange={(e) => setSchedOfferName(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850" />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Account ID</label>
                <input value={schedAccountId} onChange={(e) => setSchedAccountId(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Min Interval (seconds)</label>
                <input type="number" min={60} step={60} value={schedMinInterval} onChange={(e) => setSchedMinInterval(Number(e.target.value))} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-850" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input id="pauseToggle" type="checkbox" checked={schedPaused} onChange={(e) => setSchedPaused(e.target.checked)} />
                  <label htmlFor="pauseToggle" className="text-sm text-neutral-800 dark:text-neutral-200">Pause execution</label>
                </div>
                <div className="flex items-center gap-2">
                  <input id="autoScheduleToggle" type="checkbox" checked={schedAutoSchedule} onChange={(e) => setSchedAutoSchedule(e.target.checked)} />
                  <label htmlFor="autoScheduleToggle" className="text-sm text-neutral-800 dark:text-neutral-200">Auto-schedule (24/7)</label>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={loadSchedulerConfig} disabled={schedLoading} className="px-3 py-2 text-sm rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600">
                  {schedLoading ? 'Loading…' : 'Load'}
                </button>
                <button onClick={saveSchedulerConfig} disabled={schedLoading} className="px-3 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">
                  {schedLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            {schedNextRun && (
              <div className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Next Run:</strong> {new Date(schedNextRun).toLocaleString()}
              </div>
            )}
            {schedMessage && (
              <div className="text-sm text-neutral-700 dark:text-neutral-300">{schedMessage}</div>
            )}
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              <p><strong>Auto-schedule (24/7):</strong> When enabled, script automatically calculates next run = start time + min interval (e.g., starts at 10:00, next at 10:30).</p>
              <p><strong>How to use:</strong> Set Google Ads trigger to run every 5-10 minutes. Scheduler will allow execution only at calculated times.</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-indigo-200 dark:border-indigo-800 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 px-6 py-4 border-b border-indigo-200 dark:border-indigo-800">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Script Execution Status</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Recent runs for the selected offer/account</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <button onClick={loadExecutions} disabled={execLoading} className="px-3 py-2 text-sm rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600">
                {execLoading ? 'Loading…' : 'Refresh'}
              </button>
              {execMessage && <div className="text-sm text-neutral-700 dark:text-neutral-300">{execMessage}</div>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-neutral-200 dark:border-neutral-800">
                    <th className="py-2 pr-4">Started</th>
                    <th className="py-2 pr-4">Finished</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Version</th>
                    <th className="py-2 pr-4">API Calls</th>
                    <th className="py-2 pr-4">Updated</th>
                    <th className="py-2 pr-4">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-3 text-neutral-600 dark:text-neutral-400">No runs yet</td>
                    </tr>
                  ) : (
                    executions.map((row, idx) => (
                      <tr key={row.id || idx} className="border-b border-neutral-200 dark:border-neutral-800">
                        <td className="py-2 pr-4">{row.started_at ? new Date(row.started_at).toLocaleString() : '-'}</td>
                        <td className="py-2 pr-4">{row.finished_at ? new Date(row.finished_at).toLocaleString() : '-'}</td>
                        <td className="py-2 pr-4">{row.client || '-'}</td>
                        <td className="py-2 pr-4">{row.version || '-'}</td>
                        <td className="py-2 pr-4">{row.total_api_calls ?? '-'}</td>
                        <td className="py-2 pr-4">{row.total_campaigns_updated ?? '-'}</td>
                        <td className="py-2 pr-4">{row.total_campaigns_failed ?? '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Webhook Master Script - All-in-One */}
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-neutral-50 dark:bg-neutral-850 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileCode className="text-emerald-600 dark:text-emerald-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Webhook Master Script (All-in-One) 🎯</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Single script that auto-creates mappings + polls webhooks + fetches zero-click suffixes + updates campaigns
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(webhookMasterScript, 'webhook-master')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-smooth"
            >
              {copiedScript === 'webhook-master' ? (
                <>
                  <CheckCircle size={20} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={20} />
                  <span>Copy Script</span>
                </>
              )}
            </button>
          </div>
          <div className="px-6 py-4">
            <pre className="bg-neutral-50 dark:bg-neutral-950 p-4 rounded-lg overflow-x-auto text-sm border border-neutral-200 dark:border-neutral-800">
              <code className="text-neutral-800 dark:text-neutral-200">{webhookMasterScript}</code>
            </pre>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-brand-200 dark:border-brand-800 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-50 to-orange-50 dark:from-brand-900/20 dark:to-orange-900/20 px-6 py-4 border-b border-brand-200 dark:border-brand-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="text-brand-600 dark:text-brand-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Google Ads Script (V5 Webhook All-In) 🚀</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Single webhook per offer, offer+account controls, queue + bucket + zero-click fallback, daily stats cache
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(googleAdsV5AllIn, 'google-ads-v5')}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 dark:bg-brand-500 text-white rounded-lg hover:bg-brand-700 dark:hover:bg-brand-600 transition-smooth"
            >
              {copiedScript === 'google-ads-v5' ? (
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
            <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
              <h4 className="font-semibold text-brand-900 dark:text-brand-300 mb-2">🔥 V5 Flow</h4>
              <div className="text-sm text-brand-800 dark:text-brand-300 space-y-1">
                <p>1) Polls webhook queue (offer + account scoped) then updates matching campaigns.</p>
                <p>2) Falls back to bucket (zero-click + traced) when queue is empty.</p>
                <p>3) Marks used suffix IDs and re-stores suffixes to bucket for inventory.</p>
                <p>4) Caches yesterday landing page stats to avoid repeated report fetch.</p>
              </div>
            </div>
            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto max-h-96">
              {googleAdsV5AllIn}
            </pre>
          </div>
        </div>

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
                  <p className="font-semibold">MAX_RUNTIME_MS</p>
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
                <p>With default settings (MAX_RUNTIME_MS = 1500000):</p>
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

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-purple-200 dark:border-purple-800 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 px-6 py-4 border-b border-purple-200 dark:border-purple-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="text-purple-600 dark:text-purple-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Google Ads Script (Multi-Offer V4) 🎯</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  NEW: Multiple offers with flexible campaign mapping - manual or automatic distribution
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(googleAdsMultiOfferV4, 'google-ads-v4')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-smooth"
            >
              {copiedScript === 'google-ads-v4' ? (
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
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-800 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">🎯 Multi-Offer Magic (V4)</h4>
              <div className="text-sm text-purple-800 dark:text-purple-400 space-y-2">
                <p className="font-semibold">What makes V4 special:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li><strong>Multiple Offers:</strong> Pass array of offer names OR single string (backward compatible)</li>
                  <li><strong>Flexible Mapping:</strong> Manual campaign→offer mapping OR automatic round-robin</li>
                  <li><strong>Unique Per Campaign:</strong> Each campaign gets unique suffix from its assigned offer</li>
                  <li><strong>Per-Offer Stats:</strong> Independent interval calculation for each offer</li>
                  <li><strong>Per-Offer Tracking:</strong> Yesterday's data collected separately per offer</li>
                </ul>
              </div>
            </div>

            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-4">
              <h4 className="font-semibold text-violet-900 dark:text-violet-300 mb-2">🔧 Two Mapping Modes</h4>
              <div className="text-sm text-violet-800 dark:text-violet-400 space-y-3">
                <div>
                  <p className="font-semibold">1. Manual Mode (Explicit Control)</p>
                  <pre className="bg-violet-100 dark:bg-violet-950 text-violet-900 dark:text-violet-300 p-2 rounded mt-1 text-xs">
{`var CAMPAIGN_MAPPING = {
  '12345678': 'offer1',
  '87654321': 'offer2',
  '11223344': 'offer3'
};`}
                  </pre>
                  <p className="ml-4 mt-1">Map specific campaign IDs to specific offers. Full control.</p>
                </div>
                <div>
                  <p className="font-semibold">2. Auto Mode (Round-Robin)</p>
                  <pre className="bg-violet-100 dark:bg-violet-950 text-violet-900 dark:text-violet-300 p-2 rounded mt-1 text-xs">
{`var CAMPAIGN_MAPPING = {}; // Empty = auto mode`}
                  </pre>
                  <p className="ml-4 mt-1">Automatically distribute campaigns evenly across all offers.</p>
                </div>
              </div>
            </div>

            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto max-h-96">
              {googleAdsMultiOfferV4}
            </pre>

            <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-lg p-4">
              <h4 className="font-semibold text-warning-900 dark:text-warning-300 mb-3">⚙️ V4 Configuration Variables</h4>
              <div className="text-sm text-warning-800 dark:text-warning-400 space-y-3">
                <div>
                  <p className="font-semibold">OFFER_NAMES (Flexible Format)</p>
                  <p className="ml-4">Accept array OR single string:</p>
                  <pre className="bg-warning-100 dark:bg-warning-950 text-warning-900 dark:text-warning-300 p-2 rounded mt-1 text-xs">
{`// Multi-offer mode
var OFFER_NAMES = ['offer1', 'offer2', 'offer3'];

// Single-offer mode (backward compatible)
var OFFER_NAMES = 'single-offer';`}
                  </pre>
                </div>
                <div>
                  <p className="font-semibold">CAMPAIGN_MAPPING (Optional)</p>
                  <p className="ml-4">Manual: Map campaign IDs to offers</p>
                  <p className="ml-4">Auto: Leave empty {} for round-robin</p>
                </div>
                <div>
                  <p className="font-semibold">Per-Offer Intervals</p>
                  <p className="ml-4">Each offer has independent MIN_INTERVAL_MS, MAX_INTERVAL_MS, TARGET_REPEAT_RATIO, MIN_REPEAT_RATIO</p>
                  <p className="ml-4 text-xs mt-1">Defaults: MIN=1000ms, MAX=30000ms, TARGET=5x, MIN=1.0x</p>
                </div>
                <div>
                  <p className="font-semibold">MAX_RUNTIME_MS</p>
                  <p className="ml-4">Maximum runtime in milliseconds (default: 1500000 = 25 minutes)</p>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">📊 Example Scenarios</h4>
              <div className="text-sm text-purple-800 dark:text-purple-400 space-y-3">
                <div>
                  <p className="font-semibold">Scenario 1: Single Offer (Backward Compatible)</p>
                  <pre className="bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 p-2 rounded mt-1 text-xs">
{`var OFFER_NAMES = 'my-offer';
var CAMPAIGN_MAPPING = {};
// Result: All campaigns get suffixes from 'my-offer'`}
                  </pre>
                </div>
                <div>
                  <p className="font-semibold">Scenario 2: Three Offers, Auto Distribution</p>
                  <pre className="bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 p-2 rounded mt-1 text-xs">
{`var OFFER_NAMES = ['offer-a', 'offer-b', 'offer-c'];
var CAMPAIGN_MAPPING = {};
// Result: 10 campaigns → Campaign 1,4,7,10→offer-a, 2,5,8→offer-b, 3,6,9→offer-c`}
                  </pre>
                </div>
                <div>
                  <p className="font-semibold">Scenario 3: Three Offers, Manual Mapping</p>
                  <pre className="bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-300 p-2 rounded mt-1 text-xs">
{`var OFFER_NAMES = ['premium', 'standard', 'budget'];
var CAMPAIGN_MAPPING = {
  '11111111': 'premium',
  '22222222': 'premium',
  '33333333': 'standard',
  '44444444': 'budget'
};
// Result: Full control - high-value campaigns get 'premium' offer`}
                  </pre>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">🚀 How It Works</h4>
              <div className="text-sm text-purple-800 dark:text-purple-400 space-y-2">
                <p><strong>Startup Phase:</strong></p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Normalize OFFER_NAMES to array format</li>
                  <li>Get all enabled campaigns from Google Ads</li>
                  <li>Assign campaigns to offers (manual mapping or round-robin)</li>
                  <li>Collect yesterday's data for each offer separately (filtered by assigned campaigns)</li>
                  <li>Fetch initial recommended interval for each offer</li>
                </ul>
                <p className="pt-2"><strong>Update Cycle:</strong></p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>For each campaign: Determine assigned offer</li>
                  <li>Call get-suffix API for that offer (unique suffix per campaign)</li>
                  <li>Update campaign with unique suffix from its assigned offer</li>
                  <li>Track per-offer statistics (API calls, campaigns updated, etc.)</li>
                  <li>Wait average interval across all offers before next cycle</li>
                </ul>
                <p className="pt-2"><strong>Per-Offer Intelligence:</strong></p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Each offer maintains independent interval calculation</li>
                  <li>Yesterday's data collected per offer (only campaigns assigned to that offer)</li>
                  <li>Three-scenario speedup/stable/slowdown logic per offer</li>
                  <li>Detailed per-offer statistics logged at end</li>
                </ul>
              </div>
            </div>

            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-4">
              <h4 className="font-semibold text-violet-900 dark:text-violet-300 mb-2">💡 Pro Tips</h4>
              <div className="text-sm text-violet-800 dark:text-violet-400 space-y-2">
                <ul className="list-disc ml-5 space-y-1">
                  <li><strong>Find Campaign IDs:</strong> Run the <code className="bg-violet-100 dark:bg-violet-950 px-1 py-0.5 rounded">listCampaignIds()</code> helper function</li>
                  <li><strong>Test First:</strong> Set <code className="bg-violet-100 dark:bg-violet-950 px-1 py-0.5 rounded">DRY_RUN_MODE = true</code> to preview without updating</li>
                  <li><strong>Start Small:</strong> Test with 2 offers and 4 campaigns before scaling up</li>
                  <li><strong>Monitor Logs:</strong> Check per-offer statistics at end of execution</li>
                  <li><strong>API Volume:</strong> V4 makes N API calls per cycle (N = number of campaigns)</li>
                  <li><strong>Backward Compatible:</strong> Single offer mode works exactly like V2</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xs dark:shadow-none border border-indigo-200 dark:border-indigo-800 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 px-6 py-4 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="text-indigo-600 dark:text-indigo-400" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Google Ads Script (Adaptive V3 + Auto-Schedule)</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Uses scheduler check/report, no sleeps, target repeats = 2 for faster optimization
                </p>
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(googleAdsAutoScheduleV3, 'google-ads-v3')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-smooth"
            >
              {copiedScript === 'google-ads-v3' ? (
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
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">🗓 Auto-Scheduler + Aggressive Targeting</h4>
              <div className="text-sm text-indigo-800 dark:text-indigo-400 space-y-2">
                <ul className="list-disc ml-5 space-y-1">
                  <li>Checks central scheduler before running; reports summary after</li>
                  <li>No sleeps anywhere (even between retries)</li>
                  <li>Adaptive interval uses target repeats = 2</li>
                  <li>Passes min/max/default constraints to the API</li>
                </ul>
              </div>
            </div>
            <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 dark:text-neutral-200 text-sm p-4 rounded overflow-x-auto max-h-96">
              {googleAdsAutoScheduleV3}
            </pre>
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
