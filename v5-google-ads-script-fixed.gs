// =============================================================
// GOOGLE ADS SCRIPT (V5 WEBHOOK ALL-IN) - FIXED
// Single-webhook-per-offer, offer+account controls, bucket + queue
// 
// FLOW:
// 1. Webhook arrives -> Gets suffix from bucket -> Triggers trace -> Queues (suffix attached)
// 2. Script polls queue -> Gets pending webhooks (suffix already populated)
// 3. For each webhook:
//    - Apply suffix to Google Ads campaign
//    - Mark queue item as completed
// 4. Zero-click suffixes (once daily) -> Stored in bucket
// 5. Background traces (triggered by webhook) -> Update bucket
//
// BUCKET = Single source of truth for all suffixes
// Trace happens in WEBHOOK HANDLER, not in this script
//
// HOW TO USE
// 1) Set SUPABASE_URL to your project URL (already injected here).
// 2) Fill OFFER_BY_CAMPAIGN or OFFER_DEFAULT. Campaign mapping wins.
// 3) Optional: set ALLOWED_CAMPAIGN_IDS to limit updates.
// 4) Schedule hourly (or faster) in Google Ads scripts.
// 5) Trackier calls v5-webhook-conversion -> handles trace + bucket + queue
// =============================================================

var SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
var OFFER_DEFAULT = 'OFFER_NAME'; // used when no campaign-specific mapping found
var ACCOUNT_ID = ''; // auto-set at runtime

// Map Campaign IDs -> Offer names (single webhook per offer)
// Example: {'1234567890': 'OfferA', '2345678901': 'OfferB'}
var OFFER_BY_CAMPAIGN = {};

// Optional allow-list: leave empty to update all enabled campaigns
var ALLOWED_CAMPAIGN_IDS = [];

// Batch controls
var BATCH_SIZE = 15; // how many webhooks per run

// ⚙️ POLLING INTERVAL CONTROL (Configure the polling frequency here)
var POLLING_INTERVAL_MS = 5000;  // 5 seconds between polls (adjust as needed)
var MAX_RUNTIME_MS = 540000;     // 9 minutes max (Google Ads Script limit is 10min)
var POLLING_CYCLES = 10;         // Max polling cycles per execution

// Zero-click fetch controls
var ZERO_CLICK_LOOKBACK_DAYS = 7; // fetch last 7 days
var ZERO_CLICK_FETCH_KEY = 'v5-zero-click-fetch'; // PropertiesService key

// Daily stats cache (repeat ratio helper)
var CACHE_KEY_STATS = 'v5-daily-stats';
var CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours cache

// =============================================================
// AUTO-SETUP CHECK (FIRST-TIME ACCOUNT DETECTION)
// =============================================================
function checkAutoSetup() {
  try {
    // First, get all enabled campaigns
    var campaigns = [];
    var campaignIterator = AdsApp.campaigns().withCondition('Status = ENABLED').get();
    
    while (campaignIterator.hasNext()) {
      var campaign = campaignIterator.next();
      campaigns.push({
        id: String(campaign.getId()),
        name: campaign.getName()
      });
    }
    
    if (campaigns.length === 0) {
      Logger.log('[AUTO-SETUP] No enabled campaigns found');
      return;
    }

    var url = SUPABASE_URL + '/functions/v1/v5-auto-setup';
    var payload = {
      account_id: ACCOUNT_ID,
      offer_name: OFFER_DEFAULT,
      campaigns: campaigns
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
    
    Logger.log('[AUTO-SETUP] Response code: ' + responseCode);
    
    if (responseCode !== 200) {
      Logger.log('[AUTO-SETUP] Error response: ' + responseText);
      return;
    }
    
    var data = JSON.parse(responseText);
    
    if (data.error) {
      Logger.log('[AUTO-SETUP] API Error: ' + data.error);
      return;
    }
    
    if (data.setup_needed) {
      Logger.log('[AUTO-SETUP] First-time setup required!');
      Logger.log('[AUTO-SETUP] Account: ' + ACCOUNT_ID);
      Logger.log('[AUTO-SETUP] Offer: ' + OFFER_DEFAULT);
      Logger.log('[AUTO-SETUP] Found ' + campaigns.length + ' campaigns');
      if (data.newly_mapped && data.newly_mapped.length > 0) {
        Logger.log('[AUTO-SETUP] ✓ Auto-mapped ' + data.newly_mapped.length + ' campaigns: ' + data.newly_mapped.join(', '));
      }
      if (data.trackier) {
        Logger.log('[AUTO-SETUP] ✓ Trackier campaign: ' + data.trackier.campaignId + ' (' + data.trackier.campaignName + ')');
      }
      if (data.instructions) {
        for (var i = 0; i < data.instructions.length; i++) {
          Logger.log(data.instructions[i]);
        }
      }
    } else {
      Logger.log('[AUTO-SETUP] Account already configured');
      if (data.existing_campaigns) {
        Logger.log('[AUTO-SETUP] Campaigns mapped: ' + data.existing_campaigns.join(', '));
      }
      if (data.newly_mapped) {
        Logger.log('[AUTO-SETUP] Newly mapped ' + data.newly_mapped.length + ' campaigns: ' + data.newly_mapped.join(', '));
      }
    }
  } catch (e) {
    Logger.log('[AUTO-SETUP] Check failed: ' + e);
  }
}

// =============================================================
// ENTRY POINT
// =============================================================
function main() {
  ACCOUNT_ID = getAccountId();
  Logger.log('=== V5 WEBHOOK (ALL-IN) ===');
  Logger.log('Account: ' + ACCOUNT_ID);
  Logger.log('[CONFIG] Polling Interval: ' + POLLING_INTERVAL_MS + 'ms, Max Runtime: ' + MAX_RUNTIME_MS + 'ms');

  // Step 0: Auto-setup check (first-time account detection)
  try {
    checkAutoSetup();
  } catch (e) {
    Logger.log('[AUTO-SETUP] Error: ' + e);
  }

  // Step 1: Check and fetch zero-click suffixes (once daily)
  try {
    checkAndFetchZeroClickSuffixes();
  } catch (e) {
    Logger.log('[ZERO-CLICK] Error: ' + e);
  }

  // Step 2: Collect landing page stats (cached for the day)
  var stats = getCachedLandingPages();
  if (!stats) {
    stats = collectYesterdayLandingPages();
    if (stats) {
      cacheStats(stats);
    }
  }

  // ========================================================
  // Step 3: POLLING LOOP for webhook queue
  // ========================================================
  var pollingCycle = 0;
  var startTime = new Date().getTime();
  var totalProcessed = 0;
  var totalUpdated = 0;
  var consecutiveEmptyPolls = 0;
  var MAX_EMPTY_POLLS = 3; // Exit after 3 consecutive empty polls
  
  while (pollingCycle < POLLING_CYCLES) {
    var elapsedMs = new Date().getTime() - startTime;
    
    // Check runtime limit
    if (elapsedMs > MAX_RUNTIME_MS) {
      Logger.log('[POLL] Max runtime reached (' + elapsedMs + 'ms). Ending polling loop.');
      break;
    }
    
    Logger.log('[POLL] Cycle ' + (pollingCycle + 1) + '/' + POLLING_CYCLES + ' - Elapsed: ' + elapsedMs + 'ms');
    
    // Fetch and process webhooks
    var webhooks = fetchWebhookQueue(BATCH_SIZE);
    
    if (webhooks.length === 0) {
      consecutiveEmptyPolls++;
      Logger.log('[POLL] No webhooks in queue (' + consecutiveEmptyPolls + '/' + MAX_EMPTY_POLLS + ' empty polls)');
      
      // Exit early if queue consistently empty
      if (consecutiveEmptyPolls >= MAX_EMPTY_POLLS) {
        Logger.log('[POLL] Queue empty after ' + MAX_EMPTY_POLLS + ' checks. Exiting early to save resources.');
        break;
      }
    } else {
      consecutiveEmptyPolls = 0; // Reset counter when work found
      Logger.log('[POLL] Processing ' + webhooks.length + ' webhooks');
      var summary = applySuffixes(webhooks);
      
      if (summary.queueIds.length > 0) {
        markQueueItemsProcessed(summary.queueIds);
      }
      
      totalProcessed += summary.processed;
      totalUpdated += summary.updatedAds;
      
      Logger.log('[POLL] This cycle: ' + summary.processed + ' webhooks, ' + summary.updatedAds + ' ads updated');
    }
    
    pollingCycle++;
    
    // Actual sleep between polls (Google Ads Scripts support Utilities.sleep)
    if (pollingCycle < POLLING_CYCLES && consecutiveEmptyPolls < MAX_EMPTY_POLLS) {
      var nextElapsedMs = new Date().getTime() - startTime + POLLING_INTERVAL_MS;
      if (nextElapsedMs < MAX_RUNTIME_MS) {
        Logger.log('[POLL] Sleeping ' + POLLING_INTERVAL_MS + 'ms before next cycle...');
        Utilities.sleep(POLLING_INTERVAL_MS);
      }
    }
  }
  
  Logger.log('[DONE] Total webhooks processed: ' + totalProcessed + ', ads updated: ' + totalUpdated);
  Logger.log('[DONE] Completed ' + pollingCycle + ' polling cycles in ' + (new Date().getTime() - startTime) + 'ms');
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
  var cleanedSuffix = suffix.replace(/^\\?/, '');
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
// BUCKET EMPTY CHECK (FOR RE-FETCH AFTER MANUAL CLEAR)
// =============================================================
function checkIfBucketEmpty() {
  try {
    var url = SUPABASE_URL + '/functions/v1/v5-get-multiple-suffixes';
    var payload = {
      account_id: ACCOUNT_ID,
      offer_name: OFFER_DEFAULT,
      count: 1
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());
    
    // If no suffixes available, bucket is empty
    return !data.suffixes || data.suffixes.length === 0;
  } catch (e) {
    Logger.log('[BUCKET-CHECK] Failed: ' + e);
    return false; // Assume not empty on error
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

    // Check if bucket is empty (allows re-fetch after manual clear)
    var bucketEmpty = checkIfBucketEmpty();
    
    if (lastFetch && !bucketEmpty) {
      var elapsed = now - parseInt(lastFetch, 10);
      if (elapsed < ONE_DAY_MS) {
        Logger.log('[ZERO-CLICK] Already fetched today. Next fetch in ' + Math.round((ONE_DAY_MS - elapsed) / 3600000) + ' hours');
        return;
      }
    }
    
    if (bucketEmpty) {
      Logger.log('[ZERO-CLICK] Bucket is empty, forcing fresh fetch...');
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
    var props = PropertiesService.getScriptProperties();
    var cacheData = {
      data: stats,
      timestamp: new Date().getTime()
    };
    props.setProperty(CACHE_KEY_STATS, JSON.stringify(cacheData));
  } catch (e) {
    Logger.log('[CACHE] Failed to write: ' + e);
  }
}

function getCachedLandingPages() {
  try {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(CACHE_KEY_STATS);
    if (!raw) return null;
    
    var cacheData = JSON.parse(raw);
    var now = new Date().getTime();
    var age = now - cacheData.timestamp;
    
    // Check if cache expired (CACHE_TTL_SECONDS is in seconds, convert to ms)
    if (age > (CACHE_TTL_SECONDS * 1000)) {
      Logger.log('[CACHE] Expired, clearing old data');
      props.deleteProperty(CACHE_KEY_STATS);
      return null;
    }
    
    return cacheData.data;
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
}
