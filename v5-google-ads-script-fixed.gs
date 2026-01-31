// =============================================================
// GOOGLE ADS SCRIPT (V5 WEBHOOK ALL-IN) - FIXED
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
  var cleanedSuffix = suffix.replace(/^\?/, '');
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
}
