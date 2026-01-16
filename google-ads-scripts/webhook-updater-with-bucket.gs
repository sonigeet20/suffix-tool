/**
 * WEBHOOK-BASED SUFFIX UPDATER WITH ZERO-CLICK BUCKET
 * 
 * This Google Ads script:
 * 1. Polls Supabase queue for webhook-triggered suffix updates every 2 seconds
 * 2. Applies suffix updates to Google Ads campaigns immediately
 * 3. Fetches zero-click suffixes from FINAL_URL_REPORT once daily
 * 4. Maintains a bucket of 20-100 zero-click suffixes per campaign mapping
 * 5. Auto-refills bucket when running low
 * 
 * SETUP:
 * 1. Create new Google Ads Script: "WEBHOOK-UPDATER-WITH-BUCKET"
 * 2. Paste this code
 * 3. Update SUPABASE_URL and SUPABASE_ANON_KEY below
 * 4. Schedule to run every 30 minutes
 * 5. Script will handle queue polling and daily zero-click fetching
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Supabase Configuration
  SUPABASE_URL: 'https://rfhuqenntxiqurplenjn.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY_HERE', // Replace with actual key
  
  // Queue Polling
  QUEUE_POLL_INTERVAL_SECONDS: 2,
  QUEUE_BATCH_SIZE: 10,
  MAX_RUNTIME_MINUTES: 28, // Google Ads scripts have 30-minute limit
  
  // Zero-Click Fetching
  ZERO_CLICK_FETCH_INTERVAL_HOURS: 24, // Fetch once daily
  ZERO_CLICK_LOOKBACK_DAYS: 7,
  ZERO_CLICK_MIN_BUCKET_SIZE: 20, // Refill when below this
  ZERO_CLICK_TARGET_BUCKET_SIZE: 50, // Target number of suffixes
  ZERO_CLICK_MAX_FETCH_PER_RUN: 100 // Max suffixes to fetch per campaign per run
};

// ============================================
// MAIN EXECUTION
// ============================================

function main() {
  Logger.log('=== WEBHOOK SUFFIX UPDATER WITH BUCKET STARTED ===');
  Logger.log('Time: ' + new Date().toISOString());
  
  const startTime = new Date().getTime();
  const maxRuntime = CONFIG.MAX_RUNTIME_MINUTES * 60 * 1000;
  
  let queueProcessCount = 0;
  let bucketRefillCount = 0;
  let lastZeroClickCheck = new Date().getTime();
  
  // Check if we need to fetch zero-click suffixes
  const shouldFetchZeroClick = checkShouldFetchZeroClick();
  
  if (shouldFetchZeroClick) {
    Logger.log('🔄 Starting daily zero-click suffix fetch...');
    bucketRefillCount = fetchZeroClickSuffixes();
    Logger.log('✅ Zero-click fetch complete. Refilled ' + bucketRefillCount + ' buckets');
    recordZeroClickFetch();
  }
  
  // Main polling loop
  Logger.log('🔄 Starting queue polling loop...');
  
  while (true) {
    const elapsed = new Date().getTime() - startTime;
    
    // Check if we're approaching runtime limit
    if (elapsed >= maxRuntime) {
      Logger.log('⏰ Approaching runtime limit. Stopping polling.');
      break;
    }
    
    // Process queue
    const processed = processUpdateQueue();
    queueProcessCount += processed;
    
    if (processed > 0) {
      Logger.log('✅ Processed ' + processed + ' queue items');
    }
    
    // Check bucket levels every 60 seconds
    if (new Date().getTime() - lastZeroClickCheck >= 60000) {
      const refilled = checkAndRefillBuckets();
      if (refilled > 0) {
        Logger.log('🪣 Refilled ' + refilled + ' low buckets');
        bucketRefillCount += refilled;
      }
      lastZeroClickCheck = new Date().getTime();
    }
    
    // Sleep before next poll
    Utilities.sleep(CONFIG.QUEUE_POLL_INTERVAL_SECONDS * 1000);
  }
  
  Logger.log('=== EXECUTION COMPLETE ===');
  Logger.log('Queue items processed: ' + queueProcessCount);
  Logger.log('Buckets refilled: ' + bucketRefillCount);
  Logger.log('Runtime: ' + Math.round((new Date().getTime() - startTime) / 1000) + ' seconds');
}

// ============================================
// QUEUE PROCESSING
// ============================================

function processUpdateQueue() {
  try {
    // Fetch pending queue items
    const queueItems = fetchPendingQueueItems();
    
    if (!queueItems || queueItems.length === 0) {
      return 0;
    }
    
    Logger.log('📥 Found ' + queueItems.length + ' pending queue items');
    
    let processedCount = 0;
    
    for (let i = 0; i < queueItems.length; i++) {
      const item = queueItems[i];
      
      try {
        // Mark as processing
        markQueueItemProcessing(item.id);
        
        // Apply suffix update to Google Ads campaign
        const success = applySuffixUpdate(item.account_id, item.campaign_id, item.new_suffix);
        
        if (success) {
          // Mark as completed
          markQueueItemCompleted(item.id);
          processedCount++;
          
          Logger.log('✅ Updated campaign ' + item.campaign_id + ' with new suffix');
        } else {
          // Mark as failed
          markQueueItemFailed(item.id, 'Failed to apply suffix update');
          Logger.log('❌ Failed to update campaign ' + item.campaign_id);
        }
        
      } catch (error) {
        Logger.log('❌ Error processing queue item ' + item.id + ': ' + error.message);
        markQueueItemFailed(item.id, error.message);
      }
    }
    
    return processedCount;
    
  } catch (error) {
    Logger.log('❌ Error in processUpdateQueue: ' + error.message);
    return 0;
  }
}

function fetchPendingQueueItems() {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_update_queue' +
                '?status=eq.pending' +
                '&order=priority.desc,webhook_received_at.asc' +
                '&limit=' + CONFIG.QUEUE_BATCH_SIZE;
    
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
    } else {
      Logger.log('❌ Failed to fetch queue items: ' + response.getResponseCode());
      return [];
    }
    
  } catch (error) {
    Logger.log('❌ Error fetching queue items: ' + error.message);
    return [];
  }
}

function applySuffixUpdate(accountId, campaignId, newSuffix) {
  try {
    // Get campaign
    const campaignSelector = AdsApp.campaigns()
      .withCondition('Id = ' + campaignId)
      .withLimit(1);
    
    const campaignIterator = campaignSelector.get();
    
    if (!campaignIterator.hasNext()) {
      Logger.log('⚠️ Campaign ' + campaignId + ' not found');
      return false;
    }
    
    const campaign = campaignIterator.next();
    
    // Update final URL suffix
    campaign.urls().setFinalUrlSuffix(newSuffix);
    
    Logger.log('✅ Applied suffix to campaign: ' + campaign.getName());
    return true;
    
  } catch (error) {
    Logger.log('❌ Error applying suffix: ' + error.message);
    return false;
  }
}

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
      attempts: 1 // Simplified - could track actual attempts
    };
    
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

function checkShouldFetchZeroClick() {
  try {
    // Check last fetch time from a properties service or simple flag
    const lastFetch = PropertiesService.getScriptProperties().getProperty('LAST_ZERO_CLICK_FETCH');
    
    if (!lastFetch) {
      return true; // First run
    }
    
    const lastFetchTime = new Date(lastFetch).getTime();
    const hoursSinceLastFetch = (new Date().getTime() - lastFetchTime) / (1000 * 60 * 60);
    
    return hoursSinceLastFetch >= CONFIG.ZERO_CLICK_FETCH_INTERVAL_HOURS;
    
  } catch (error) {
    Logger.log('❌ Error checking zero-click fetch time: ' + error.message);
    return false;
  }
}

function recordZeroClickFetch() {
  try {
    PropertiesService.getScriptProperties().setProperty('LAST_ZERO_CLICK_FETCH', new Date().toISOString());
  } catch (error) {
    Logger.log('❌ Error recording zero-click fetch: ' + error.message);
  }
}

function fetchZeroClickSuffixes() {
  try {
    // Get all active campaign mappings
    const mappings = fetchActiveMappings();
    
    if (!mappings || mappings.length === 0) {
      Logger.log('⚠️ No active campaign mappings found');
      return 0;
    }
    
    Logger.log('📋 Found ' + mappings.length + ' active mappings');
    
    let totalRefilled = 0;
    
    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];
      
      try {
        const refilled = fetchZeroClickForMapping(mapping);
        if (refilled > 0) {
          totalRefilled++;
          Logger.log('✅ Fetched ' + refilled + ' zero-click suffixes for ' + mapping.offer_name);
        }
      } catch (error) {
        Logger.log('❌ Error fetching zero-click for mapping ' + mapping.mapping_id + ': ' + error.message);
      }
    }
    
    return totalRefilled;
    
  } catch (error) {
    Logger.log('❌ Error in fetchZeroClickSuffixes: ' + error.message);
    return 0;
  }
}

function fetchZeroClickForMapping(mapping) {
  try {
    // Build GAQL query for zero-click URLs
    const query = 'SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ' +
                  'ad_group_ad.ad.final_urls, segments.date ' +
                  'FROM ad_group_ad ' +
                  'WHERE campaign.id = ' + mapping.campaign_id + ' ' +
                  'AND segments.date DURING LAST_' + CONFIG.ZERO_CLICK_LOOKBACK_DAYS + '_DAYS ' +
                  'AND metrics.clicks = 0 ' +
                  'AND metrics.impressions > 0 ' +
                  'LIMIT ' + CONFIG.ZERO_CLICK_MAX_FETCH_PER_RUN;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    const suffixes = [];
    
    while (rows.hasNext()) {
      const row = rows.next();
      const finalUrls = row['ad_group_ad.ad.final_urls'];
      
      if (finalUrls) {
        // Extract suffix from URL
        const suffix = extractSuffixFromUrl(finalUrls);
        if (suffix && suffix.length > 10) {
          suffixes.push(suffix);
        }
      }
    }
    
    if (suffixes.length === 0) {
      Logger.log('⚠️ No zero-click suffixes found for campaign ' + mapping.campaign_id);
      return 0;
    }
    
    // Store suffixes in Supabase bucket
    const stored = storeSuffixesInBucket(mapping.mapping_id, suffixes);
    
    return stored;
    
  } catch (error) {
    Logger.log('❌ Error fetching zero-click for mapping: ' + error.message);
    return 0;
  }
}

function extractSuffixFromUrl(urlString) {
  try {
    // URL might have final URL suffix appended
    const url = urlString.split('?');
    if (url.length > 1) {
      return '?' + url[url.length - 1]; // Return last query string
    }
    return null;
  } catch (error) {
    return null;
  }
}

function storeSuffixesInBucket(mappingId, suffixes) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_bucket';
    
    let storedCount = 0;
    
    for (let i = 0; i < suffixes.length; i++) {
      const suffix = suffixes[i];
      
      // Create hash for deduplication
      const hash = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        suffix,
        Utilities.Charset.UTF_8
      );
      const hashHex = hash.map(function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
      }).join('');
      
      const payload = {
        mapping_id: mappingId,
        suffix: suffix,
        suffix_hash: hashHex,
        source: 'zero_click',
        is_valid: true,
        original_clicks: 0,
        fetched_from_date: Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd')
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

function checkAndRefillBuckets() {
  try {
    // Get all active mappings
    const mappings = fetchActiveMappings();
    
    if (!mappings || mappings.length === 0) {
      return 0;
    }
    
    let refilledCount = 0;
    
    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];
      
      // Check bucket size
      const bucketSize = getBucketSize(mapping.mapping_id);
      
      if (bucketSize < CONFIG.ZERO_CLICK_MIN_BUCKET_SIZE) {
        Logger.log('⚠️ Bucket low for ' + mapping.offer_name + ' (' + bucketSize + ' suffixes)');
        
        // Fetch more
        const fetched = fetchZeroClickForMapping(mapping);
        if (fetched > 0) {
          refilledCount++;
        }
      }
    }
    
    return refilledCount;
    
  } catch (error) {
    Logger.log('❌ Error checking buckets: ' + error.message);
    return 0;
  }
}

function getBucketSize(mappingId) {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_suffix_bucket' +
                '?mapping_id=eq.' + mappingId +
                '&is_valid=eq.true' +
                '&select=id';
    
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
      return data.length;
    }
    
    return 0;
    
  } catch (error) {
    Logger.log('❌ Error getting bucket size: ' + error.message);
    return 0;
  }
}

function fetchActiveMappings() {
  try {
    const url = CONFIG.SUPABASE_URL + '/rest/v1/webhook_campaign_mappings' +
                '?is_active=eq.true' +
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
