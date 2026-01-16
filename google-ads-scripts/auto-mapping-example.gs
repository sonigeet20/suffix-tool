/**
 * GOOGLE ADS SCRIPT WITH AUTO-MAPPING
 * 
 * This script demonstrates how to use the auto-mapping feature:
 * 1. On first run for a campaign, it calls the auto-create API
 * 2. API creates mapping + Trackier campaign + webhook automatically
 * 3. Script logs webhook URL for you to copy
 * 4. You add webhook to Trackier S2S postback
 * 5. System auto-detects when webhook is configured
 * 
 * BENEFITS:
 * - No manual mapping creation needed
 * - Trackier campaigns created automatically
 * - Clear workflow with webhook status tracking
 * - Frontend shows which mappings need configuration
 */

// ============================================
// CONFIGURATION
// ============================================

var PROXY_SERVICE_URL = 'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com:3000';
var OFFER_NAME = 'OFFER_NAME'; // Replace with your offer name

// ============================================
// AUTO-MAPPING FUNCTION
// ============================================

function ensureMappingExists(accountId, campaignId, campaignName) {
  try {
    Logger.log('[Auto-Mapping] Checking mapping for Campaign ' + campaignId);
    
    var url = PROXY_SERVICE_URL + '/api/webhook-campaign/auto-create';
    
    var payload = {
      accountId: accountId,
      campaignId: campaignId,
      campaignName: campaignName,
      offerName: OFFER_NAME
    };
    
    var response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    var result = JSON.parse(response.getContentText());
    
    if (result.success) {
      if (result.alreadyExists) {
        Logger.log('[Auto-Mapping] ✓ Mapping already exists');
        Logger.log('  Trackier Campaign: ' + result.trackier.campaignId);
        Logger.log('  Webhook Configured: ' + (result.mapping.webhook_configured ? 'YES' : 'PENDING'));
      } else if (result.autoCreated) {
        Logger.log('[Auto-Mapping] ✨ NEW MAPPING CREATED!');
        Logger.log('='.repeat(80));
        Logger.log('  Trackier Campaign ID: ' + result.trackier.campaignId);
        Logger.log('  Webhook URL: ' + result.trackier.webhookUrl);
        Logger.log('  Click URL: ' + result.trackier.clickUrl);
        Logger.log('='.repeat(80));
        Logger.log('⚠️ NEXT STEPS:');
        Logger.log('  1. Copy webhook URL above');
        Logger.log('  2. Go to Trackier Campaign ' + result.trackier.campaignId);
        Logger.log('  3. Add S2S Postback with webhook URL');
        Logger.log('  4. System will auto-detect when configured');
        Logger.log('='.repeat(80));
      }
      
      return {
        success: true,
        mapping: result.mapping,
        trackier: result.trackier
      };
    } else {
      Logger.log('[Auto-Mapping] ❌ Failed: ' + result.error);
      return { success: false, error: result.error };
    }
    
  } catch (error) {
    Logger.log('[Auto-Mapping] ❌ Error: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ============================================
// MAIN SCRIPT
// ============================================

function main() {
  Logger.log('=== GOOGLE ADS SCRIPT WITH AUTO-MAPPING ===');
  Logger.log('Offer: ' + OFFER_NAME);
  Logger.log('');
  
  var accountId = AdsApp.currentAccount().getCustomerId();
  
  // Get all enabled campaigns
  var campaignIterator = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .get();
  
  var campaignsProcessed = 0;
  var newMappingsCreated = 0;
  
  while (campaignIterator.hasNext()) {
    var campaign = campaignIterator.next();
    var campaignId = campaign.getId();
    var campaignName = campaign.getName();
    
    Logger.log('Processing: ' + campaignName + ' (ID: ' + campaignId + ')');
    
    // Ensure mapping exists (auto-creates if needed)
    var result = ensureMappingExists(accountId, campaignId, campaignName);
    
    if (result.success) {
      if (result.mapping && !result.mapping.webhook_configured) {
        Logger.log('  ⚠️ Webhook setup needed - check logs above for URL');
        newMappingsCreated++;
      } else if (result.mapping && result.mapping.webhook_configured) {
        Logger.log('  ✓ Webhook configured and working');
      }
      
      campaignsProcessed++;
    }
    
    Logger.log('');
    
    // Add delay between campaigns
    Utilities.sleep(1000);
  }
  
  Logger.log('=== SUMMARY ===');
  Logger.log('Campaigns processed: ' + campaignsProcessed);
  Logger.log('New mappings created: ' + newMappingsCreated);
  
  if (newMappingsCreated > 0) {
    Logger.log('');
    Logger.log('⚠️ ACTION REQUIRED:');
    Logger.log('  ' + newMappingsCreated + ' campaigns need webhook setup in Trackier');
    Logger.log('  Check logs above for webhook URLs');
    Logger.log('  Or visit the Webhooks page in your dashboard');
  }
}

// ============================================
// HELPER: Get mapping status
// ============================================

function getMappingStatus(accountId, campaignId) {
  try {
    var url = PROXY_SERVICE_URL + '/api/webhook-campaign/list';
    
    var response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    
    var result = JSON.parse(response.getContentText());
    
    if (result.success && result.mappings) {
      // Find mapping for this campaign
      for (var i = 0; i < result.mappings.length; i++) {
        var mapping = result.mappings[i];
        if (mapping.account_id === accountId && mapping.campaign_id === campaignId) {
          return mapping;
        }
      }
    }
    
    return null;
    
  } catch (error) {
    Logger.log('Error getting mapping status: ' + error);
    return null;
  }
}
