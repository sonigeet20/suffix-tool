/**
 * Trackier Trace Integration
 * 
 * Provides endpoints for running traces within Trackier setup modal
 * - Run single trace to extract query parameters
 * - Auto-detect parameters for p1-p10 mapping
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

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

/**
 * POST /api/trackier-trace-once
 * 
 * Runs a single trace on a URL and returns:
 * - resolved_final_url: The final URL after all redirects
 * - query_params: All query parameters found (from final URL + Location headers)
 * - redirect_chain: List of all URLs visited
 * 
 * Body:
 * {
 *   final_url: string (required) - URL to trace
 *   tracer_mode: 'http_only' | 'browser' (default: http_only)
 *   max_redirects: number (default: 20)
 *   timeout_ms: number (default: 45000)
 *   extract_from_location_header: boolean (default: false)
 *   location_extract_hop: number | null (which hop, null = last)
 * }
 */
router.post('/trackier-trace-once', async (req, res) => {
  try {
    const {
      final_url,
      tracer_mode = 'http_only',
      max_redirects = 20,
      timeout_ms = 45000,
      extract_from_location_header = false,
      location_extract_hop = null,
    } = req.body;

    if (!final_url) {
      return res.status(400).json({ error: 'final_url is required' });
    }

    console.log('[Trackier Trace] Starting trace for:', final_url);
    console.log('[Trackier Trace] Mode:', tracer_mode);
    console.log('[Trackier Trace] Extract from location header:', extract_from_location_header);

    // Call the appropriate tracer
    let result;

    if (tracer_mode === 'browser') {
      // Use browser tracer
      result = await traceRedirectsBrowser(
        final_url,
        max_redirects,
        timeout_ms,
        extract_from_location_header,
        location_extract_hop
      );
    } else {
      // Default to http_only
      result = await traceRedirectsHttpOnly(
        final_url,
        max_redirects,
        timeout_ms,
        extract_from_location_header,
        location_extract_hop
      );
    }

    // Extract query parameters from final URL and location headers
    const query_params = extractQueryParams(result);

    console.log('[Trackier Trace] Completed. Params found:', Object.keys(query_params));

    res.json({
      success: true,
      resolved_final_url: result.final_url,
      query_params: query_params,
      redirect_chain: result.redirect_chain,
      duration_ms: result.duration_ms,
    });
  } catch (error) {
    console.error('[Trackier Trace] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Trace failed',
    });
  }
});

/**
 * Extract query parameters from a URL and Location header values
 */
function extractQueryParams(traceResult) {
  const params = {};

  try {
    // Extract from final URL
    if (traceResult.final_url) {
      const url = new URL(traceResult.final_url);
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    // Extract from location headers if available
    if (traceResult.location_headers && Array.isArray(traceResult.location_headers)) {
      traceResult.location_headers.forEach((header) => {
        if (header && typeof header === 'string' && header.includes('?')) {
          const url = new URL(header);
          url.searchParams.forEach((value, key) => {
            if (!params[key]) {
              // Don't override params from final URL
              params[key] = value;
            }
          });
        }
      });
    }
  } catch (error) {
    console.error('[Trackier Trace] Error extracting params:', error);
  }

  return params;
}

/**
 * Simple HTTP-only tracer using axios
 */
async function traceRedirectsHttpOnly(
  url,
  maxRedirects = 20,
  timeoutMs = 45000,
  extractFromLocationHeader = false,
  locationExtractHop = null
) {
  const startTime = Date.now();
  const redirect_chain = [];
  const location_headers = [];
  let currentUrl = url;
  let finalUrl = url;
  let hopCount = 0;

  try {
    for (let i = 0; i < maxRedirects; i++) {
      redirect_chain.push(currentUrl);
      hopCount++;

      try {
        const response = await axios.get(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          maxRedirects: 0,  // Don't follow redirects automatically
          validateStatus: () => true,  // Accept all status codes
          timeout: Math.min(5000, timeoutMs),
        });

        // Check for redirect
        const location = response.headers.location || response.headers.Location;
        if (location && response.status >= 300 && response.status < 400) {
          location_headers.push(location);

          // If we should extract from this hop
          if (extractFromLocationHeader && (locationExtractHop === null || locationExtractHop === hopCount)) {
            finalUrl = location;
          }

          // Follow redirect
          try {
            currentUrl = new URL(location, currentUrl).href;
          } catch (e) {
            currentUrl = location;
          }
          continue;
        }

        // No redirect, we're done
        finalUrl = currentUrl;
        break;
      } catch (error) {
        console.log('[Trackier Trace] Fetch error at hop', hopCount, ':', error.message);
        finalUrl = currentUrl;
        break;
      }
    }
  } catch (error) {
    console.error('[Trackier Trace] Critical error:', error.message);
    finalUrl = currentUrl;
  }

  return {
    final_url: finalUrl,
    redirect_chain,
    location_headers,
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Browser tracer stub (can be enhanced later with Puppeteer if needed)
 */
async function traceRedirectsBrowser(
  url,
  maxRedirects,
  timeoutMs,
  extractFromLocationHeader,
  locationExtractHop
) {
  // For now, fall back to HTTP-only
  // Could be enhanced with Puppeteer if needed
  return traceRedirectsHttpOnly(url, maxRedirects, timeoutMs, extractFromLocationHeader, locationExtractHop);
}

module.exports = router;
