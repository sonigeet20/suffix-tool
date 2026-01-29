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
    // Accept both 'url' and 'redirect_url' parameter names (Google Ads uses redirect_url)
    const { offer_name, url: landingPageUrl, redirect_url: redirectUrlParam, force_transparent, meta_refresh } = req.query;
    const finalUrl = landingPageUrl || redirectUrlParam;
    const useMetaRefresh = meta_refresh === 'true';

    // Validate required parameters
    if (!offer_name || !finalUrl) {
      return res.status(400).json({
        error: 'Missing required parameters: offer_name, url (or redirect_url)',
        received: { offer_name, url: landingPageUrl, redirect_url: redirectUrlParam }
      });
    }

    console.log(`[google-ads-click] Click received for offer: ${offer_name}`);

    // Get client info - extract REAL user IP from headers (prioritize in order):
    // 1. X-Forwarded-For (first IP = original client IP)
    // 2. CF-Connecting-IP (Cloudflare)
    // 3. X-Real-IP (nginx/proxy)
    // 4. req.ip (fallback to express detected IP)
    let clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                   req.headers['cf-connecting-ip'] ||
                   req.headers['x-real-ip'] ||
                   req.ip || 
                   req.connection.remoteAddress;
    
    console.log(`[google-ads-click] Client IP extracted: ${clientIp} (x-forwarded-for: ${req.headers['x-forwarded-for']}, cf-connecting-ip: ${req.headers['cf-connecting-ip']}, req.ip: ${req.ip})`);
    
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

    // Load offer configuration
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('google_ads_config, geo_pool')
      .eq('offer_name', offer_name)
      .single();

    if (offerError || !offer) {
      console.error(`[google-ads-click] Offer not found: ${offer_name}`);
      return res.status(404).json({ error: 'Offer not found' });
    }

    const googleAdsConfig = offer.google_ads_config || {};
    
    // Check if silent fetch mode is enabled (bypasses bucket logic entirely)
    if (googleAdsConfig.silent_fetch_enabled) {
      console.log(`[google-ads-click] Silent fetch mode enabled for ${offer_name}`);
      
      // Get tracking URL (use custom URL or fallback to offer URL)
      const trackingUrl = googleAdsConfig.silent_fetch_url || offer.url;
      
      // Log stats (async, non-blocking)
      logSilentFetchStats(offer_name, clientCountry, clientIp).catch(err => {
        console.error('[google-ads-click] Failed to log silent fetch stats:', err);
      });
      
      // Return HTML with client-side fetch (for cookies) + redirect
      const responseTime = Date.now() - startTime;
      console.log(`[google-ads-click] Silent fetch redirect completed in ${responseTime}ms`);
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="referrer" content="no-referrer">
  <title>Redirecting...</title>
  <script>
    // Client-side silent fetch - ensures cookies are set in user's browser
    (function() {
      var trackingUrl = ${JSON.stringify(trackingUrl)};
      var landingUrl = ${JSON.stringify(finalUrl)};
      
      // Fire tracking URL silently (cookies will be set in user's browser)
      fetch(trackingUrl, {
        method: 'GET',
        mode: 'no-cors', // Bypass CORS, don't need response
        credentials: 'include' // Include cookies
      }).catch(function(err) {
        console.log('Silent fetch error (expected):', err);
      });
      
      // Redirect to landing page after 100ms (gives time for fetch to start)
      setTimeout(function() {
        window.location.href = landingUrl;
      }, 100);
    })();
  </script>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
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
      console.log(`[google-ads-click] Click blocked: ${blockResult.reason}`);
      
      // If Google Ads says force_transparent, we MUST redirect even if blocked
      if (force_transparent === 'true') {
        console.log(`[google-ads-click] Force transparent override - redirecting despite block`);
        
        // Log the blocked click
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
        
        return res.redirect(302, finalUrl);
      }
      
      // Otherwise, reject the click
      return res.status(403).json({
        error: 'Click blocked',
        reason: blockResult.reason,
        message: 'This click was filtered by bot/IP protection'
      });
    }

    // Try to get suffix from bucket (with FOR UPDATE SKIP LOCKED for concurrency)
    const shouldUseRandomPoolCountry = geoPool.length > 0 && !geoPool.includes(normalizeCountryCode(clientCountry));
    const bucketTargetCountry = shouldUseRandomPoolCountry
      ? geoPool[Math.floor(Math.random() * geoPool.length)]
      : clientCountry;

    const { data: suffixData, error: suffixError } = await supabase
      .rpc('get_geo_suffix', {
        p_offer_name: offer_name,
        p_target_country: bucketTargetCountry
      });

    let redirectUrl = finalUrl;
    let hasSuffix = false;
    let eventId = null;

    if (suffixData && suffixData.length > 0) {
      // Got a suffix from bucket
      const suffix = suffixData[0];
      redirectUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}${suffix.suffix}`;
      hasSuffix = true;
      
      console.log(`[google-ads-click] Served suffix from bucket (${bucketTargetCountry}): ${suffix.suffix.substring(0, 50)}...`);
      
      // Log click event (fire and forget)
      logClickEvent(
        offer_name,
        suffix.suffix,
        clientCountry,
        req.ip,
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
 * Log silent fetch stats to database
 */
async function logSilentFetchStats(offerName, clientCountry, clientIp) {
  try {
    const { error } = await supabase
      .from('google_ads_silent_fetch_stats')
      .insert({
        offer_name: offerName,
        client_country: clientCountry,
        client_ip: clientIp,
        fetch_date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('[google-ads-click] Failed to log silent fetch stats:', error.message);
    }
  } catch (error) {
    console.error('[google-ads-click] Exception logging silent fetch stats:', error.message);
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
