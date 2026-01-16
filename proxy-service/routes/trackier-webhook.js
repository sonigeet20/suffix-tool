/**
 * Trackier Dual-URL Webhook Handler
 * 
 * ISOLATED MODULE - Does not affect existing functionality
 * 
 * Architecture:
 * 1. Google Ads → Trackier URL 1 (passthrough)
 * 2. URL 1 fires webhook → This handler
 * 3. Handler triggers background trace + update
 * 4. Updates Trackier URL 2 via API with fresh suffix
 * 
 * User gets instant redirect (URL 2 has pre-loaded suffix)
 * Background update prepares next suffix
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ [Trackier] SUPABASE_SERVICE_ROLE_KEY not configured');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

// Feature flag - can be disabled without affecting anything
// Can also be toggled via POST /api/trackier-emergency-toggle endpoint
let TRACKIER_ENABLED = process.env.TRACKIER_ENABLED !== 'false';

/**
 * ===================================================================
 * SUB_ID UTILITIES - Parse and map suffix parameters to sub_id fields
 * ===================================================================
 */

/**
 * Parse URL suffix into parameter-value pairs
 * @param {string} suffix - URL suffix like "?gclid=abc&fbclid=xyz"
 * @returns {Object} - Parsed params like {gclid: "abc", fbclid: "xyz"}
 */
function parseSuffixParams(suffix) {
  if (!suffix || typeof suffix !== 'string') {
    return {};
  }

  // Remove leading ? if present
  const cleanSuffix = suffix.startsWith('?') ? suffix.substring(1) : suffix;
  
  // Split by & and parse key=value pairs
  const params = {};
  cleanSuffix.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) {
      // Decode URL-encoded values
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  });

  return params;
}

/**
 * Map suffix parameters to sub_id values based on sub_id_mapping
 * Sends JUST the values - the campaign URL template includes the param names
 * 
 * @param {Object} suffixParams - Parsed suffix params like {awc: "12345", utm_source: "awin"}
 * @param {Object} subIdMapping - Mapping like {p1: "utm_source", p2: "utm_medium"}
 * @returns {Object} - sub_id values like {p1: "awin", p2: "cpm"}
 */
function mapParamsToSubIds(suffixParams, subIdMapping) {
  const subIdValues = {};
  
  // Iterate through sub_id_mapping and find corresponding values
  // Send ONLY the value - campaign URL template has param names
  // Template: ?utm_source={p1}&utm_medium={p2}&...
  Object.entries(subIdMapping).forEach(([subId, paramName]) => {
    if (suffixParams[paramName]) {
      // Format: just the value, no param name
      subIdValues[subId] = suffixParams[paramName];
    }
  });

  return subIdValues;
}

/**
 * Build destination URL with sub_id macros for custom parameters
 * Auto-detects parameters from the URL and builds template with placeholders
 * Format: ?param_name={p1}&another_param={p2}... for proper encoding
 * 
 * @param {string} baseUrl - Base offer URL like "https://example.com/offer?utm_source=X&utm_medium=Y"
 * @param {Object} subIdMapping - Mapping like {p1: "utm_source", p2: "utm_medium"}
 * @returns {string} - URL with macros like "https://example.com/offer?utm_source={p1}&utm_medium={p2}"
 */
function buildDestinationUrlWithMacros(baseUrl, subIdMapping) {
  try {
    // Parse the base URL to extract existing parameters
    const url = new URL(baseUrl);
    
    // Create a reverse mapping: param name → p number
    const paramToPlaceholder = {};
    Object.entries(subIdMapping).forEach(([placeholder, paramName]) => {
      paramToPlaceholder[paramName] = placeholder;
    });
    
    // Clear existing query params
    url.search = '';
    
    // Build new query string with parameter names and placeholders
    const queryParams = [];
    Object.entries(paramToPlaceholder).forEach(([paramName, placeholder]) => {
      queryParams.push(`${paramName}={${placeholder}}`);
    });
    
    // Join with & and add to URL
    const separator = url.href.includes('?') ? '&' : '?';
    const templateUrl = `${url.toString()}${separator}${queryParams.join('&')}`;
    
    return templateUrl;
  } catch (error) {
    console.error('[Trackier] Failed to build destination URL with macros:', error);
    // Fallback: just use placeholders
    const macroParams = Object.keys(subIdMapping)
      .map(subId => `{${subId}}`)
      .join('&');
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${macroParams}`;
  }
}

/**
 * Build tracking link with sub_id parameters
 * @param {string} baseTrackingLink - Trackier tracking link like "https://nebula.gotrackier.com/click?campaign_id=X&pub_id=2"
 * @param {Object} subIdValues - Values like {sub1: "abc", sub2: "xyz"}
 * @returns {string} - URL with sub_id params like "...&sub1=abc&sub2=xyz"
 */
function buildTrackingLinkWithSubIds(baseTrackingLink, subIdValues) {
  // URL-encode each sub_id value
  const subIdParams = Object.entries(subIdValues)
    .map(([subId, value]) => `${subId}=${encodeURIComponent(value)}`)
    .join('&');
  
  return `${baseTrackingLink}&${subIdParams}`;
}

/**
 * Auto-detect parameters from traced suffix and create mapping
 * @param {string} suffix - Traced suffix like "?gclid=abc&fbclid=xyz&custom=123"
 * @param {number} maxSubIds - Maximum number of sub_id fields (default 10)
 * @returns {Object} - sub_id_mapping like {sub1: "gclid", sub2: "fbclid", sub3: "custom"}
 */
function autoDetectSubIdMapping(suffix, maxSubIds = 10) {
  const params = parseSuffixParams(suffix);
  const paramNames = Object.keys(params);
  
  // Priority order for common tracking parameters
  const priorityParams = ['gclid', 'fbclid', 'msclkid', 'ttclid', 'clickid', 
                          'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  
  // Sort param names by priority
  const sortedParams = paramNames.sort((a, b) => {
    const aPriority = priorityParams.indexOf(a);
    const bPriority = priorityParams.indexOf(b);
    
    if (aPriority === -1 && bPriority === -1) return 0;
    if (aPriority === -1) return 1;
    if (bPriority === -1) return -1;
    return aPriority - bPriority;
  });
  
  // Map to sub_id fields
  const mapping = {};
  sortedParams.slice(0, maxSubIds).forEach((paramName, index) => {
    mapping[`sub${index + 1}`] = paramName;
  });
  
  return mapping;
}

/**
 * Trackier Webhook Endpoint
 * Receives click notifications from Trackier URL 1
 * 
 * Expected payload (customize based on Trackier's actual webhook format):
 * {
 *   "campaign_id": "abc123",
 *   "click_id": "xyz789", 
 *   "publisher_id": "123",
 *   "ip": "1.2.3.4",
 *   "country": "US",
 *   "device": "mobile",
 *   "os": "android",
 *   "browser": "chrome"
 * }
 */

// GET endpoint for testing/health check
router.get('/trackier-webhook', (req, res) => {
  const token = req.query.token;
  res.status(200).json({
    success: true,
    message: 'Trackier webhook endpoint is ready',
    method: 'This endpoint only accepts POST requests from Trackier',
    usage: 'Configure this URL as S2S Push URL in Trackier dashboard with ?token=<UUID>&click_id={click_id}&...',
    example: `${req.protocol}://${req.get('host')}/api/trackier-webhook?token=YOUR-OFFER-UUID&click_id={click_id}&campaign_id={campaign_id}&p1={p1}&p2={p2}`,
    token: token || 'not provided',
    status: 'active',
    timestamp: new Date().toISOString(),
  });
});

router.post('/trackier-webhook', async (req, res) => {
  const startTime = Date.now();
  const token = req.query.token;
  
  // ALWAYS return 200 immediately to Trackier (don't block their webhook)
  res.status(200).json({ 
    success: true, 
    message: 'Webhook received',
    token: token,
    timestamp: new Date().toISOString()
  });

  // Process asynchronously (don't block response)
  setImmediate(async () => {
    try {
      // Check feature flag
      if (!TRACKIER_ENABLED) {
        console.log('[Trackier] Webhook ignored - feature disabled via TRACKIER_ENABLED=false');
        return;
      }

      const payload = req.body;
      const queryParams = req.query;
      console.log('[Trackier Webhook] Received for token:', token);
      console.log('[Trackier Webhook] Query params:', JSON.stringify(queryParams, null, 2));
      console.log('[Trackier Webhook] Payload:', JSON.stringify(payload, null, 2));

      // Validate token parameter
      if (!token) {
        console.error('[Trackier Webhook] ERROR: Missing token in URL query parameter');
        console.error('[Trackier Webhook] URL should be: /api/trackier-webhook?token=<UUID>&click_id={click_id}...');
        return;
      }

      // Multi-route webhook resolution (backwards compatible with edge function)
      let trackierOffer = null;
      let activePair = null;
      let pairIndex = 1;

      // ROUTE 1: Token matches offer ID (LEGACY single-pair)
      console.log('[Trackier Webhook] Route 1: Checking if token is offer ID...');
      const { data: offerById, error: offerError } = await supabase
        .from('trackier_offers')
        .select('*')
        .eq('id', token)
        .eq('enabled', true)
        .single();
      
      if (offerById && !offerError) {
        trackierOffer = offerById;
        // Extract pair 1 from additional_pairs if exists
        if (offerById.additional_pairs && offerById.additional_pairs.length > 0) {
          activePair = offerById.additional_pairs[0];
          pairIndex = 1;
        }
        console.log(`[Trackier Webhook] ✅ Route 1: Found legacy offer ${offerById.offer_name}`);
      }

      // ROUTE 2: Token matches pair webhook_token (NEW multi-pair)
      if (!trackierOffer) {
        console.log('[Trackier Webhook] Route 2: Searching for pair webhook_token...');
        const { data: allOffers } = await supabase
          .from('trackier_offers')
          .select('*')
          .eq('enabled', true);
        
        // Search for matching webhook_token in additional_pairs
        for (const offer of allOffers || []) {
          if (offer.additional_pairs && Array.isArray(offer.additional_pairs)) {
            const pair = offer.additional_pairs.find(
              p => p.webhook_token === token && p.enabled !== false
            );
            if (pair) {
              trackierOffer = offer;
              activePair = pair;
              pairIndex = pair.pair_index;
              console.log(`[Trackier Webhook] ✅ Route 2: Found pair ${pairIndex} for offer ${offer.offer_name}`);
              break;
            }
          }
        }
      }

      if (!trackierOffer) {
        console.error('[Trackier Webhook] No active Trackier offer found for token:', token);
        return;
      }

      console.log(`[Trackier Webhook] Found offer: ${trackierOffer.offer_name} (Pair ${pairIndex})`);

      // Merge query parameters with payload body (query params take precedence for Trackier macros)
      const fullPayload = {
        ...payload,
        ...queryParams,
        _query_params: queryParams, // Keep original query params for debugging
        _body_params: payload // Keep original body for debugging
      };

      // Extract key parameters from query string (Trackier sends via URL)
      const clickId = queryParams.click_id || payload.click_id || null;
      const campaignId = queryParams.campaign_id || payload.campaign_id || null;

      // Log webhook to database
      const { data: webhookLog, error: logError } = await supabase
        .from('trackier_webhook_logs')
        .insert({
          trackier_offer_id: trackierOffer.id,
          campaign_id: campaignId,
          click_id: clickId,
          publisher_id: queryParams.publisher_id || payload.publisher_id || null,
          ip: queryParams.ip || payload.ip || null,
          country: queryParams.country || payload.country || null,
          device: queryParams.device || payload.device || null,
          os: queryParams.os || payload.os || null,
          browser: queryParams.browser || payload.browser || null,
          payload: fullPayload,
          pair_index: pairIndex,
          pair_webhook_token: token,
          processed: false,
          queued_for_update: false
        })
        .select()
        .single();

      if (logError) {
        console.error('[Trackier Webhook] Failed to log webhook:', logError);
        return;
      }

      // Check if we should trigger an update based on interval
      // Allow force_update=true to bypass interval check for testing
      const forceUpdate = queryParams.force_update === 'true' || payload.force_update === true;
      const now = new Date();
      const lastUpdate = trackierOffer.url2_last_updated_at 
        ? new Date(trackierOffer.url2_last_updated_at) 
        : new Date(0);
      const timeSinceLastUpdate = (now - lastUpdate) / 1000; // seconds

      const shouldUpdate = forceUpdate || timeSinceLastUpdate >= trackierOffer.update_interval_seconds;

      console.log(`[Trackier Webhook] Time since last update: ${timeSinceLastUpdate.toFixed(1)}s, Interval: ${trackierOffer.update_interval_seconds}s, Force: ${forceUpdate}, Should update: ${shouldUpdate}`);

      if (shouldUpdate) {
        // Mark as queued
        await supabase
          .from('trackier_webhook_logs')
          .update({ queued_for_update: true })
          .eq('id', webhookLog.id);

        // Trigger background update (non-blocking)
        processTrackierUpdate(trackierOffer, webhookLog.id).catch(err => {
          console.error('[Trackier Webhook] Background update failed:', err);
        });
      } else {
        console.log(`[Trackier Webhook] Skipping update (too soon, ${trackierOffer.update_interval_seconds - timeSinceLastUpdate}s remaining)`);
      }

      // Update webhook stats
      await supabase
        .from('trackier_offers')
        .update({
          last_webhook_at: now.toISOString(),
          webhook_count: (trackierOffer.webhook_count || 0) + 1
        })
        .eq('id', trackierOffer.id);

      const duration = Date.now() - startTime;
      console.log(`[Trackier Webhook] Processed in ${duration}ms`);

    } catch (error) {
      console.error('[Trackier Webhook] Error processing webhook:', error);
      // Don't throw - webhook already responded with 200
    }
  });
});

/**
 * Process Trackier Update (Background, Async)
 * 1. Trace URL to get fresh suffix
 * 2. Update Trackier URL 2 via API
 * 3. Log results
 */
async function processTrackierUpdate(trackierOffer, webhookLogId, pairConfig = null) {
  const startTime = Date.now();
  
  const pairInfo = pairConfig ? `pair ${pairConfig.pairIndex}` : 'legacy mode';
  console.log(`[Trackier Update] Starting for offer: ${trackierOffer.offer_name} (${pairInfo})`);

  let traced_suffix = null;
  let traced_url = null;
  let trace_duration_ms = 0;
  let traceResult = null; // holds edge function response for later error context
  let params_extracted = {};
  let params_filtered = {};
  let proxy_ip = null;
  let geo_country = null;
  let geo_city = null;
  let geo_region = null;

  try {
    // Step 1: Call Supabase edge function to get suffix with all offer settings applied
    console.log(`[Trackier Update] Calling edge function for: ${trackierOffer.offer_name}`);
    
    const traceStart = Date.now();
    
    // Call get-suffix edge function with offer_name
    const edgeFunctionUrl = `https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/get-suffix?offer_name=${encodeURIComponent(trackierOffer.offer_name)}`;
    
    try {
      const traceResponse = await axios.get(edgeFunctionUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY || ''}`,
        },
        timeout: 30000 // 30 second timeout
      });

      traceResult = traceResponse.data;
      trace_duration_ms = Date.now() - traceStart;

      console.log(`[Trackier Update] Edge function completed in ${trace_duration_ms}ms`);
      console.log(`[Trackier Update] Edge function response:`, JSON.stringify(traceResult, null, 2).substring(0, 1000));

      // Extract data from edge function response
      traced_url = traceResult.final_url || traceResult.finalUrl;
      
      // If trace was unsuccessful but we have final_url, still use it
      if (!traced_url && traceResult.success === false) {
        throw new Error(`Edge function trace failed: ${traceResult.message || traceResult.error || 'Unknown error'}`);
      }
    } catch (fetchError) {
      if (fetchError.code === 'ECONNABORTED') {
        throw new Error('Edge function timed out after 30 seconds');
      }
      throw new Error(`Edge function failed: ${fetchError.message}`);
    }
    
    if (!traced_url) {
      throw new Error('Edge function failed: No final URL in response');
    }
    
    console.log(`[Trackier Update] Final URL: ${traced_url}`);
    
    // Extract suffix from final URL
    traced_suffix = extractSuffix(traced_url, trackierOffer.suffix_pattern);
    console.log(`[Trackier Update] Extracted suffix: ${traced_suffix.substring(0, 100)}...`);

    // Store extracted params if available
    if (traceResult && traceResult.extractedParams) {
      params_extracted = traceResult.extractedParams;
      params_filtered = traceResult.filteredParams || params_extracted;
    } else {
      // Parse from suffix
      params_extracted = Object.fromEntries(new URLSearchParams(traced_suffix));
      params_filtered = params_extracted;
    }

    // Store proxy/geo info
    proxy_ip = (traceResult && traceResult.proxyIp) || null;
    geo_country = (traceResult && traceResult.geoLocation && traceResult.geoLocation.country) || null;
    geo_city = (traceResult && traceResult.geoLocation && traceResult.geoLocation.city) || null;
    geo_region = (traceResult && traceResult.geoLocation && traceResult.geoLocation.region) || null;

    // Step 2: Parse suffix into parameters
    const suffixParams = parseSuffixParams(traced_suffix);
    console.log(`[Trackier Update] Parsed suffix params:`, suffixParams);

    // Step 3: Map parameters to sub_id values (using p1-p10)
    const subIdMapping = trackierOffer.sub_id_mapping || {
      p1: 'gclid',
      p2: 'fbclid',
      p3: 'msclkid',
      p4: 'ttclid',
      p5: 'clickid',
      p6: 'utm_source',
      p7: 'utm_medium',
      p8: 'utm_campaign',
      p9: 'custom1',
      p10: 'custom2'
    };

    const subIdValues = mapParamsToSubIds(suffixParams, subIdMapping);
    console.log(`[Trackier Update] Mapped to sub_id values:`, subIdValues);

    // Step 4: Update database with sub_id values (pair-specific or legacy)
    if (pairConfig && pairConfig.isAdditionalPair) {
      // Update specific pair in additional_pairs array
      console.log(`[Trackier Update] Updating pair ${pairConfig.pairIndex} in additional_pairs array`);
      const { error: pairUpdateError } = await supabase.rpc('update_trackier_pair_stats', {
        p_offer_id: trackierOffer.id,
        p_pair_idx: pairConfig.pairIndex - 1, // Array is 0-indexed
        p_new_sub_id_values: subIdValues,
        p_trace_duration: trace_duration_ms,
        p_update_duration: Date.now() - startTime
      });
      
      if (pairUpdateError) {
        console.error('[Trackier Update] Failed to update pair stats:', pairUpdateError);
      }
    } else {
      // Update legacy top-level columns
      console.log('[Trackier Update] Updating legacy offer columns');
      await supabase
        .from('trackier_offers')
        .update({
          sub_id_values: subIdValues,
          url2_last_suffix: traced_suffix,
          url2_last_updated_at: new Date().toISOString(),
          update_count: (trackierOffer.update_count || 0) + 1,
          last_update_duration_ms: Date.now() - startTime,
          total_update_time_ms: (trackierOffer.total_update_time_ms || 0) + (Date.now() - startTime),
          updated_at: new Date().toISOString()
        })
        .eq('id', trackierOffer.id);
      
      // Also update pair 1 in additional_pairs if it exists
      if (trackierOffer.additional_pairs && trackierOffer.additional_pairs.length > 0) {
        await supabase.rpc('update_trackier_pair_stats', {
          p_offer_id: trackierOffer.id,
          p_pair_idx: 0,
          p_new_sub_id_values: subIdValues,
          p_trace_duration: trace_duration_ms,
          p_update_duration: Date.now() - startTime
        });
      }
    }

    console.log(`[Trackier Update] ✅ sub_id values stored in database (${pairInfo})`);

    // Step 5: Update Campaign with subIdOverride (pair-specific or legacy)
    const targetCampaignId = pairConfig?.url2_campaign_id_real || trackierOffer.url2_campaign_id_real;
    
    try {
      console.log(`[Trackier Update] Calling Trackier API to update Campaign ${targetCampaignId} with subIdOverride (${pairInfo})`);
      
      // Call Trackier API with subIdOverride
      await updateTrackierCampaignSubIds(trackierOffer, targetCampaignId, subIdValues);
      
      console.log(`[Trackier Update] ✅ Campaign ${targetCampaignId} updated with subIdOverride`);
    } catch (apiError) {
      console.error(`[Trackier Update] ⚠️ Failed to update Campaign ${targetCampaignId} subIdOverride:`, apiError);
      // Continue anyway - parameters are stored in sub_id_values
    }

    // Log successful trace
    await supabase
      .from('trackier_trace_history')
      .insert({
        trackier_offer_id: trackierOffer.id,
        webhook_log_id: webhookLogId,
        traced_url: traced_url,
        traced_suffix: traced_suffix,
        params_extracted: params_extracted,
        params_filtered: params_filtered,
        trace_duration_ms: trace_duration_ms,
        success: true,
        proxy_ip: proxy_ip,
        geo_country: geo_country,
        geo_city: geo_city,
        geo_region: geo_region
      });

    // Mark webhook as processed
    if (webhookLogId) {
      await supabase
        .from('trackier_webhook_logs')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          trace_duration_ms: trace_duration_ms
        })
        .eq('id', webhookLogId);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[Trackier Update] ✅ Completed successfully in ${totalDuration}ms (sub_id method - no cache delay)`);

    return { success: true, duration_ms: totalDuration, sub_id_values: subIdValues };

  } catch (error) {
    console.error(`[Trackier Update] ❌ Failed:`, error);

    // Log failed trace
    await supabase
      .from('trackier_trace_history')
      .insert({
        trackier_offer_id: trackierOffer.id,
        webhook_log_id: webhookLogId,
        traced_url: trackierOffer.final_url,
        success: false,
        error: error.message,
        trace_duration_ms: trace_duration_ms
      });

    // Mark webhook as processed with error
    if (webhookLogId) {
      await supabase
        .from('trackier_webhook_logs')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          error: error.message
        })
        .eq('id', webhookLogId);
    }

    throw error;
  }
}

/**
 * Update Trackier Campaign via API
 */
async function updateTrackierCampaign(trackierOffer, campaignId, newUrl) {
  const apiBaseUrl = trackierOffer.api_base_url || 'https://api.trackier.com';
  const url = `${apiBaseUrl}/v2/campaigns/${campaignId}`;
  
  console.log(`[Trackier API] Updating campaign ${campaignId}`);

  const requestBody = {
    url: newUrl
  };

  const apiStart = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': trackierOffer.api_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const duration_ms = Date.now() - apiStart;
    const responseText = await response.text();
    let responseBody = null;

    try {
      responseBody = JSON.parse(responseText);
    } catch (e) {
      responseBody = { raw: responseText };
    }

    // Log API call
    await supabase
      .from('trackier_api_calls')
      .insert({
        trackier_offer_id: trackierOffer.id,
        method: 'POST',
        endpoint: url,
        request_body: requestBody,
        status_code: response.status,
        response_body: responseBody,
        success: response.ok,
        error: response.ok ? null : `HTTP ${response.status}`,
        duration_ms: duration_ms
      });

    if (!response.ok) {
      throw new Error(`Trackier API error: ${response.status} - ${responseText}`);
    }

    console.log(`[Trackier API] ✅ Success (${duration_ms}ms):`, responseBody);
    return responseBody;

  } catch (error) {
    // Log failed API call
    await supabase
      .from('trackier_api_calls')
      .insert({
        trackier_offer_id: trackierOffer.id,
        method: 'POST',
        endpoint: url,
        request_body: requestBody,
        success: false,
        error: error.message,
        duration_ms: Date.now() - apiStart
      });

    throw error;
  }
}

/**
 * Update Trackier Campaign via sub_id override
 * Uses Trackier's subIdOverride feature to set p1-p10, erid, app_name, app_id, cr_name
 */
async function updateTrackierCampaignSubIds(trackierOffer, campaignId, subIdValues) {
  const apiBaseUrl = trackierOffer.api_base_url || 'https://api.trackier.com';
  const url = `${apiBaseUrl}/v2/campaigns/${campaignId}`;
  
  console.log(`[Trackier API] Updating campaign ${campaignId} with subIdOverride (p1-p10 + app fields)`);

  // Build subIdOverride object with all 14 Trackier fields (p1-p10, erid, app_name, app_id, cr_name)
  const subIdOverride = {};
  
  // Add p1-p10
  for (let i = 1; i <= 10; i++) {
    const key = `p${i}`;
    if (subIdValues[key]) {
      subIdOverride[key] = subIdValues[key];
    }
  }
  
  // Add app fields
  const appFields = ['erid', 'app_name', 'app_id', 'cr_name'];
  appFields.forEach(field => {
    if (subIdValues[field]) {
      subIdOverride[field] = subIdValues[field];
    }
  });
  
  console.log(`[Trackier API] subIdOverride:`, subIdOverride);

  // Build request body with subIdOverride
  const requestBody = {
    subIdOverride: subIdOverride
  };

  const apiStart = Date.now();

  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'X-Api-Key': trackierOffer.api_key,
        'Content-Type': 'application/json'
      }
    });

    const duration_ms = Date.now() - apiStart;
    const responseBody = response.data;

    // Log API call
    await supabase
      .from('trackier_api_calls')
      .insert({
        trackier_offer_id: trackierOffer.id,
        method: 'POST',
        endpoint: url,
        request_body: requestBody,
        status_code: response.status,
        response_body: responseBody,
        success: true,
        error: null,
        duration_ms: duration_ms
      });

    console.log(`[Trackier API] ✅ Success (${duration_ms}ms):`, responseBody);
    return responseBody;

  } catch (error) {
    const duration_ms = Date.now() - apiStart;
    const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    
    // Log failed API call
    await supabase
      .from('trackier_api_calls')
      .insert({
        trackier_offer_id: trackierOffer.id,
        method: 'POST',
        endpoint: url,
        request_body: requestBody,
        status_code: error.response?.status,
        response_body: error.response?.data,
        success: false,
        error: errorMessage,
        duration_ms: duration_ms
      });

    throw new Error(`Trackier API error: ${error.response?.status || 'Network Error'} - ${errorMessage}`);
  }
}

/**
 * Extract suffix from final URL using pattern
 */
function extractSuffix(finalUrl, pattern) {
  try {
    const url = new URL(finalUrl);
    
    // Extract all parameter names from pattern like "?aw_affid={aw_affid}&awc={awc}..."
    const paramMatches = [...pattern.matchAll(/[?&](\w+)=\{[^}]+\}/g)];
    
    if (paramMatches && paramMatches.length > 0) {
      // Extract all matched params from URL
      const suffixParts = [];
      paramMatches.forEach(match => {
        const paramName = match[1];
        const paramValue = url.searchParams.get(paramName);
        if (paramValue) {
          suffixParts.push(`${paramName}=${encodeURIComponent(paramValue)}`);
        }
      });
      
      if (suffixParts.length > 0) {
        return suffixParts.join('&');
      }
    }
    
    // Otherwise return all query parameters as suffix
    return url.search.substring(1); // Remove leading '?'
    
  } catch (error) {
    console.error('[Trackier] Failed to extract suffix:', error);
    return '';
  }
}

/**
 * Apply macro mapping to destination URL
 * Maps traced suffix parameters to Trackier macros like {clickid}, {gclid}, etc.
 */
function applyMacroMapping(destinationUrl, extractedParams, trackierOffer) {
  try {
    const url = new URL(destinationUrl);
    
    // Default macro mapping if not configured
    const macroMapping = trackierOffer.macro_mapping || {
      'clickid': '{clickid}',
      'gclid': '{gclid}',
      'fbclid': '{fbclid}',
      'ttclid': '{ttclid}',
      'campaign': '{campaign_id}',
      'source': '{source}',
      'publisher': '{publisher_id}'
    };
    
    // Apply macro mapping to URL parameters
    Object.entries(macroMapping).forEach(([param, macro]) => {
      if (extractedParams[param]) {
        // Replace the actual value with Trackier macro
        url.searchParams.set(param, macro);
      }
    });
    
    // Add Trackier macros for tracking
    url.searchParams.set('trackier_clickid', '{clickid}');
    url.searchParams.set('trackier_campaign', '{campaign_id}');
    url.searchParams.set('trackier_source', '{source}');
    
    return url.toString();
  } catch (error) {
    console.error('[Trackier] Failed to apply macro mapping:', error);
    return destinationUrl; // Fallback to original
  }
}

/**
 * Build destination URL with new suffix
 */
function buildDestinationUrl(baseUrl, suffix, pattern) {
  try {
    const url = new URL(baseUrl);
    
    // Clear existing params
    url.search = '';
    
    // Add new suffix params
    if (suffix) {
      const params = new URLSearchParams(suffix);
      params.forEach((value, key) => {
        url.searchParams.set(key, value);
      });
    }
    
    return url.toString();
    
  } catch (error) {
    console.error('[Trackier] Failed to build destination URL:', error);
    // Fallback: append suffix to base URL
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${suffix}`;
  }
}

/**
 * Health check endpoint
 */
router.get('/trackier-status', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.json({
        enabled: false,
        message: 'Trackier feature is disabled (set TRACKIER_ENABLED=true to enable)'
      });
    }

    const { data: offers, error } = await supabase
      .from('trackier_offers')
      .select('id, offer_name, enabled, webhook_count, update_count, url2_last_updated_at, last_webhook_at')
      .eq('enabled', true)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Get recent stats
    const { data: recentWebhooks } = await supabase
      .from('trackier_webhook_logs')
      .select('id')
      .gte('created_at', new Date(Date.now() - 3600000).toISOString()); // Last hour

    const { data: recentTraces } = await supabase
      .from('trackier_trace_history')
      .select('id, success')
      .gte('created_at', new Date(Date.now() - 3600000).toISOString());

    const successCount = recentTraces?.filter(t => t.success).length || 0;
    const totalCount = recentTraces?.length || 0;

    res.json({
      enabled: true,
      active_offers: offers?.length || 0,
      offers: offers || [],
      stats_last_hour: {
        webhooks: recentWebhooks?.length || 0,
        traces: totalCount,
        success_rate: totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) + '%' : 'N/A'
      }
    });

  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      enabled: TRACKIER_ENABLED
    });
  }
});

/**
 * EMERGENCY TOGGLE - Disable/Enable Trackier processing without restart
 * POST /api/trackier-emergency-toggle?enabled=false
 */
router.post('/trackier-emergency-toggle', (req, res) => {
  const newState = req.query.enabled === 'true';
  const oldState = TRACKIER_ENABLED;
  
  TRACKIER_ENABLED = newState;
  
  console.log(`[EMERGENCY] Trackier processing ${oldState ? 'DISABLED' : 'ENABLED'} → ${newState ? 'ENABLED' : 'DISABLED'}`);
  
  res.json({
    success: true,
    previous_state: oldState,
    current_state: TRACKIER_ENABLED,
    message: `Trackier processing is now ${TRACKIER_ENABLED ? 'ENABLED' : 'DISABLED'}`,
    note: 'This is a runtime toggle. Set TRACKIER_ENABLED env var for permanent change.',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get Tracking Link (URL 2) with sub_id parameters
 * Returns URL 2 with current traced suffix values mapped to sub_id params
 * 
 * Usage: GET /api/trackier-get-url2/:offerId
 * Returns: { url2: "https://nebula.gotrackier.com/click?campaign_id=X&pub_id=2&sub1=value&sub2=value" }
 */
router.get('/trackier-get-url2/:offerId', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { offerId } = req.params;

    // Get offer from database
    const { data: offer, error } = await supabase
      .from('trackier_offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (error || !offer) {
      return res.status(404).json({ error: 'Trackier offer not found' });
    }

    if (!offer.enabled) {
      return res.status(400).json({ error: 'Trackier offer is disabled' });
    }

    // Build base URL 2 tracking link
    const baseUrl2 = `https://nebula.gotrackier.com/click?campaign_id=${offer.url2_campaign_id}&pub_id=2`;

    // Get sub_id_values from database (set by webhook after tracing)
    const subIdValues = offer.sub_id_values || {};

    // Check if we have traced values
    if (Object.keys(subIdValues).length === 0) {
      // No traced values yet - return base URL (will use whatever Trackier has)
      console.log(`[Trackier Get URL2] No sub_id values yet for offer ${offerId}, returning base URL`);
      return res.json({
        url2: baseUrl2,
        note: 'No traced values yet. URL 1 webhook will populate sub_id values.',
        sub_id_values: {},
        last_updated: offer.url2_last_updated_at
      });
    }

    // Build URL 2 with sub_id parameters
    const url2WithSubIds = buildTrackingLinkWithSubIds(baseUrl2, subIdValues);

    console.log(`[Trackier Get URL2] Generated URL 2 with sub_id params for offer ${offerId}`);

    res.json({
      url2: url2WithSubIds,
      sub_id_values: subIdValues,
      sub_id_mapping: offer.sub_id_mapping,
      last_updated: offer.url2_last_updated_at,
      last_suffix: offer.url2_last_suffix,
      note: 'URL includes sub_id parameters for real-time macro resolution (no cache delay)'
    });

  } catch (error) {
    console.error('[Trackier Get URL2] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual trigger endpoint (for testing)
 */
router.post('/trackier-trigger/:offerId', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { offerId } = req.params;

    const { data: trackierOffer, error } = await supabase
      .from('trackier_offers')
      .select('*')
      .eq('id', offerId)
      .single();

    if (error || !trackierOffer) {
      return res.status(404).json({ error: 'Trackier offer not found' });
    }

    // Trigger update
    console.log(`[Trackier Manual] Triggering update for: ${trackierOffer.offer_name}`);
    
    const result = await processTrackierUpdate(trackierOffer, null);

    res.json({
      success: true,
      message: 'Update triggered successfully',
      result: result
    });

  } catch (error) {
    console.error('[Trackier Manual] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Auto-create Trackier campaigns (URL 1 and URL 2)
 */
router.post('/trackier-create-campaigns', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { 
      apiKey, 
      apiBaseUrl = 'https://api.trackier.com/v2',
      advertiserId,
      offerName,
      finalUrl,
      webhookUrl,
      publisherId = '2', // Default publisher ID
      subIdMapping = null, // Optional: custom sub_id mapping
      campaign_count = 1 // NEW: Number of campaign pairs to create
    } = req.body;

    // Validate required fields
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    if (!offerName) {
      return res.status(400).json({ error: 'Offer name is required' });
    }
    if (!finalUrl) {
      return res.status(400).json({ error: 'Final URL is required' });
    }
    if (!advertiserId) {
      return res.status(400).json({ error: 'Advertiser ID is required' });
    }

    // Validate campaign_count
    const campaignCount = parseInt(campaign_count) || 1;
    if (campaignCount < 1 || campaignCount > 20) {
      return res.status(400).json({ error: 'campaign_count must be between 1 and 20' });
    }

    console.log(`[Trackier Create] Creating ${campaignCount} campaign pair(s) for: ${offerName}`);

    // Generate sub_id_mapping (use provided or default)
    const finalSubIdMapping = subIdMapping || {
      p1: 'gclid',
      p2: 'fbclid',
      p3: 'msclkid',
      p4: 'ttclid',
      p5: 'clickid',
      p6: 'utm_source',
      p7: 'utm_medium',
      p8: 'utm_campaign',
      p9: 'custom1',
      p10: 'custom2'
    };

    // Build destination URL with sub_id macros
    const destinationUrl = buildDestinationUrlWithMacros(finalUrl, finalSubIdMapping);
    console.log(`[Trackier Create] Destination URL with macros: ${destinationUrl}`);

    // Array to store all created pairs
    const allPairs = [];

    // Loop to create N campaign pairs
    for (let i = 0; i < campaignCount; i++) {
      const pairIndex = i + 1;
      const pairName = `Pair ${pairIndex}`;
      
      // Generate unique webhook token for this pair
      const { randomUUID } = require('crypto');
      const pairWebhookToken = randomUUID();
      
      console.log(`[Trackier Create] Creating ${pairName} (${i + 1}/${campaignCount})...`);

      // Step 1: Create URL 2 (Final Campaign) first with sub_id macros
      console.log(`[Trackier Create] Creating URL 2 for ${pairName}...`);
      
      const url2Response = await fetch(`${apiBaseUrl}/v2/campaigns`, {
        method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
        body: JSON.stringify({
          title: `${offerName} - ${pairName} - Final (URL 2)`,
          url: destinationUrl,
          status: 'active',
          advertiserId: parseInt(advertiserId),
          currency: 'USD',
          device: 'all',
          convTracking: 'iframe_https',
          convTrackingDomain: 'nebula.gotrackier.com',
          redirectType: '200_hrf', // 200 with Hide Referrer
          payouts: [{
            currency: 'USD',
            revenue: 0,
            payout: 0,
            geo: ['ALL']
          }],
          description: `Auto-created final campaign for ${offerName} ${pairName}. Uses sub_id macros for real-time parameter passthrough.`
        })
      });

      if (!url2Response.ok) {
        const errorText = await url2Response.text();
        throw new Error(`Failed to create URL 2 campaign for ${pairName}: ${url2Response.status} - ${errorText}`);
      }

      const url2Data = await url2Response.json();
      const url2CampaignId = url2Data.campaign?.id || url2Data.id;
      
      // Fetch campaign details to get display ID
      const url2DetailsResponse = await fetch(`${apiBaseUrl}/v2/campaigns/${url2CampaignId}`, {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      const url2Details = url2DetailsResponse.ok ? await url2DetailsResponse.json() : {};
      const url2DisplayId = url2Details.campaign?.campaignNo || url2CampaignId;
      
      const url2TrackingLink = `https://nebula.gotrackier.com/click?campaign_id=${url2CampaignId}&pub_id=2`;

      console.log(`[Trackier Create] ✓ URL 2 created for ${pairName}: ${url2CampaignId} (Display: ${url2DisplayId})`);

      // Step 2: Create URL 1 (Passthrough Campaign)
      console.log(`[Trackier Create] Creating URL 1 for ${pairName}...`);

      const url1Response = await fetch(`${apiBaseUrl}/v2/campaigns`, {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `${offerName} - ${pairName} - Passthrough (URL 1)`,
          url: destinationUrl,
          status: 'active',
          advertiserId: parseInt(advertiserId),
          currency: 'USD',
          device: 'all',
          convTracking: 'postback',
          convTrackingDomain: 'nebula.gotrackier.com',
          redirectType: '200_hrf', // 200 with Hide Referrer
          payouts: [{
            currency: 'USD',
            revenue: 0,
            payout: 0,
            geo: ['ALL']
          }],
          description: `Auto-created passthrough campaign for ${offerName} ${pairName}. Webhook token: ${pairWebhookToken}`
        })
      });

      if (!url1Response.ok) {
        const errorText = await url1Response.text();
        throw new Error(`Failed to create URL 1 campaign for ${pairName}: ${url1Response.status} - ${errorText}`);
      }

      const url1Data = await url1Response.json();
      const url1CampaignId = url1Data.campaign?.id || url1Data.id;
      
      // Fetch campaign details to get display ID
      const url1DetailsResponse = await fetch(`${apiBaseUrl}/v2/campaigns/${url1CampaignId}`, {
        method: 'GET',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      const url1Details = url1DetailsResponse.ok ? await url1DetailsResponse.json() : {};
      const url1DisplayId = url1Details.campaign?.campaignNo || url1CampaignId;
      
      const url1TrackingLink = `https://nebula.gotrackier.com/click?campaign_id=${url1CampaignId}&pub_id=${publisherId}`;

      console.log(`[Trackier Create] ✓ URL 1 created for ${pairName}: ${url1CampaignId} (Display: ${url1DisplayId})`);

      // Step 3: Build pair-specific webhook URL with unique token
      const pairWebhookUrl = `https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/trackier-webhook?token=${pairWebhookToken}&campaign_id={campaign_id}&click_id={click_id}`;

      // Step 4: Generate Google Ads tracking template for this pair
      const googleAdsTemplate = generateGoogleAdsTemplate(url1CampaignId, url2CampaignId, destinationUrl, publisherId);

      // Store pair data
      const pairData = {
        pair_index: pairIndex,
        pair_name: pairName,
        webhook_token: pairWebhookToken,
        url1_campaign_id: url1DisplayId,
        url1_campaign_id_real: url1CampaignId,
        url1_campaign_name: `${offerName} - ${pairName} - Passthrough (URL 1)`,
        url1_tracking_url: url1TrackingLink,
        url2_campaign_id: url2DisplayId,
        url2_campaign_id_real: url2CampaignId,
        url2_campaign_name: `${offerName} - ${pairName} - Final (URL 2)`,
        url2_tracking_url: url2TrackingLink,
        webhook_url: pairWebhookUrl,
        google_ads_template: googleAdsTemplate,
        sub_id_values: {},
        enabled: true,
        webhook_count: 0,
        update_count: 0,
        last_webhook_at: null,
        last_update_duration_ms: null,
        created_at: new Date().toISOString()
      };

      allPairs.push(pairData);

      console.log(`[Trackier Create] ✅ ${pairName} complete! Webhook token: ${pairWebhookToken}`);

      // Add delay between pairs to avoid rate limiting (except for last pair)
      if (i < campaignCount - 1) {
        console.log('[Trackier Create] Waiting 500ms before next pair...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[Trackier Create] ✅ All ${campaignCount} pairs created successfully!`);

    // Return campaign details
    res.json({
      success: true,
      message: `Created ${campaignCount} campaign pair(s) successfully with sub_id macros for real-time updates`,
      campaign_count: campaignCount,
      pairs: allPairs,
      primary_pair: allPairs[0], // First pair for backwards compatibility
      // Legacy fields for backwards compatibility (from first pair)
      url1_campaign_id: allPairs[0].url1_campaign_id,
      url1_campaign_id_real: allPairs[0].url1_campaign_id_real,
      url2_campaign_id: allPairs[0].url2_campaign_id,
      url2_campaign_id_real: allPairs[0].url2_campaign_id_real,
      url1_tracking_url: allPairs[0].url1_tracking_url,
      url2_tracking_url: allPairs[0].url2_tracking_url,
      url2_destination_url: destinationUrl,
      webhook_url: allPairs[0].webhook_url,
      sub_id_mapping: finalSubIdMapping,
      destination_url: destinationUrl,
      googleAdsTemplate: allPairs[0].google_ads_template,
      campaigns: {
        url1: {
          id: allPairs[0].url1_campaign_id_real,
          name: allPairs[0].url1_campaign_name,
          tracking_link: allPairs[0].url1_tracking_url,
          destination: destinationUrl,
          purpose: 'Fires webhook, uses sub_id macros for real-time parameter resolution'
        },
        url2: {
          id: allPairs[0].url2_campaign_id_real,
          name: allPairs[0].url2_campaign_name,
          tracking_link: allPairs[0].url2_tracking_url,
          destination: destinationUrl,
          purpose: 'Receives traced suffix values via sub_id parameters, resolves macros in real-time'
        }
      },
      note: `Created ${campaignCount} campaign pair(s). Each pair has unique webhook token for independent routing.`,
      how_it_works: {
        step1: 'User clicks URL 1, webhook fires with unique token',
        step2: 'Webhook routes to specific pair based on token',
        step3: 'Backend traces suffix and extracts parameters (gclid, fbclid, etc.)',
        step4: 'Parameters mapped to sub_id values for that specific pair',
        step5: 'Only that pair\'s URL 2 gets updated via Trackier API',
        result: 'Each pair operates independently with fresh traced parameters'
      },
      setup: {
        nextStep: `Configure S2S Push URL for each URL 1 campaign in Trackier dashboard`,
        s2sInstructions: '⚠️ IMPORTANT: For each pair, go to Trackier dashboard → Edit URL 1 campaign → Server Side Clicks section → Set S2S Push URL to that pair\'s webhook_url',
        updateInterval: 'Real-time via sub_id parameters (no delay)',
        multi_pair_note: `Each pair has unique webhook URL - configure separately for independent operation`
      }
    });

  } catch (error) {
    console.error('[Trackier Create] Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to create Trackier campaigns. Check API credentials and try again.'
    });
  }
});

/**
 * Validate Trackier credentials and fetch advertisers
 */
router.post('/trackier-validate-credentials', async (req, res) => {
  try {
    if (!TRACKIER_ENABLED) {
      return res.status(403).json({ error: 'Trackier feature is disabled' });
    }

    const { apiKey, apiBaseUrl = 'https://api.trackier.com' } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    console.log('[Trackier Validate] Validating credentials and fetching advertisers...');

    // Fetch advertisers to validate credentials
    const response = await fetch(`${apiBaseUrl}/v2/advertisers?limit=50`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Validation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    res.json({
      success: true,
      valid: true,
      advertisers: data.advertisers || [],
      totalCount: data.pagination?.totalCount || 0,
      message: `Found ${data.advertisers?.length || 0} advertisers`
    });

  } catch (error) {
    console.error('[Trackier Validate] Error:', error);
    res.status(500).json({ 
      error: error.message,
      valid: false
    });
  }
});

/**
 * Generate Google Ads tracking template from Trackier URL
 * Format: URL1 with force_transparent wrapping URL2
 */
function generateGoogleAdsTemplate(url1CampaignId, url2CampaignId, finalUrl, publisherId = '2') {
  try {
    // Build URL 2 (final destination) with force_transparency, pub_id, and actual final URL
    const url2Base = `https://nebula.gotrackier.com/click?campaign_id=${url2CampaignId}&pub_id=${publisherId}&force_transparency=true&url=${encodeURIComponent(finalUrl)}`;
    const url2Encoded = encodeURIComponent(url2Base);
    
    // Build URL 1 (passthrough) wrapping URL 2 with pub_id
    const template = `https://nebula.gotrackier.com/click?campaign_id=${url1CampaignId}&pub_id=${publisherId}&force_transparent=true&url=${url2Encoded}`;
    
    return template;
  } catch (error) {
    console.error('[Trackier] Failed to generate template:', error);
    return `https://nebula.gotrackier.com/click?campaign_id=${url1CampaignId}&pub_id=${publisherId}`;
  }
}

/**
 * Validate Trackier API credentials
 */
router.post('/trackier-validate-credentials', async (req, res) => {
  try {
    const { apiKey, apiBaseUrl = 'https://api.trackier.com' } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Test API key by fetching account info or campaigns list
    const response = await fetch(`${apiBaseUrl}/v2/campaigns?limit=1`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return res.json({
        valid: false,
        error: `Invalid API key or insufficient permissions (${response.status})`
      });
    }

    const data = await response.json();
    
    res.json({
      valid: true,
      message: 'API credentials validated successfully',
      accountInfo: {
        totalCampaigns: data.total || data.data?.length || 0,
        apiVersion: 'v2'
      }
    });

  } catch (error) {
    res.json({
      valid: false,
      error: error.message
    });
  }
});

/**
 * Trackier Redirect Resolver
 * Handles redirects from URL 1 to URL 2 and resolves macros
 */
router.get('/trackier-redirect', async (req, res) => {
  try {
    const { redirect_url, clickid, gclid, fbclid, campaign_id, source, publisher_id } = req.query;

    if (!redirect_url) {
      return res.status(400).json({ error: 'redirect_url parameter is required' });
    }

    // Decode the redirect URL
    const decodedUrl = decodeURIComponent(redirect_url);
    const finalUrl = new URL(decodedUrl);

    // Resolve Trackier macros with actual values from query params
    const macroReplacements = {
      '{clickid}': clickid || '',
      '{gclid}': gclid || '',
      '{fbclid}': fbclid || '',
      '{campaign_id}': campaign_id || '',
      '{source}': source || '',
      '{publisher_id}': publisher_id || ''
    };

    // Replace macros in URL parameters
    finalUrl.searchParams.forEach((value, key) => {
      let resolvedValue = value;
      Object.entries(macroReplacements).forEach(([macro, replacement]) => {
        if (resolvedValue.includes(macro)) {
          resolvedValue = resolvedValue.replace(new RegExp(macro.replace(/[{}]/g, '\\$&'), 'g'), replacement);
        }
      });
      if (resolvedValue !== value) {
        finalUrl.searchParams.set(key, resolvedValue);
      }
    });

    console.log(`[Trackier Redirect] Resolving: ${finalUrl.toString().substring(0, 100)}...`);

    // Redirect to final resolved URL
    res.redirect(302, finalUrl.toString());

  } catch (error) {
    console.error('[Trackier Redirect] Error:', error);
    res.status(500).json({ error: 'Failed to resolve redirect', message: error.message });
  }
});

/**
 * Background Trace Endpoint (called by Edge Function)
 * POST /api/trackier-trace-background?offer_id=UUID&webhook_log_id=UUID
 */
router.post('/trackier-trace-background', async (req, res) => {
  // Return 200 immediately - process in background
  res.status(200).json({ status: 'processing' });

  setImmediate(async () => {
    try {
      const { offer_id, webhook_log_id } = req.query;

      if (!offer_id) {
        console.error('[Trackier Background] Missing offer_id');
        return;
      }

      console.log(`[Trackier Background] Triggered for offer: ${offer_id}, webhook: ${webhook_log_id}`);

      // Fetch the offer
      const { data: trackierOffer, error: findError } = await supabase
        .from('trackier_offers')
        .select('*')
        .eq('id', offer_id)
        .eq('enabled', true)
        .single();

      if (findError || !trackierOffer) {
        console.error('[Trackier Background] Offer not found:', findError);
        return;
      }

      console.log(`[Trackier Background] Processing: ${trackierOffer.offer_name}`);

      // Trigger the update
      await processTrackierUpdate(trackierOffer, webhook_log_id);

    } catch (error) {
      console.error('[Trackier Background] Error:', error);
    }
  });
});

module.exports = router;
