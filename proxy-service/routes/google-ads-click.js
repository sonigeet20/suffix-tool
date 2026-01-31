// Google Ads Click Handler Route
// Handles /click endpoint for instant redirects with geo-matched suffixes
// This is STANDALONE - imported only if enabled in server.js

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase client (will use env vars from main server)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Bot detection library
let isbot;
try {
  isbot = require('isbot').isbot;
} catch (err) {
  console.warn('[google-ads-click] isbot library not available, using fallback patterns');
  isbot = null;
}

// GeoIP Service client
const GEOIP_SERVICE_URL = process.env.GEOIP_SERVICE_URL || 'http://localhost:3000';

const GEO_PREFILL_COOLDOWN_MS = 10 * 60 * 1000;
const lastPrefillByOffer = new Map();

/**
 * Check if user agent is a Google bot (should get immediate redirect)
 */
function isGoogleBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return ua.includes('googlebot') || 
         ua.includes('adsbot-google') || 
         ua.includes('google-adwords-instant') ||
         ua.includes('google page speed insights');
}

function normalizeCountryCode(code) {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : null;
}

async function queryGeoIPService(clientIp) {
  try {
    const response = await axios.get(`${GEOIP_SERVICE_URL}/geoip/${clientIp}`, {
      timeout: 2000,
      validateStatus: () => true // Accept all status codes
    });
    
    if (response.status === 200) {
      return response.data;
    }
    
    return null;
  } catch (error) {
    console.warn(`[google-ads-click] GeoIP service error for ${clientIp}:`, error.message);
    return null;
  }
}

/**
 * Main click handler - optimized for <50ms response time
 * 
 * IMPORTANT: Handles both GET and POST requests
 * - GET: Standard URL clicks from Google Ads
 * - POST: Google's parallel tracking using navigator.sendBeacon()
 *   When Google Ads uses parallel tracking, it fires tracking URLs using sendBeacon,
 *   which sends POST requests instead of GET. We must support both methods.
 * 
 * Query params:
 * - offer_name (required): Offer identifier
 * - url (required): {lpurl} from Google Ads
 * - force_transparent (optional): If true from Google Ads, ALWAYS redirect (even if blocked)
 * - gclid, etc: Any Google Ads tracking params (ignored, just passed through)
 * 
 * Suffix serving logic:
 * 1. Check bot/IP blocking rules
 * 2. If blocked AND force_transparent=true → redirect without suffix
 * 3. If blocked AND force_transparent=false → return 403 error
 * 4. If not blocked → try to serve suffix from bucket
 * 5. If bucket empty → clean 302 redirect without suffix
 */
async function handleClick(req, res) {
  const startTime = Date.now();
  
  try {
    // Support both GET and POST for Google's parallel tracking (navigator.sendBeacon sends POST)
    // Parameters can be in query string (GET) or body (POST)
    const params = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
    
    // Accept both 'url' and 'redirect_url' parameter names (Google Ads uses redirect_url)
    const { offer_name, url: landingPageUrl, redirect_url: redirectUrlParam, force_transparent, meta_refresh, gclid, clickref } = params;
    const finalUrl = landingPageUrl || redirectUrlParam;
    const useMetaRefresh = meta_refresh === 'true';
    
    // Extract GCLID value - support multiple parameter names (gclid, clickref, etc.)
    const gclidValue = clickref || gclid;
    console.log(`[google-ads-click] GCLID: ${gclidValue || '(none)'}`);

    // Validate required parameters
    if (!offer_name || !finalUrl) {
      return res.status(400).json({
        error: 'Missing required parameters: offer_name, url (or redirect_url)',
        received: { offer_name, url: landingPageUrl, redirect_url: redirectUrlParam }
      });
    }

    console.log(`[google-ads-click] ${req.method} request received for offer: ${offer_name}`);

    // Get client info - extract REAL user IP from headers (prioritize in order):
    // 1. CF-Connecting-IP (Cloudflare - most reliable for real user IP)
    // 2. X-Forwarded-For (first PUBLIC IP = original client IP, skip private IPs)
    // 3. X-Real-IP (nginx/proxy)
    // 4. req.ip (fallback to express detected IP)
    
    // Helper to check if IP is private
    const isPrivateIP = (ip) => {
      if (!ip) return true;
      const parts = ip.split('.');
      if (parts.length !== 4) return false; // Not IPv4, keep it
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      return (
        first === 10 ||
        first === 127 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      );
    };
    
    let clientIp = req.headers['cf-connecting-ip'] || null;
    
    // If no CF header, extract first PUBLIC IP from X-Forwarded-For chain
    if (!clientIp && req.headers['x-forwarded-for']) {
      const ipChain = req.headers['x-forwarded-for'].split(',').map(ip => ip.trim());
      clientIp = ipChain.find(ip => !isPrivateIP(ip)) || ipChain[0]; // First public IP or fallback to first
    }
    
    // Final fallbacks
    if (!clientIp) {
      clientIp = req.headers['x-real-ip'] || req.ip || req.connection.remoteAddress;
    }
    
    console.log(`[google-ads-click] Client IP extracted: ${clientIp} (cf-connecting-ip: ${req.headers['cf-connecting-ip']}, x-forwarded-for: ${req.headers['x-forwarded-for']}, req.ip: ${req.ip})`);
    
    const userAgent = req.headers['user-agent'] || '';
    
    // Detect country - prioritize GeoIP lookup over headers
    let clientCountry = 'US'; // Fallback default
    const geoData = await queryGeoIPService(clientIp);
    if (geoData && geoData.country) {
      clientCountry = normalizeCountryCode(geoData.country) || geoData.country;
      console.log(`[google-ads-click] GeoIP detected country: ${clientCountry} for IP ${clientIp}`);
    } else {
      // Fallback to headers if GeoIP fails
      const rawClientCountry = req.headers['cloudfront-viewer-country'] || 
                  req.headers['x-country'] || 
                  'US';
      clientCountry = normalizeCountryCode(rawClientCountry) || rawClientCountry;
      console.log(`[google-ads-click] Using header country: ${clientCountry}`);
    }

    // Load offer configuration with ALL settings
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('*')
      .eq('offer_name', offer_name)
      .single();

    if (offerError || !offer) {
      console.error(`[google-ads-click] Offer lookup failed for: ${offer_name}`);
      if (offerError) {
        console.error(`[google-ads-click] Supabase error:`, offerError);
      }
      return res.status(404).json({ error: 'Offer not found' });
    }

    const googleAdsConfig = offer.google_ads_config || {};
    const silentFetchEnabled = !!googleAdsConfig.silent_fetch_enabled;
    
    // Get trace mode from offer settings (default to http_only for speed)
    const traceMode = googleAdsConfig.trace_mode || offer.trace_mode || offer.preferred_mode || 'http_only';
    
    // Build dynamic tracking URL by replacing the url parameter with actual landing page
    let silentFetchTrackingUrl = googleAdsConfig.silent_fetch_tracking_url || googleAdsConfig.silent_fetch_url || offer.url;
    if (silentFetchEnabled && silentFetchTrackingUrl && finalUrl) {
      // Replace the url parameter in tracking URL with the actual landing page
      // e.g., https://go.skimresources.com/?id=XXX&url=OLDURL → replace OLDURL with finalUrl
      const urlMatch = silentFetchTrackingUrl.match(/([?&])url=([^&]*)/);
      if (urlMatch) {
        const encodedFinalUrl = encodeURIComponent(finalUrl);
        silentFetchTrackingUrl = silentFetchTrackingUrl.replace(
          /([?&])url=([^&]*)/,
          `$1url=${encodedFinalUrl}`
        );
        console.log(`[google-ads-click] Dynamic tracking URL: ${silentFetchTrackingUrl.substring(0, 100)}...`);
      }
    }
    
    // Continue with normal bucket logic (unchanged)
    const rawGeoPool = Array.isArray(offer.geo_pool) && offer.geo_pool.length > 0
      ? offer.geo_pool
      : (Array.isArray(googleAdsConfig.single_geo_targets) ? googleAdsConfig.single_geo_targets : []);
    const geoPool = rawGeoPool.map(normalizeCountryCode).filter(Boolean);

    if (geoPool.length > 0) {
      const lastPrefill = lastPrefillByOffer.get(offer_name) || 0;
      if (Date.now() - lastPrefill > GEO_PREFILL_COOLDOWN_MS) {
        lastPrefillByOffer.set(offer_name, Date.now());
        triggerGeoPoolPrefill(offer_name, geoPool, googleAdsConfig).catch(err => {
          console.error('[google-ads-click] Geo pool prefill failed:', err.message || err);
        });
      }
    }
    
    // Check bot/IP blocking rules
    const blockResult = await checkIfBlocked(
      clientIp, 
      userAgent, 
      clientCountry, 
      googleAdsConfig
    );

    if (blockResult.blocked) {
      console.log(`[google-ads-click] Click blocked: ${blockResult.reason} - BUT REDIRECTING ANYWAY (force all redirects)`);
      
      // ALWAYS redirect to final URL, even if blocked (to avoid google.com/asnc redirects)
      // Log the blocked click for analytics
      await logClickEvent(
        offer_name,
        '', // No suffix
        clientCountry,
        clientIp,
        userAgent,
        req.headers['referer'],
        finalUrl,
        Date.now() - startTime,
        true, // blocked flag
        blockResult.reason
      ).catch(err => console.error('[google-ads-click] Failed to log blocked click:', err));
      
      // Redirect immediately to avoid Google verification
      return res.redirect(302, finalUrl);
    }

    // Try to get suffix from bucket (with FOR UPDATE SKIP LOCKED for concurrency)
    let redirectUrl = finalUrl;
    let hasSuffix = false;
    let suffixValue = '';
    let eventId = null;
    let bucketTargetCountry = clientCountry;

    // Skip bucket suffix logic entirely for silent fetch mode
    if (!silentFetchEnabled) {
      const shouldUseRandomPoolCountry = geoPool.length > 0 && !geoPool.includes(normalizeCountryCode(clientCountry));
      bucketTargetCountry = shouldUseRandomPoolCountry
        ? geoPool[Math.floor(Math.random() * geoPool.length)]
        : clientCountry;

      const { data: suffixData, error: suffixError } = await supabase
        .rpc('get_geo_suffix', {
          p_offer_name: offer_name,
          p_target_country: bucketTargetCountry
        });

      if (suffixData && suffixData.length > 0) {
        // Got a suffix from bucket
        const suffix = suffixData[0];
        redirectUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${suffix.suffix}`;
        hasSuffix = true;
        suffixValue = suffix.suffix;
        
        console.log(`[google-ads-click] Served suffix from bucket (${bucketTargetCountry}): ${suffix.suffix.substring(0, 50)}...`);
        
        // Log click event (fire and forget)
        logClickEvent(
          offer_name,
          suffix.suffix,
          clientCountry,
          clientIp,
          req.headers['user-agent'],
          req.headers['referer'],
          finalUrl,
          Date.now() - startTime
        ).then(id => {
          eventId = id;
          // Trigger async trace verification
          return verifyTraceAsync(eventId, finalUrl, offer_name);
        }).catch(err => {
          console.error(`[google-ads-click] Failed to log click event:`, err);
        });
        
        // Trigger async trace to refill bucket (fire and forget)
        triggerAsyncTrace(offer_name, bucketTargetCountry).catch(err => {
          console.error(`[google-ads-click] Failed to trigger async trace:`, err);
        });
        
      } else {
        // No suffix available in bucket
        console.warn(`[google-ads-click] No suffix available for ${offer_name} in ${bucketTargetCountry}`);
        console.log('[google-ads-click] Clean redirect (no suffix)');
      }
    } else {
      console.log(`[google-ads-click] 🔵 Silent fetch mode - skipping bucket suffix logic`);
    }

    // Increment click stats (async, non-blocking)
    supabase
      .rpc('increment_click_stats', {
        p_offer_name: offer_name,
        p_target_country: bucketTargetCountry,
        p_has_suffix: hasSuffix
      })
      .then(() => {
        // Stats updated successfully
      })
      .catch(err => {
        console.error(`[google-ads-click] Failed to update stats:`, err);
      });

    // Log response time
    const responseTime = Date.now() - startTime;
    console.log(`[google-ads-click] Redirect completed in ${responseTime}ms`);

    if (silentFetchEnabled) {
      console.log(`[google-ads-click] 🔵 Silent fetch mode enabled for ${offer_name}`);
      
      // Immediate redirect for Google bots (no delay, no tracking)
      if (isGoogleBot(userAgent)) {
        console.log(`[google-ads-click] 🤖 Google bot detected - immediate 302 redirect`);
        return res.redirect(302, finalUrl);
      }
      
      // For POST requests (Google's sendBeacon parallel tracking)
      // sendBeacon doesn't process response HTML, so we must fetch server-side
      if (req.method === 'POST') {
        console.log(`[google-ads-click] POST request from parallel tracking - triggering server-side fetch`);
        
        const referrer = req.headers['referer'] || req.headers['referrer'] || '';
        logSilentFetchStats(offer_name, clientCountry, clientIp, userAgent, referrer, req.headers, suffixValue, redirectUrl).catch(err => {
          console.error('[google-ads-click] Failed to log silent fetch stats:', err);
        });

        // Hit tracking URL server-side using full trace infrastructure (same as get-suffix)
        if (silentFetchTrackingUrl) {
          // Insert GCLID as FIRST query parameter (e.g., xcust for Skimlinks)
          let trackingUrlWithGclid = silentFetchTrackingUrl;
          if (gclidValue && googleAdsConfig?.gclid_param_token) {
            // Insert GCLID as the first query parameter
            const questionMarkIndex = silentFetchTrackingUrl.indexOf('?');
            if (questionMarkIndex !== -1) {
              // URL has query params - insert GCLID as first param
              const baseUrl = silentFetchTrackingUrl.substring(0, questionMarkIndex);
              const existingParams = silentFetchTrackingUrl.substring(questionMarkIndex + 1);
              trackingUrlWithGclid = `${baseUrl}?${googleAdsConfig.gclid_param_token}=${encodeURIComponent(gclidValue)}&${existingParams}`;
              console.log(`[google-ads-click] 🔑 Inserted GCLID as FIRST param: ${googleAdsConfig.gclid_param_token}=${gclidValue}`);
            } else {
              // No query params - add GCLID as only param
              trackingUrlWithGclid = `${silentFetchTrackingUrl}?${googleAdsConfig.gclid_param_token}=${encodeURIComponent(gclidValue)}`;
              console.log(`[google-ads-click] 🔑 Added GCLID as only param: ${googleAdsConfig.gclid_param_token}=${gclidValue}`);
            }
            
            // Store GCLID mapping for conversion tracking
            supabase
              .from('gclid_click_mapping')
              .insert({
                gclid: gclidValue,
                offer_name: offer_name,
                click_id: gclidValue,
                client_country: clientCountry,
                client_ip: clientIp,
                user_agent: userAgent,
                tracking_url: trackingUrlWithGclid,
                landing_url: finalUrl
              })
              .then(({ error: insertError }) => {
                if (insertError) console.error('[google-ads-click] Failed to store GCLID mapping:', insertError);
                else console.log(`[google-ads-click] ✅ GCLID mapping stored: ${gclidValue}`);
              });
          } else if (gclidValue) {
            // No token configured, just log warning
            console.log(`[google-ads-click] ⚠️  GCLID present but no gclid_param_token configured: ${gclidValue}`);
          }
          
          console.log(`[google-ads-click] 🎯 Tracking URL with GCLID: ${trackingUrlWithGclid.substring(0, 100)}...`);
          
          // Call trace-redirects endpoint with the GCLID-modified tracking URL
          // Pass all offer settings to ensure comprehensive trace with proxy, geo, referrer, etc.
          const tracePayload = {
            url: trackingUrlWithGclid,  // Use the modified URL with GCLID as first param
            max_redirects: 20,
            timeout_ms: traceMode === 'http_only' ? 15000 : 45000,
            use_proxy: true,
            tracer_mode: traceMode,
            offer_id: offer.id
          };

          // Geo targeting - use client's geo if in pool, otherwise random from pool
          let traceSelectedGeo = null;
          if (offer.geo_pool && offer.geo_pool.length > 0) {
            // Check if client's country is in the geo pool
            const normalizedClientCountry = normalizeCountryCode(clientCountry);
            const normalizedGeoPool = offer.geo_pool.map(c => normalizeCountryCode(c));
            
            if (normalizedGeoPool.includes(normalizedClientCountry)) {
              // Client country is in pool - use it
              traceSelectedGeo = normalizedClientCountry;
              tracePayload.target_country = normalizedClientCountry;
              console.log(`[google-ads-click] 🌍 Using client's geo for trace: ${normalizedClientCountry}`);
            } else {
              // Client country not in pool - pick random from pool
              traceSelectedGeo = offer.geo_pool[Math.floor(Math.random() * offer.geo_pool.length)];
              tracePayload.target_country = traceSelectedGeo;
              console.log(`[google-ads-click] 🎲 Client geo ${normalizedClientCountry} not in pool, using random: ${traceSelectedGeo}`);
            }
          } else if (offer.target_country) {
            // Single geo: use target_country
            traceSelectedGeo = offer.target_country;
            tracePayload.target_country = offer.target_country;
            console.log(`[google-ads-click] 🎯 Using single target country: ${offer.target_country}`);
          } else {
            // No geo configured - use client's country
            traceSelectedGeo = normalizeCountryCode(clientCountry);
            tracePayload.target_country = traceSelectedGeo;
            console.log(`[google-ads-click] 🌐 No geo pool, using client country: ${traceSelectedGeo}`);
          }

          // Referrer rotation
          if (offer.referrer_pool && offer.referrer_pool.length > 0) {
            const randomReferrer = offer.referrer_pool[Math.floor(Math.random() * offer.referrer_pool.length)];
            tracePayload.referrer = randomReferrer;
            if (offer.referrer_hops) {
              tracePayload.referrer_hops = offer.referrer_hops;
            }
          }

          // Device distribution
          if (offer.device_distribution && Array.isArray(offer.device_distribution)) {
            tracePayload.device_distribution = offer.device_distribution;
          }

          // Expected final URL
          if (offer.expected_final_url) {
            tracePayload.expected_final_url = offer.expected_final_url;
          }

          // Proxy protocol
          if (offer.proxy_protocol) {
            tracePayload.proxy_protocol = offer.proxy_protocol;
          }

          // Location header extraction
          if (offer.extract_from_location_header) {
            tracePayload.extract_from_location_header = true;
            if (offer.location_extract_hop !== null && offer.location_extract_hop !== undefined) {
              tracePayload.location_extract_hop = offer.location_extract_hop;
            }
          }

          // Suffix step
          if (offer.redirect_chain_step !== null && offer.redirect_chain_step !== undefined) {
            tracePayload.suffix_step = offer.redirect_chain_step;
          }
          
          const traceUrl = `${supabaseUrl}/functions/v1/trace-redirects`;
          console.log(`[google-ads-click] 🚀 Calling trace-redirects with GCLID-modified URL`);
          
          axios.post(traceUrl, tracePayload, {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000,
            validateStatus: () => true
          }).then(response => {
            // Success if HTTP 2xx and has data
            if (response.status >= 200 && response.status < 300 && response.data) {
              const result = response.data;
              
              // Extract trace metrics from trace-redirects response
              const hopCount = result.chain?.length || 0;
              const proxyIp = result.proxy_ip || null;
              const finalUrl = result.final_url || result.chain?.[result.chain.length - 1]?.url || null;
              const geoLocation = result.geo_location?.country || result.selected_geo || 'unknown';
              
              // Extract query parameters from final URL
              let finalUrlParams = null;
              if (finalUrl) {
                try {
                  const urlObj = new URL(finalUrl);
                  finalUrlParams = urlObj.search.substring(1); // Remove leading ?
                  if (finalUrlParams) {
                    console.log(`[google-ads-click] 📋 Extracted final URL params: ${finalUrlParams.substring(0, 100)}...`);
                  }
                } catch (err) {
                  console.log(`[google-ads-click] ⚠️  Could not parse final URL for params: ${err.message}`);
                }
              }
              
              console.log(`[google-ads-click] ✅ Trace successful: ${hopCount} hops, final: ${finalUrl?.substring(0, 80)}...`);
              console.log(`[google-ads-click] 🌍 Trace result - Proxy IP: ${proxyIp || 'unknown'}, Location: ${geoLocation}, Selected Geo: ${traceSelectedGeo}`);
              
              // Update database record with trace success
              supabase
                .from('gclid_click_mapping')
                .update({
                  tracking_trace_status: 'completed',
                  tracking_trace_hops: hopCount,
                  tracking_trace_final_url: finalUrl,
                  tracking_trace_proxy_ip: proxyIp,
                  trace_selected_geo: traceSelectedGeo,
                  final_url_params: finalUrlParams,
                  updated_at: new Date().toISOString()
                })
                .eq('gclid', gclidValue)
                .then(({ error: updateError }) => {
                  if (updateError) {
                    console.error(`[google-ads-click] Failed to update trace status:`, updateError);
                  } else {
                    console.log(`[google-ads-click] ✅ Trace completion recorded for GCLID: ${gclidValue}`);
                  }
                });
            } else {
              console.log(`[google-ads-click] ⚠️  Trace failed with status: ${response.status}, data: ${JSON.stringify(response.data)?.substring(0, 200)}`);
              
              // Update database record with trace failure
              supabase
                .from('gclid_click_mapping')
                .update({
                  tracking_trace_status: 'failed',
                  tracking_trace_error: `HTTP ${response.status}`,
                  updated_at: new Date().toISOString()
                })
                .eq('gclid', gclidValue)
                .then(({ error: updateError }) => {
                  if (updateError) console.error(`[google-ads-click] Failed to update trace failure:`, updateError);
                });
            }
          }).catch(err => {
            console.error(`[google-ads-click] ❌ Trace error: ${err.message}`);
            
            // Update database record with trace error
            supabase
              .from('gclid_click_mapping')
              .update({
                tracking_trace_status: 'error',
                tracking_trace_error: err.message,
                updated_at: new Date().toISOString()
              })
              .eq('gclid', gclidValue)
              .then(({ error: updateError }) => {
                if (updateError) console.error(`[google-ads-click] Failed to update trace error:`, updateError);
              });
          });
        }
        
        return res.status(204).send();
      }
      
      console.log(`[google-ads-click] 📊 Request details:`);
      console.log(`  - IP: ${clientIp}`);
      console.log(`  - Country: ${clientCountry}`);
      console.log(`  - User Agent: ${userAgent}`);
      console.log(`  - Referrer: ${req.headers['referer'] || req.headers['referrer'] || '(none)'}`);
      console.log(`  - Tracking URL: ${silentFetchTrackingUrl}`);
      console.log(`  - Landing URL: ${redirectUrl}`);

      const referrer = req.headers['referer'] || req.headers['referrer'] || '';
      logSilentFetchStats(offer_name, clientCountry, clientIp, userAgent, referrer, req.headers, suffixValue, redirectUrl).catch(err => {
        console.error('[google-ads-click] Failed to log silent fetch stats:', err);
      });

      const debugDelayMsRaw = parseInt(req.query.debug_delay_ms, 10);
      const redirectDelayMs = Number.isFinite(debugDelayMsRaw)
        ? Math.min(Math.max(debugDelayMsRaw, 0), 10000)
        : 3000;

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="referrer" content="no-referrer">
  <meta charset="UTF-8">
  <title>Redirecting...</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .loading {
      text-align: center;
      color: #666;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #3498db;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
  <script>
    // Triple-redundant tracking using ALL 3 methods from client-redirect-monitor.html
    // All methods fired asynchronously to ensure tracking NEVER fails
    (function() {
      var trackingUrl = ${JSON.stringify(silentFetchTrackingUrl)};
      var gclidValue = ${JSON.stringify(gclidValue || null)};
      var gclidParamToken = ${JSON.stringify(googleAdsConfig?.gclid_param_token || null)};
      var landingUrl = ${JSON.stringify(finalUrl)};
      var delayMs = ${redirectDelayMs};
      
      // Append GCLID as network-specific parameter
      if (gclidValue && gclidParamToken && trackingUrl) {
        var separator = trackingUrl.includes('?') ? '&' : '?';
        trackingUrl = trackingUrl + separator + gclidParamToken + '=' + encodeURIComponent(gclidValue);
        console.log('[Silent Fetch] 🔑 Appended GCLID: ' + gclidParamToken + '=' + gclidValue);
      } else if (gclidValue && !gclidParamToken) {
        console.log('[Silent Fetch] ⚠️  GCLID present but no param token configured: ' + gclidValue);
      }
      
      console.log('[Silent Fetch] Starting TRIPLE-METHOD tracking...');
      console.log('[Silent Fetch] Tracking URL:', trackingUrl);
      console.log('[Silent Fetch] Landing URL:', landingUrl);
      console.log('[Silent Fetch] Delay:', delayMs + 'ms');

      if (!trackingUrl || trackingUrl === 'undefined') {
        console.log('[Silent Fetch] No tracking URL - redirecting immediately');
        window.location.href = landingUrl;
        return;
      }

      var methodsSucceeded = 0;
      var totalMethods = 3;

      function trackSuccess(method) {
        methodsSucceeded++;
        console.log('[Silent Fetch] ✓ ' + method + ' succeeded (' + methodsSucceeded + '/' + totalMethods + ')');
      }

      // Method 1: Image Pixel (PRIMARY - most reliable, follows ALL redirects & sets cookies)
      // This is the gold standard for affiliate tracking - works cross-domain without CORS
      try {
        var img = new Image();
        img.style.display = 'none';
        img.style.width = '0';
        img.style.height = '0';
        img.style.position = 'absolute';
        img.style.left = '-9999px';
        
        img.onload = function() {
          trackSuccess('Image Pixel [LOAD]');
        };
        img.onerror = function() {
          trackSuccess('Image Pixel [REDIRECT]');
        };
        
        img.src = trackingUrl;
        document.body.appendChild(img);
        console.log('[Silent Fetch] [1/3] Image pixel initiated - following redirect chain...');
      } catch (e) {
        console.log('[Silent Fetch] [1/3] Image pixel error:', e.message);
      }

      // Method 2: Beacon API (BACKUP - fire & forget, works even if page unloads)
      // Survives page navigation and doesn't require response
      if (navigator.sendBeacon) {
        try {
          var beaconSent = navigator.sendBeacon(trackingUrl);
          if (beaconSent) {
            trackSuccess('Beacon API');
            console.log('[Silent Fetch] [2/3] Beacon API sent successfully');
          } else {
            console.log('[Silent Fetch] [2/3] Beacon API queue full (other methods active)');
          }
        } catch (e) {
          console.log('[Silent Fetch] [2/3] Beacon API error:', e.message);
        }
      } else {
        console.log('[Silent Fetch] [2/3] Beacon API not supported (methods 1 & 3 active)');
      }

      // Method 3: Hidden IFrame (TERTIARY - loads URL in background, follows redirects)
      // Creates invisible iframe that loads the tracking URL with full browser context
      try {
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.position = 'absolute';
        iframe.style.left = '-9999px';
        
        iframe.onload = function() {
          trackSuccess('Hidden IFrame');
        };
        iframe.onerror = function() {
          console.log('[Silent Fetch] [3/3] IFrame error (expected for cross-origin)');
        };
        
        iframe.src = trackingUrl;
        document.body.appendChild(iframe);
        console.log('[Silent Fetch] [3/3] Hidden IFrame initiated - loading in background...');
      } catch (e) {
        console.log('[Silent Fetch] [3/3] IFrame error:', e.message);
      }

      console.log('[Silent Fetch] All 3 tracking methods fired asynchronously!');
      console.log('[Silent Fetch] Waiting ' + delayMs + 'ms before redirect...');
      
      // Redirect to landing page after delay (gives time for tracking to complete)
      setTimeout(function() {
        console.log('[Silent Fetch] Delay complete - ' + methodsSucceeded + ' methods confirmed');
        console.log('[Silent Fetch] Redirecting to landing page...');
        window.location.href = landingUrl;
      }, delayMs);
    })();
  </script>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>Redirecting...</p>
  </div>
  <!-- Hidden containers for tracking methods -->
  <div id="pixel-container" style="display:none;position:absolute;left:-9999px;"></div>
  <div id="iframe-container" style="display:none;position:absolute;left:-9999px;"></div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; connect-src *; img-src *; frame-src *; style-src 'unsafe-inline'; base-uri 'none'; form-action *; frame-ancestors 'none'"
      );
      return res.send(html);
    }

    // Perform redirect (meta refresh hides referrer, 302 is standard)
    if (useMetaRefresh) {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
  <meta name="referrer" content="no-referrer">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; img-src * data:; style-src 'unsafe-inline'; base-uri 'none'; form-action *; frame-ancestors 'none'"
      );
      return res.send(html);
    }

    return res.redirect(302, redirectUrl);

  } catch (error) {
    console.error('[google-ads-click] Fatal error:', error);
    
    // On error, redirect to landing page without suffix (fail-safe)
    if (finalUrl) {
      console.log('[google-ads-click] Error fallback - transparent redirect');
      return res.redirect(302, finalUrl);
    }
    
    return res.status(500).json({
      error: error.message,
      message: 'Click handler failed'
    });
  }
}

/**
 * Trigger async trace to refill bucket
 * Fire and forget - doesn't block the redirect
 */
async function triggerAsyncTrace(offerName, targetCountry) {
  try {
    // Call get-suffix function to generate 1 new suffix and store in bucket
    const getSuffixUrl = `${supabaseUrl}/functions/v1/get-suffix?offer_name=${encodeURIComponent(offerName)}`;
    const response = await fetch(getSuffixUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[google-ads-click] Async trace failed: ${errorText}`);
      return;
    }

    const result = await response.json();
    
    // Extract suffix from response
    const suffix = result.suffix || result.tracking_suffix;
    if (!suffix) {
      console.error(`[google-ads-click] No suffix in async trace response`);
      return;
    }

    // Store in geo_suffix_buckets for future use
    const { error: insertError } = await supabase
      .from('geo_suffix_buckets')
      .insert({
        offer_name: offerName,
        target_country: targetCountry,
        suffix: suffix,
        hop_count: result.hop_count || 0,
        final_url: result.final_url || '',
        traced_at: new Date().toISOString(),
        is_used: false,
        metadata: {
          trace_mode: result.tracer_mode_used || 'http_only',
          generated_by: 'auto-refill'
        }
      });

    if (insertError) {
      // Ignore duplicate errors (23505)
      if (insertError.code !== '23505') {
        console.error(`[google-ads-click] Failed to store refill suffix:`, insertError.message);
      }
    } else {
      console.log(`[google-ads-click] Bucket refilled for ${offerName} (${targetCountry})`);
    }
  } catch (error) {
    console.error(`[google-ads-click] Async trace exception:`, error);
  }
}

/**
 * Prefill buckets for all countries in the offer's geo pool
 */
async function triggerGeoPoolPrefill(offerName, geoPool, googleAdsConfig = {}) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[google-ads-click] Supabase env missing - cannot prefill geo pool');
      return;
    }

    const payload = {
      offer_name: offerName,
      single_geo_targets: geoPool,
    };

    if (Array.isArray(googleAdsConfig.multi_geo_targets) && googleAdsConfig.multi_geo_targets.length > 0) {
      payload.multi_geo_targets = googleAdsConfig.multi_geo_targets;
    }

    if (typeof googleAdsConfig.single_geo_count === 'number') {
      payload.single_geo_count = googleAdsConfig.single_geo_count;
    }

    if (typeof googleAdsConfig.multi_geo_count === 'number') {
      payload.multi_geo_count = googleAdsConfig.multi_geo_count;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/fill-geo-buckets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[google-ads-click] Geo pool prefill failed: ${errorText}`);
      return;
    }

    console.log(`[google-ads-click] Geo pool prefill triggered for ${offerName}: ${geoPool.join(', ')}`);
  } catch (error) {
    console.error('[google-ads-click] Geo pool prefill exception:', error);
  }
}

/**
 * Health check endpoint
 */
async function handleHealthCheck(req, res) {
  try {
    // Check if Google Ads feature is enabled
    const { data: settings } = await supabase
      .from('settings')
      .select('google_ads_enabled')
      .single();

    return res.json({
      status: 'ok',
      feature: 'google-ads-click-handler',
      enabled: settings?.google_ads_enabled || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}

/**
 * Get bucket stats endpoint (for monitoring)
 */
async function handleBucketStats(req, res) {
  try {
    const { offer_name } = req.query;

    if (!offer_name) {
      return res.status(400).json({
        error: 'Missing required parameter: offer_name'
      });
    }

    const { data: stats, error } = await supabase
      .rpc('get_bucket_stats', {
        p_offer_name: offer_name
      });

    if (error) {
      throw error;
    }

    return res.json({
      offer_name,
      buckets: stats || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[google-ads-click] Stats error:', error);
    return res.status(500).json({
      error: error.message
    });
  }
}

/**
 * Check if click should be blocked based on bot detection and IP filtering
 * Returns: { blocked: boolean, reason: string }
 */
async function checkIfBlocked(clientIp, userAgent, clientCountry, googleAdsConfig) {
  const config = googleAdsConfig.filtering || {};
  
  // Skip all checks if filtering is EXPLICITLY disabled or not configured
  // Default: NO FILTERING unless user explicitly enables it
  if (config.enabled !== true) { // Must be explicitly true to enable
    return { blocked: false, reason: null };
  }

  // 1. BOT DETECTION - Use isbot library (900+ patterns) or fallback to regex
  if (config.bot_detection === true) { // Must be EXPLICITLY true to enable
    // Try isbot library first (most comprehensive)
    if (isbot) {
      try {
        if (isbot(userAgent)) {
          return { blocked: true, reason: 'Bot detected by isbot library' };
        }
      } catch (err) {
        console.warn('[google-ads-click] isbot check failed:', err.message);
      }
    }
    
    // Fallback to regex patterns if isbot unavailable
    const botPatterns = config.bot_patterns || [
      /bot/i,
      /crawl/i,
      /spider/i,
      /scrape/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java(?!script)/i,
      /go-http/i,
      /okhttp/i,
      /axios/i,
      /fetch/i,
      /http\.client/i,
      /urllib/i,
      /requests/i,
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        return { blocked: true, reason: `Bot detected: ${pattern.source}` };
      }
    }

    // Check for missing or suspicious User-Agent
    if (!userAgent || userAgent.length < 10) {
      return { blocked: true, reason: 'Missing or invalid User-Agent' };
    }
  }

  // 2. IP BLACKLIST - Check blocked IPs
  if (config.ip_blacklist && config.ip_blacklist.length > 0) {
    if (config.ip_blacklist.includes(clientIp)) {
      return { blocked: true, reason: 'IP blacklisted' };
    }
  }

  // 3. IP WHITELIST - Only allow specific IPs (if configured)
  if (config.ip_whitelist && config.ip_whitelist.length > 0) {
    if (!config.ip_whitelist.includes(clientIp)) {
      return { blocked: true, reason: 'IP not in whitelist' };
    }
  }

  // 4. GEO BLOCKING - Check country restrictions
  if (config.blocked_countries && config.blocked_countries.length > 0) {
    if (config.blocked_countries.includes(clientCountry)) {
      return { blocked: true, reason: `Country blocked: ${clientCountry}` };
    }
  }

  // 5. GEO WHITELIST - Only allow specific countries (if configured)
  if (config.allowed_countries && config.allowed_countries.length > 0) {
    if (!config.allowed_countries.includes(clientCountry)) {
      return { blocked: true, reason: `Country not allowed: ${clientCountry}` };
    }
  }

  // 6. RATE LIMITING - Check clicks per IP (requires database query)
  if (config.rate_limit && config.rate_limit.enabled) {
    const limit = config.rate_limit.max_clicks_per_ip || 10;
    const windowMinutes = config.rate_limit.window_minutes || 60;
    
    try {
      const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
      
      const { count, error } = await supabase
        .from('google_ads_click_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_ip', clientIp)
        .gte('clicked_at', cutoffTime);

      if (error) {
        console.error('[google-ads-click] Rate limit check failed:', error);
      } else if (count >= limit) {
        return { blocked: true, reason: `Rate limit exceeded: ${count}/${limit} in ${windowMinutes}m` };
      }
    } catch (err) {
      console.error('[google-ads-click] Rate limit exception:', err);
    }
  }

  // 7. DATA CENTER DETECTION - Query centralized GeoIP service
  if (config.block_datacenters === true) { // Must be EXPLICITLY true to enable
    try {
      const geoipData = await queryGeoIPService(clientIp);
      
      if (geoipData && geoipData.is_datacenter) {
        return { 
          blocked: true, 
          reason: `Datacenter IP detected: AS${geoipData.asn} (${geoipData.asn_organization || 'Unknown'})` 
        };
      }
    } catch (err) {
      console.warn('[google-ads-click] Datacenter check failed:', err.message);
    }
  }

  // 8. VPN/PROXY DETECTION - Check for VPN/proxy providers and suspicious ISPs
  if (config.block_vpn_proxy === true) { // Must be EXPLICITLY true to enable
    try {
      const geoipData = await queryGeoIPService(clientIp);
      
      if (geoipData && geoipData.asn_organization) {
        const org = geoipData.asn_organization.toLowerCase();
        
        // Known VPN/Proxy providers
        const vpnProviders = ['vpn', 'proxy', 'tor', 'i2p', 'anonymou', 'expressvpn', 'nordvpn', 'surfshark', 'cyberghost', 'bitdefender', 'hotspot shield', 'zenmate', 'browsec', '1.1.1.1', 'warp', 'piavpn'];
        
        if (vpnProviders.some(provider => org.includes(provider))) {
          return { blocked: true, reason: `VPN/Proxy provider detected: ${geoipData.asn_organization}` };
        }
      }
    } catch (err) {
      console.warn('[google-ads-click] VPN detection failed:', err.message);
    }
  }

  // 9. REPEAT IP DETECTION - Block IPs that have received suffixes recently
  // Only enabled if explicitly configured in frontend
  const repeatIpWindow = config.repeat_ip_window_days;
  if (config.block_repeat_ips === true && repeatIpWindow && repeatIpWindow > 0) {
    try {
      const cutoffTime = new Date(Date.now() - repeatIpWindow * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: previousClicks, error } = await supabase
        .from('google_ads_click_events')
        .select('id, clicked_at')
        .eq('user_ip', clientIp)
        .eq('blocked', false)  // Only count non-blocked clicks that got suffixes
        .neq('suffix', '')     // Only count clicks that received a suffix
        .gte('clicked_at', cutoffTime)
        .limit(1);

      if (error) {
        console.error('[google-ads-click] Repeat IP check failed:', error);
      } else if (previousClicks && previousClicks.length > 0) {
        const lastClick = new Date(previousClicks[0].clicked_at);
        const daysSince = Math.floor((Date.now() - lastClick.getTime()) / (24 * 60 * 60 * 1000));
        return { blocked: true, reason: `Repeat IP: last click ${daysSince} days ago (within ${repeatIpWindow}-day window)` };
      }
    } catch (err) {
      console.error('[google-ads-click] Repeat IP check exception:', err);
    }
  }

  // All checks passed
  return { blocked: false, reason: null };
}

/**
 * Log click event to database
 */
async function logClickEvent(offerName, suffix, targetCountry, userIp, userAgent, referrer, redirectUrl, responseTimeMs, blocked = false, blockReason = null) {
  try {
    // Insert directly into database
    const { data, error } = await supabase
      .from('google_ads_click_events')
      .insert({
        offer_name: offerName,
        suffix: suffix || '',
        target_country: targetCountry,
        user_ip: userIp,
        user_agent: userAgent,
        referrer: referrer,
        redirect_url: redirectUrl,
        response_time_ms: responseTimeMs,
        blocked: blocked,
        block_reason: blockReason
      })
      .select('id');

    if (error) throw error;
    
    const eventId = data && data[0] ? data[0].id : null;
    console.log(`[google-ads-click] Logged click event: ${eventId}`);
    return eventId;
  } catch (error) {
    console.error('[google-ads-click] Failed to log click event:', error);
    throw error;
  }
}

/**
 * Verify trace async - checks if suffix leads to correct final URL
 */
async function verifyTraceAsync(eventId, redirectUrl, offerName) {
  try {
    // Get the offer to know expected domain
    const { data: offer } = await supabase
      .from('offers')
      .select('url')
      .eq('offer_name', offerName)
      .single();

    if (!offer) {
      console.error(`[google-ads-click] Offer not found: ${offerName}`);
      return;
    }

    // Extract expected domain from offer URL
    const expectedDomain = new URL(offer.url).hostname;

    // Make HTTP request to follow redirects
    const axios = require('axios');
    const startTime = Date.now();
    
    try {
      const response = await axios.get(redirectUrl, {
        maxRedirects: 10,
        timeout: 15000,
        validateStatus: () => true // Accept any status
      });

      const finalUrl = response.request.res.responseUrl || redirectUrl;
      const finalDomain = new URL(finalUrl).hostname;
      const hopCount = response.request._redirectable?._redirectCount || 0;
      const success = finalDomain.includes(expectedDomain) || expectedDomain.includes(finalDomain);

      // Update trace result
      await supabase
        .rpc('update_trace_result', {
          p_event_id: eventId,
          p_success: success,
          p_final_url: finalUrl,
          p_expected_domain: expectedDomain,
          p_hop_count: hopCount,
          p_error: success ? null : `Expected domain: ${expectedDomain}, got: ${finalDomain}`
        });

      console.log(`[google-ads-click] Trace verified: ${success ? 'SUCCESS' : 'FAILED'}`);

      // Check if alert should be sent (async)
      if (!success) {
        checkAndAlert(offerName, eventId).catch(err => {
          console.error('[google-ads-click] Failed to check alert:', err);
        });
      }

    } catch (traceError) {
      // Trace failed (network error, timeout, etc.)
      await supabase
        .rpc('update_trace_result', {
          p_event_id: eventId,
          p_success: false,
          p_final_url: null,
          p_expected_domain: expectedDomain,
          p_hop_count: 0,
          p_error: traceError.message
        });

      console.error(`[google-ads-click] Trace error:`, traceError.message);

      // Check if alert should be sent
      checkAndAlert(offerName, eventId).catch(err => {
        console.error('[google-ads-click] Failed to check alert:', err);
      });
    }

  } catch (error) {
    console.error('[google-ads-click] Failed to verify trace:', error);
  }
}

/**
 * Check if alert should be sent and send it
 */
async function checkAndAlert(offerName, eventId) {
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/check-and-alert`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          offer_name: offerName,
          event_id: eventId
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[google-ads-click] Alert check failed: ${errorText}`);
    } else {
      const result = await response.json();
      if (result.alert_sent) {
        console.log(`[google-ads-click] Slack alert sent for ${offerName}`);
      }
    }
  } catch (error) {
    console.error('[google-ads-click] Failed to check/send alert:', error);
  }
}

/**
 * Log silent fetch stats to database with parallel tracking detection
 */
async function logSilentFetchStats(offerName, clientCountry, clientIp, userAgent, referrer, allHeaders, redirectUrl) {
  try {
    // Detect if this is a parallel tracking hit
    const isParallelTracking = detectParallelTracking(userAgent, referrer, allHeaders);
    
    // Generate unique click ID for conversion tracking (use gclid if available)
    const gclid = allHeaders['x-google-gclid'] || extractGclidFromUrl(redirectUrl);
    const clickId = gclid || `click_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Log detailed click event for parallel tracking analysis
    const { error } = await supabase
      .from('google_ads_click_events')
      .insert({
        offer_name: offerName,
        suffix: '', // Silent fetch doesn't use suffixes
        target_country: clientCountry,
        user_ip: clientIp,
        user_agent: userAgent,
        referrer: referrer || null,
        redirect_url: redirectUrl,
        response_time_ms: 0,
        is_parallel_tracking: isParallelTracking.detected,
        parallel_tracking_indicators: isParallelTracking.indicators,
        click_id: clickId,
        clicked_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('[google-ads-click] Failed to log click event:', error.message);
    } else {
      console.log(`[google-ads-click] ✓ Logged click: parallel_tracking=${isParallelTracking.detected}, click_id=${clickId}`);
    }

    // Also log to the summary stats table with user agent and referrer for cookie verification
    await supabase
      .from('google_ads_silent_fetch_stats')
      .insert({
        offer_name: offerName,
        client_country: clientCountry,
        client_ip: clientIp,
        user_agent: userAgent,
        referrer: referrer || null,
        request_headers: {
          'user-agent': userAgent,
          'referer': referrer || null,
          'cf-connecting-ip': allHeaders['cf-connecting-ip'],
          'x-forwarded-for': allHeaders['x-forwarded-for'],
          'accept-language': allHeaders['accept-language'],
          'sec-ch-ua': allHeaders['sec-ch-ua'],
          'sec-ch-ua-mobile': allHeaders['sec-ch-ua-mobile'],
          'sec-ch-ua-platform': allHeaders['sec-ch-ua-platform']
        },
        fetch_date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      });
      
  } catch (error) {
    console.error('[google-ads-click] Exception logging silent fetch stats:', error.message);
  }
}

/**
 * Detect if request is from Google parallel tracking
 */
function detectParallelTracking(userAgent, referrer, headers) {
  const indicators = {};
  let detected = false;

  // Check user agent for Google bot patterns
  if (userAgent && (
    userAgent.includes('Googlebot') ||
    userAgent.includes('AdsBot-Google') ||
    userAgent.includes('Google-Ads') ||
    userAgent.includes('Google-adwords')
  )) {
    indicators.user_agent_match = true;
    detected = true;
  }

  // Check for missing referrer (common in parallel tracking)
  if (!referrer || referrer.trim() === '') {
    indicators.no_referrer = true;
  }

  // Check for Google-specific headers
  if (headers['x-google-ads-id'] || 
      headers['x-google-gclid'] ||
      headers['google-cloud-trace-context']) {
    indicators.google_headers = true;
    detected = true;
  }

  // Check for Cloudflare bot detection
  if (headers['cf-bot-score'] && parseInt(headers['cf-bot-score']) < 30) {
    indicators.cloudflare_bot_score = headers['cf-bot-score'];
    detected = true;
  }

  return { detected, indicators };
}

/**
 * Extract gclid from URL parameters
 */
function extractGclidFromUrl(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('gclid');
  } catch (e) {
    return null;
  }
}

/**
 * Export route handlers
 * Import these in server.js only if feature is enabled
 */
module.exports = {
  handleClick,
  handleHealthCheck,
  handleBucketStats
};
