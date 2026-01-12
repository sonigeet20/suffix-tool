/**
 * Trackier Click Count Polling Job
 * Polls Trackier API for campaign click counts and triggers updates when count changes
 * Alternative to webhooks for reliable click detection
 */

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Enable CORS for all Trackier routes
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Map to track last known click counts per campaign
const lastKnownCounts = {};

/**
 * Fetch campaign statistics from Trackier API
 * Returns click count for a given campaign
 */
async function getTrackierCampaignStats(apiKey, apiBaseUrl, campaignId) {
  try {
    const url = `${apiBaseUrl}/v2/campaigns/${campaignId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`[Trackier Polling] Failed to fetch stats for campaign ${campaignId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    // Trackier API returns campaign stats with click count
    // Different versions may use different field names
    const clickCount = data.campaign?.clicks || data.clicks || 0;
    
    console.log(`[Trackier Polling] Campaign ${campaignId} stats: ${clickCount} clicks`);
    return clickCount;
  } catch (error) {
    console.error(`[Trackier Polling] Error fetching stats for campaign ${campaignId}:`, error.message);
    return null;
  }
}

/**
 * Check for click count changes and trigger updates
 */
async function pollTrackierCampaign(trackierOffer) {
  try {
    const { id: offerId, api_key, api_base_url, url1_campaign_id } = trackierOffer;
    
    if (!api_key || !url1_campaign_id) {
      console.log(`[Trackier Polling] Skipping ${offerId}: missing API key or campaign ID`);
      return;
    }

    const apiBaseUrl = api_base_url || 'https://api.trackier.com';
    const cacheKey = `campaign_${url1_campaign_id}`;
    const lastCount = lastKnownCounts[cacheKey] || 0;

    // Fetch current click count from Trackier
    const currentCount = await getTrackierCampaignStats(api_key, apiBaseUrl, url1_campaign_id);
    
    if (currentCount === null) {
      // API error, skip this poll
      return;
    }

    // Check if count increased
    if (currentCount > lastCount) {
      const clicksDelta = currentCount - lastCount;
      console.log(`[Trackier Polling] ✅ Detected ${clicksDelta} new click(s) on campaign ${url1_campaign_id}`);
      
      // Update cache
      lastKnownCounts[cacheKey] = currentCount;

      // Store polling log in database
      await supabase
        .from('trackier_polling_logs')
        .insert({
          trackier_offer_id: offerId,
          campaign_id: url1_campaign_id,
          previous_count: lastCount,
          current_count: currentCount,
          clicks_detected: clicksDelta,
          processed: false
        });

      // Trigger background update (same as webhook would)
      // In production, this would queue a background job
      // For now, we log it and you can process it separately
      console.log(`[Trackier Polling] Queued update for ${clicksDelta} new click(s)`);

    } else if (currentCount === lastCount) {
      // No change
      lastKnownCounts[cacheKey] = currentCount;
    } else {
      // Count decreased (campaign reset?) - just update cache
      console.warn(`[Trackier Polling] Count decreased for campaign ${url1_campaign_id}: ${lastCount} → ${currentCount}`);
      lastKnownCounts[cacheKey] = currentCount;
    }

  } catch (error) {
    console.error('[Trackier Polling] Unexpected error:', error);
  }
}

/**
 * Main polling loop - runs every 30 seconds
 */
async function startPollingLoop(intervalSeconds = 30) {
  console.log(`[Trackier Polling] Starting polling loop (interval: ${intervalSeconds}s)`);

  setInterval(async () => {
    try {
      // Fetch all active Trackier offers
      const { data: offers, error } = await supabase
        .from('trackier_offers')
        .select('*')
        .eq('enabled', true);

      if (error) {
        console.error('[Trackier Polling] Error fetching offers:', error.message);
        return;
      }

      if (!offers || offers.length === 0) {
        // No offers to poll
        return;
      }

      // Poll each offer
      for (const offer of offers) {
        await pollTrackierCampaign(offer);
      }

    } catch (error) {
      console.error('[Trackier Polling] Loop error:', error);
    }
  }, intervalSeconds * 1000);
}

/**
 * REST Endpoint: Get polling statistics
 * GET /api/trackier-polling-stats
 */
router.get('/trackier-polling-stats', async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('trackier_polling_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      status: 'polling active',
      last_polls: logs,
      cache: lastKnownCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * REST Endpoint: Start polling manually
 * POST /api/trackier-polling-start
 */
router.post('/trackier-polling-start', (req, res) => {
  const intervalSeconds = req.body.interval || 30;
  startPollingLoop(intervalSeconds);
  
  res.json({
    success: true,
    message: `Polling started with ${intervalSeconds}s interval`,
    timestamp: new Date().toISOString()
  });
});

/**
 * REST Endpoint: Manually trigger one poll cycle
 * POST /api/trackier-polling-trigger
 */
router.post('/trackier-polling-trigger', async (req, res) => {
  try {
    const { data: offers } = await supabase
      .from('trackier_offers')
      .select('*')
      .eq('enabled', true);

    if (!offers) {
      return res.json({ success: true, offers_polled: 0 });
    }

    for (const offer of offers) {
      await pollTrackierCampaign(offer);
    }

    res.json({
      success: true,
      offers_polled: offers.length,
      timestamp: new Date().toISOString(),
      cache: lastKnownCounts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-start polling when module loads
if (process.env.TRACKIER_POLLING_ENABLED === 'true') {
  const intervalSeconds = parseInt(process.env.TRACKIER_POLLING_INTERVAL || '30', 10);
  startPollingLoop(intervalSeconds);
}

module.exports = router;
module.exports.startPollingLoop = startPollingLoop;
