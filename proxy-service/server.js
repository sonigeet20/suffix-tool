const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const https = require('https');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const UserAgent = require('user-agents');
const { createClient } = require('@supabase/supabase-js');
const { HttpsProxyAgent } = require('https-proxy-agent');
require('dotenv').config();

// Pre-import got at module level to avoid dynamic import overhead per hop
let gotModule = null;
(async () => {
  const { default: got } = await import('got');
  gotModule = got;
})();

const app = express();
const PORT = process.env.PORT || 3000;

// Create persistent agents for connection pooling
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let proxySettings = null;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Utility function to convert bytes to human-readable format
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'unknown';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.max(1, bytes)) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

class UserAgentRotator {
  constructor(options = {}) {
    this.mode = options.mode || process.env.USER_AGENT_MODE || 'dynamic';
    this.poolSize = parseInt(options.poolSize || process.env.USER_AGENT_POOL_SIZE || '10000');
    this.refreshIntervalHours = parseInt(process.env.USER_AGENT_REFRESH_INTERVAL_HOURS || '12');
    this.refreshInterval = this.refreshIntervalHours * 60 * 60 * 1000;

    this.pool = [];
    this.currentIndex = 0;
    this.lastRefresh = Date.now();
    this.totalGenerated = 0;
    this.uniqueGenerated = new Set();
    this.requestCount = 0;

    this.deviceCategories = [
      { deviceCategory: 'desktop', weight: 60 },
      { deviceCategory: 'mobile', weight: 30 },
      { deviceCategory: 'tablet', weight: 10 }
    ];

    logger.info(`UserAgentRotator initialized in '${this.mode}' mode with pool size: ${this.poolSize}`);

    if (this.mode === 'pool' || this.mode === 'hybrid') {
      this.refreshPool();
    }
  }

  generateRandomCategory() {
    const rand = Math.random() * 100;
    let cumulative = 0;

    for (const cat of this.deviceCategories) {
      cumulative += cat.weight;
      if (rand < cumulative) {
        return cat.deviceCategory;
      }
    }
    return 'desktop';
  }

  generateUserAgent() {
    const category = this.generateRandomCategory();
    const userAgent = new UserAgent({ deviceCategory: category });
    const uaString = userAgent.toString();

    this.totalGenerated++;
    this.uniqueGenerated.add(uaString);

    return uaString;
  }

  refreshPool() {
    logger.info(`Refreshing user agent pool with ${this.poolSize} agents...`);
    const startTime = Date.now();

    this.pool = [];
    const uniqueSet = new Set();

    while (uniqueSet.size < this.poolSize) {
      const ua = this.generateUserAgent();
      if (!uniqueSet.has(ua)) {
        uniqueSet.add(ua);
        this.pool.push(ua);
      }

      if (uniqueSet.size % 1000 === 0) {
        logger.info(`Generated ${uniqueSet.size}/${this.poolSize} unique user agents...`);
      }
    }

    this.currentIndex = 0;
    this.lastRefresh = Date.now();

    const duration = Date.now() - startTime;
    logger.info(`User agent pool refreshed with ${this.pool.length} unique agents in ${duration}ms`);
  }

  getNext() {
    this.requestCount++;

    if (this.mode === 'dynamic') {
      return this.generateUserAgent();
    }

    if (this.mode === 'pool' || this.mode === 'hybrid') {
      if (Date.now() - this.lastRefresh > this.refreshInterval) {
        this.refreshPool();
      }

      if (this.pool.length === 0) {
        if (this.mode === 'hybrid') {
          return this.generateUserAgent();
        }
        this.refreshPool();
      }

      const ua = this.pool[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.pool.length;
      return ua;
    }

    return this.generateUserAgent();
  }

  getRandom() {
    this.requestCount++;

    if (this.mode === 'dynamic') {
      return this.generateUserAgent();
    }

    if (this.mode === 'pool' || this.mode === 'hybrid') {
      if (Date.now() - this.lastRefresh > this.refreshInterval) {
        this.refreshPool();
      }

      if (this.pool.length === 0) {
        if (this.mode === 'hybrid') {
          return this.generateUserAgent();
        }
        this.refreshPool();
      }

      const randomIndex = Math.floor(Math.random() * this.pool.length);
      return this.pool[randomIndex];
    }

    return this.generateUserAgent();
  }

  getStats() {
    const stats = {
      mode: this.mode,
      poolSize: this.mode === 'dynamic' ? 'N/A (generates on-demand)' : this.pool.length,
      configuredPoolSize: this.poolSize,
      currentIndex: this.mode === 'dynamic' ? 'N/A' : this.currentIndex,
      lastRefresh: new Date(this.lastRefresh).toISOString(),
      nextRefresh: this.mode === 'dynamic' ? 'N/A' : new Date(this.lastRefresh + this.refreshInterval).toISOString(),
      refreshIntervalHours: this.refreshIntervalHours,
      totalRequests: this.requestCount,
      totalGenerated: this.totalGenerated,
      uniqueGenerated: this.uniqueGenerated.size,
      repetitionRate: this.requestCount > 0
        ? `${((1 - (this.uniqueGenerated.size / this.requestCount)) * 100).toFixed(2)}%`
        : '0%',
      estimatedDailyCapacity: this.mode === 'dynamic'
        ? 'Unlimited (generates fresh each time)'
        : `${this.poolSize} unique per cycle`,
      deviceDistribution: {
        desktop: '60%',
        mobile: '30%',
        tablet: '10%'
      }
    };

    return stats;
  }
}

const userAgentRotator = new UserAgentRotator();

const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.com/tr',
  'doubleclick.net',
  'analytics.google.com',
  'adservice.google.com',
  'facebook.net',
  'connect.facebook.net',
  'hotjar.com',
  'mouseflow.com',
  'crazyegg.com',
  'mixpanel.com',
  'segment.com',
  'amplitude.com',
  'optimizely.com',
  'quantserve.com',
  'scorecardresearch.com',
  'zopim.com',
  'livechat.com',
  'intercom.io',
  'drift.com',
  'tawk.to',
  'newrelic.com',
  'sentry.io',
  'bugsnag.com',
  'loggly.com',
];

let browser = null;

async function loadProxySettings() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('luna_proxy_host, luna_proxy_port, luna_proxy_username, luna_proxy_password')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error('No proxy settings found in database. Please configure Luna proxy credentials in settings table.');
    }

    if (!data.luna_proxy_host || !data.luna_proxy_port || !data.luna_proxy_username || !data.luna_proxy_password) {
      throw new Error('Incomplete proxy settings in database. Missing: ' +
        [
          !data.luna_proxy_host && 'luna_proxy_host',
          !data.luna_proxy_port && 'luna_proxy_port',
          !data.luna_proxy_username && 'luna_proxy_username',
          !data.luna_proxy_password && 'luna_proxy_password'
        ].filter(Boolean).join(', '));
    }

    proxySettings = {
      host: data.luna_proxy_host,
      port: data.luna_proxy_port,
      username: data.luna_proxy_username,
      password: data.luna_proxy_password,
    };

    logger.info('Proxy settings loaded from database:', {
      host: proxySettings.host,
      port: proxySettings.port,
    });

    return proxySettings;
  } catch (error) {
    logger.error('Failed to load proxy settings from database:', error);
    throw error;
  }
}

async function initBrowser() {
  if (browser) return browser;

  if (!proxySettings) {
    await loadProxySettings();
  }

  const proxyServer = `http://${proxySettings.host}:${proxySettings.port}`;

  logger.info('Initializing browser with proxy:', proxyServer);

  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080',
      `--proxy-server=${proxyServer}`,
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-client-side-phishing-detection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-domain-reliability',
      '--disable-component-extensions-with-background-pages',
      '--disable-ipc-flooding-protection',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  return browser;
}

async function fetchGeolocation(username = null, password = null) {
  try {
    if (!proxySettings) {
      await loadProxySettings();
    }

    const response = await axios.get('http://ip-api.com/json/', {
      proxy: {
        host: proxySettings.host,
        port: parseInt(proxySettings.port),
        auth: {
          username: username || proxySettings.username,
          password: password || proxySettings.password,
        },
      },
      timeout: 3000,
    });

    const data = response.data;
    return {
      ip: data.query || 'unknown',
      country: data.country || data.countryCode,
      city: data.city,
      region: data.regionName || data.region,
      full_data: data,
    };
  } catch (error) {
    logger.warn('Geolocation fetch error (non-critical):', error.message);
    return {
      ip: 'unknown',
      country: null,
      city: null,
      region: null,
      error: error.message,
    };
  }
}

async function traceRedirectsHttpOnly(url, options = {}) {
  const {
    maxRedirects = 20,
    timeout = 5000,
    userAgent = userAgentRotator.getNext(),
    targetCountry = null,
    referrer = null,
    proxyIp = null,
    proxyPort = null,
  } = options;

  // Lightweight HTML sniff patterns to mimic browser-like meta/JS redirects without full rendering
  const metaRefreshRegex = /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["'][^"'>]*url=([^"'>\s]+)/i;
  const jsRedirectRegex = /(window\.location|location\.href|location\.replace)\s*=\s*["']([^"']+)["']/i;
  const setTimeoutRedirectRegex = /setTimeout\s*\(\s*function\s*\(\)\s*{[^}]{0,200}?(?:window\.location|location\.href|location\.replace)\s*=\s*["']([^"']+)["']/i;

  logger.info(`⚡ HTTP-only INSTANT (GET + stream headers): ${url.substring(0, 80)}... | maxRedirects: ${maxRedirects}`);
  logger.info(`📱 User-Agent: ${userAgent.substring(0, 80)}...`);

  const chain = [];
  let currentUrl = url;
  let redirectCount = 0;
  const visitedUrls = new Set();
  const startBudget = Date.now();
  const budgetMs = timeout;

  if (!proxySettings) {
    await loadProxySettings();
  }

  let proxyUsername = proxyIp || proxySettings.username;
  const proxyPassword = proxySettings.password;
  const proxyHost = proxySettings.host;
  const proxyPortNum = parseInt(proxyPort || proxySettings.port);

  if (!proxyIp && targetCountry && targetCountry.length === 2 && !proxyUsername.includes('-region-')) {
    const countryCode = targetCountry.toLowerCase();
    proxyUsername = `${proxyUsername}-region-${countryCode}`;
    logger.info(`🌍 Geo-targeting: ${countryCode.toUpperCase()}`);
  }

  const proxyUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPortNum}`;
  const traceAgent = new HttpsProxyAgent(proxyUrl, {
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 20, // Increase for parallel speculation
    timeout: 15000,
  });

  // Track hop timings for adaptive timeout allocation (EMA)
  const hopTimings = [];
  
  // Wait for got module
  while (!gotModule) await new Promise(r => setTimeout(r, 10));
  const got = gotModule;

  // TRUE PARALLEL STREAMING STRATEGY:
  // Launch all hops in parallel, racing to get headers
  // As soon as we get a Location header, fire the next hop WITHOUT waiting
  // Final URL = first hop with no Location header or non-3xx status
  
  let hopIndex = 0;
  const allResults = [];
  let finalHopResolved = false;
  let hopCount = 0;
  let concurrentHops = 0;
  let maxConcurrentHops = 0;
  
  const launchHop = (url) => {
    hopCount++;
    concurrentHops++;
    if (concurrentHops > maxConcurrentHops) {
      maxConcurrentHops = concurrentHops;
    }
    
    const currentHopIndex = hopIndex++;
    const hopStart = Date.now();
    
    const remainingBudget = budgetMs - (Date.now() - startBudget);
    if (remainingBudget <= 0) {
      const result = {
        url,
        status: 0,
        redirect_type: 'error',
        method: 'timeout',
        error: 'Budget exceeded',
        timing_ms: 0,
        bandwidth_bytes: 0,
        hopIndex: currentHopIndex,
      };
      allResults.push(result);
      concurrentHops--;
      return;
    }
    
    // Aggressive timeout - we ONLY need headers, should be <2s through proxy
    const avgHopTime = hopTimings.length > 0 
      ? hopTimings.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, hopTimings.length)
      : 2000; // Realistic proxy roundtrip time
    
    const budgetPerHop = Math.max(3000, Math.min(remainingBudget * 0.7, avgHopTime * 1.5));
    
    logger.info(`  🚀 Hop ${currentHopIndex + 1} (parallel, concurrent=${concurrentHops}): ${url.substring(0, 60)}...`);
    
    // Use AbortController for instant cancellation
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), budgetPerHop);
    
    try {
      // Use got.stream() with AbortController for instant kill
      const stream = got.stream(url, {
        signal: abortController.signal,
        agent: { https: traceAgent, http: traceAgent },
        followRedirect: false,
        decompress: false,
        throwHttpErrors: false,
        headers: {
          'user-agent': userAgent,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'identity', // No compression - faster headers
          'connection': 'close', // Don't keep alive - we're killing it anyway
          ...(referrer ? { 'referer': referrer } : {}),
        },
        retry: { limit: 0 },
        timeout: {
          connect: 5000, // Max 5s to connect through proxy
          response: 1000, // Once connected, headers should arrive in <1s
        },
        method: 'GET',
      });
      
      // INSTANT ACTION: As soon as headers arrive, process and kill stream!
      stream.on('response', (response) => {
        const timing = Date.now() - hopStart;
        hopTimings.push(timing);
        
        const status = response.statusCode || 0;
        const headers = response.headers || {};
        const location = headers['location'];
        
        logger.info(`  ✅ Hop ${currentHopIndex + 1} (${status}) in ${timing}ms [parallel, concurrent=${concurrentHops}]`);
        
        const result = {
          url,
          status,
          redirect_type: status >= 300 && status < 400 ? 'http' : status >= 200 && status < 300 ? 'final' : 'error',
          method: 'parallel_stream',
          timing_ms: timing,
          bandwidth_bytes: 0,
          hopIndex: currentHopIndex,
        };
        
        // Extract params from final URL
        if (status >= 200 && status < 300) {
          const params = {};
          try {
            const urlObj = new URL(url);
            urlObj.searchParams.forEach((value, key) => {
              params[key] = value;
            });
            result.params = params;
          } catch (e) {}
        }
        
        // If 3xx with Location, launch next hop IMMEDIATELY (don't await!)
        if (status >= 300 && status < 400 && location) {
          try {
            const nextUrl = new URL(location, url).toString();
            
            if (!visitedUrls.has(nextUrl) && redirectCount < maxRedirects - 1) {
              visitedUrls.add(nextUrl);
              redirectCount++;
              
              allResults.push(result);
              
              // KILL EVERYTHING INSTANTLY - do this AFTER pushing result
              clearTimeout(timeoutId);
              stream.destroy(); // Destroy the stream
              try { response.destroy(); } catch (e) {} // Destroy the response
              
              // FIRE AND FORGET - launch next hop in background without waiting!
              launchHop(nextUrl);
              concurrentHops--;
              return;
            } else if (visitedUrls.has(nextUrl)) {
              result.error = 'Loop detected';
              result.redirect_type = 'error';
              finalHopResolved = true;
            }
          } catch (e) {
            result.error = `Invalid URL: ${location}`;
            result.redirect_type = 'error';
            finalHopResolved = true;
          }
        } else if (status >= 200 && status < 300) {
          // Final destination - trace ends here
          logger.info(`  🎯 Final URL reached at hop ${currentHopIndex + 1}`);
          finalHopResolved = true;
        } else {
          // Error status - trace ends here
          logger.info(`  ⚠️ Error status ${status} at hop ${currentHopIndex + 1}`);
          finalHopResolved = true;
        }
        
        allResults.push(result);
        
        // KILL STREAMS after processing
        clearTimeout(timeoutId);
        stream.destroy();
        try { response.destroy(); } catch (e) {}
        concurrentHops--;
      });
      
      stream.on('error', (err) => {
        clearTimeout(timeoutId);
        
        const timing = Date.now() - hopStart;
        hopTimings.push(timing);
        
        // Check if this is a timeout abort (intentional)
        if (err.name === 'AbortError' || err.code === 'ERR_ABORTED') {
          logger.info(`  ⏱️ Hop ${currentHopIndex + 1} timeout after ${timing}ms`);
          
          const result = {
            url,
            status: 0,
            redirect_type: 'error',
            method: 'parallel_stream',
            error: 'Request timeout',
            timing_ms: timing,
            bandwidth_bytes: 0,
            hopIndex: currentHopIndex,
          };
          
          allResults.push(result);
          finalHopResolved = true;
          concurrentHops--;
          return;
        }
        
        // Other errors
        logger.info(`  ❌ Hop ${currentHopIndex + 1} error: ${err.code || err.message}`);
        
        const result = {
          url,
          status: 0,
          redirect_type: 'error',
          method: 'parallel_stream',
          error: err.code || err.message,
          timing_ms: timing,
          bandwidth_bytes: 0,
          hopIndex: currentHopIndex,
        };
        
        allResults.push(result);
        finalHopResolved = true;
        concurrentHops--;
      });
      
    } catch (err) {
      clearTimeout(timeoutId);
      
      const timing = Date.now() - hopStart;
      hopTimings.push(timing);
      
      logger.info(`  ❌ Hop ${currentHopIndex + 1} error: ${err.code || err.message}`);
      
      const result = {
        url,
        status: 0,
        redirect_type: 'error',
        method: 'parallel_stream',
        error: err.code || err.message,
        timing_ms: timing,
        bandwidth_bytes: 0,
        hopIndex: currentHopIndex,
      };
      
      allResults.push(result);
      finalHopResolved = true;
      concurrentHops--;
    }
  };
  
  // Launch first hop (non-blocking)
  visitedUrls.add(currentUrl);
  launchHop(currentUrl);
  
  // Wait for final hop to be reached or timeout
  const startWait = Date.now();
  while (!finalHopResolved && (Date.now() - startWait) < budgetMs) {
    await new Promise(r => setTimeout(r, 100)); // Check every 100ms
  }
  
  // Sort by hop index to maintain order
  allResults.sort((a, b) => a.hopIndex - b.hopIndex);
  
  // Build chain from results
  for (const result of allResults) {
    const { hopIndex, ...chainEntry } = result;
    chain.push(chainEntry);
  }

  if (redirectCount >= maxRedirects) {
    chain.push({
      url: 'max_redirects_reached',
      status: 0,
      redirect_type: 'error',
      method: 'limit',
      error: `Max ${maxRedirects} redirects`,
    });
  }

  const totalBandwidth = chain.reduce((sum, e) => sum + (e.bandwidth_bytes || 0), 0);
  const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

  logger.info(`✅ HTTP-only trace complete: ${chain.length} steps (${hopCount} hops launched, max concurrent=${maxConcurrentHops}), ${formatBytes(totalBandwidth)}`);

  return {
    success: chain.length > 0 && chain[chain.length - 1].redirect_type !== 'error',
    chain,
    total_steps: chain.length,
    final_url: chain.length > 0 ? chain[chain.length - 1].url : url,
    user_agent: userAgent,
    total_bandwidth_bytes: totalBandwidth,
    bandwidth_per_step_bytes: Math.round(avgBandwidth),
    parallel_metrics: {
      total_hops_launched: hopCount,
      max_concurrent_hops: maxConcurrentHops,
      execution_model: 'true_parallel_streaming',
    },
  };
}

async function traceRedirectsBrowser(url, options = {}) {
  const {
    maxRedirects = 20,
    timeout = 60000,
    userAgent = userAgentRotator.getNext(),
    targetCountry = null,
    referrer = null,
  } = options;

  const chain = [];
  const popupChains = [];
  let browser = null;
  let page = null;

  try {
    browser = await initBrowser();
    page = await browser.newPage();

    if (!proxySettings) {
      await loadProxySettings();
    }

    let proxyUsername = proxySettings.username;

    if (targetCountry && targetCountry.length === 2) {
      const countryCode = targetCountry.toLowerCase();
      if (!proxyUsername.includes('-region-')) {
        proxyUsername = `${proxyUsername}-region-${countryCode}`;
        logger.info(`🌍 Browser geo-targeting: ${countryCode.toUpperCase()}`);
      }
    }

    await page.authenticate({
      username: proxyUsername,
      password: proxySettings.password,
    });

    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1920, height: 1080 });

    if (referrer) {
      await page.setExtraHTTPHeaders({
        'Referer': referrer,
      });
      logger.info(`🔗 Browser using custom referrer: ${referrer}`);
    }

    await page.evaluateOnNewDocument(() => {
      const style = document.createElement('style');
      style.textContent = `
        * {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
      });
    });

    await page.setRequestInterception(true);

    const redirectChain = [];
    let requestCount = 0;
    let lastUrlChange = Date.now();

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        lastUrlChange = Date.now();
      }
    });

    page.on('request', (request) => {
      const resourceType = request.resourceType();

      if (resourceType === 'document') {
        const startTime = Date.now();
        redirectChain.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          startTime,
        });
        requestCount++;
      }

      const blockedTypes = ['image', 'stylesheet', 'font', 'media', 'imageset', 'texttrack', 'websocket', 'manifest', 'other'];
      const requestUrl = request.url();
      const shouldBlockDomain = BLOCKED_DOMAINS.some(domain => requestUrl.includes(domain));

      if (blockedTypes.includes(resourceType) || shouldBlockDomain) {
        request.abort();
      } else {
        // Override headers to maintain the same referrer across all hops
        if (referrer && resourceType === 'document') {
          const overrideHeaders = {
            ...request.headers(),
            'Referer': referrer,
          };
          request.continue({ headers: overrideHeaders });
        } else {
          request.continue();
        }
      }
    });

    page.on('response', async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();

      if (resourceType === 'document') {
        const url = response.url();
        const status = response.status();
        const headers = response.headers();

        const matchingRequest = redirectChain.find(r => r.url === url);
        const timing = matchingRequest ? Date.now() - matchingRequest.startTime : 0;

        const params = {};
        try {
          const urlObj = new URL(url);
          urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
          });
        } catch (e) {}

        const contentLength = headers['content-length'];
        const bandwidthBytes = contentLength ? parseInt(contentLength) : null;

        let redirectType = 'http';
        if (status >= 300 && status < 400) {
          redirectType = 'http';
        } else if (status >= 200 && status < 300) {
          redirectType = 'final';
        } else {
          redirectType = 'error';
        }

        chain.push({
          url,
          status,
          redirect_type: redirectType,
          method: 'browser',
          headers,
          params,
          timing_ms: timing,
          bandwidth_bytes: bandwidthBytes,
          error: status >= 400 ? `HTTP ${status}` : undefined,
        });
      }
    });

    page.on('popup', async (popup) => {
      const popupIndex = popupChains.length + 1;
      logger.info(`🪟 Browser mode: Popup #${popupIndex} detected!`);

      const openerUrl = page.url();
      const popupChain = [];

      try {
        await popup.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => {});
        const popupUrl = popup.url();

        const popupParams = {};
        try {
          const urlObj = new URL(popupUrl);
          urlObj.searchParams.forEach((value, key) => {
            popupParams[key] = value;
          });
        } catch (e) {}

        popupChain.push({
          url: popupUrl,
          status: 200,
          redirect_type: 'popup',
          method: 'window.open',
          params: popupParams,
          timing_ms: 0,
        });

        popupChains.push({
          popup_index: popupIndex,
          opener_url: openerUrl,
          final_url: popupUrl,
          chain: popupChain,
        });

        await popup.close();
      } catch (err) {
        logger.error(`Error handling popup #${popupIndex}:`, err.message);
      }
    });

    const navigationPromise = page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });

    const idleDetectionPromise = new Promise((resolve) => {
      const checkIdle = setInterval(() => {
        const timeSinceLastChange = Date.now() - lastUrlChange;
        // Wait 2 seconds of no URL changes before early stop
        // Optimized for faster execution while allowing JS redirects
        if (timeSinceLastChange > 2000) {
          clearInterval(checkIdle);
          logger.info('⚡ Browser: Early stop - no URL changes for 2s');
          resolve();
        }
      }, 200);

      setTimeout(() => {
        clearInterval(checkIdle);
        resolve();
      }, timeout);
    });

    await Promise.race([navigationPromise, idleDetectionPromise]);

    const finalUrl = page.url();
    if (chain.length === 0 || chain[chain.length - 1].url !== finalUrl) {
      const finalParams = {};
      try {
        const urlObj = new URL(finalUrl);
        urlObj.searchParams.forEach((value, key) => {
          finalParams[key] = value;
        });
      } catch (e) {}

      chain.push({
        url: finalUrl,
        status: 200,
        redirect_type: 'final',
        method: 'browser',
        params: finalParams,
        timing_ms: 0,
        bandwidth_bytes: null,
      });
    }

    const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
    const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

    return {
      success: true,
      chain,
      popup_chains: popupChains,
      total_popups: popupChains.length,
      total_steps: chain.length,
      final_url: finalUrl,
      user_agent: userAgent,
      total_bandwidth_bytes: totalBandwidth,
      bandwidth_per_step_bytes: Math.round(avgBandwidth),
      execution_model: 'browser_full_rendering',
    };

  } catch (error) {
    logger.error('Browser trace error:', error);

    if (chain.length === 0) {
      chain.push({
        url,
        status: 0,
        redirect_type: 'error',
        method: 'browser',
        error: error.message,
        timing_ms: 0,
        bandwidth_bytes: null,
      });
    }

    const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
    const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

    return {
      success: false,
      chain,
      popup_chains: popupChains,
      total_popups: popupChains.length,
      total_steps: chain.length,
      final_url: url,
      error: error.message,
      total_bandwidth_bytes: totalBandwidth,
      bandwidth_per_step_bytes: Math.round(avgBandwidth),
      execution_model: 'browser_full_rendering',
    };
  } finally {
    if (page) {
      await page.close().catch(e => logger.error('Failed to close page:', e));
    }
  }
}

async function traceRedirectsAntiCloaking(url, options = {}) {
  const {
    maxRedirects = 20,
    timeout = 90000,
    userAgent = userAgentRotator.getNext(),
    targetCountry = null,
    referrer = null,
  } = options;

  const chain = [];
  const popupChains = [];
  const obfuscatedUrls = [];
  const cloakingIndicators = [];
  let browser = null;
  let page = null;
  let aggressivenessLevel = 'low';

  try {
    browser = await initBrowser();
    page = await browser.newPage();

    if (!proxySettings) {
      await loadProxySettings();
    }

    let proxyUsername = proxySettings.username;

    if (targetCountry && targetCountry.length === 2) {
      const countryCode = targetCountry.toLowerCase();
      if (!proxyUsername.includes('-region-')) {
        proxyUsername = `${proxyUsername}-region-${countryCode}`;
        logger.info(`🕵️ Anti-cloaking geo-targeting: ${countryCode.toUpperCase()}`);
      }
    }

    await page.authenticate({
      username: proxyUsername,
      password: proxySettings.password,
    });

    await page.setUserAgent(userAgent);
    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100)
    });

    if (referrer) {
      await page.setExtraHTTPHeaders({
        'Referer': referrer,
      });
      logger.info(`🔗 Anti-cloaking using custom referrer: ${referrer}`);
    }

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      window.chrome = {
        runtime: {},
      };

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      const style = document.createElement('style');
      style.textContent = `
        * {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
      });
    });

    await page.setRequestInterception(true);

    const redirectChain = [];
    let requestCount = 0;
    let lastUrlChange = Date.now();

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        lastUrlChange = Date.now();
      }
    });

    page.on('request', (request) => {
      const resourceType = request.resourceType();

      if (resourceType === 'document') {
        const startTime = Date.now();
        redirectChain.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          startTime,
        });
        requestCount++;
      }

      const blockedTypes = ['image', 'stylesheet', 'font', 'media', 'imageset', 'texttrack', 'websocket', 'manifest', 'other'];
      const requestUrl = request.url();
      const shouldBlockDomain = BLOCKED_DOMAINS.some(domain => requestUrl.includes(domain));

      if (blockedTypes.includes(resourceType) || shouldBlockDomain) {
        request.abort();
      } else {
        // Override headers to maintain the same referrer across all hops
        if (referrer && resourceType === 'document') {
          const overrideHeaders = {
            ...request.headers(),
            'Referer': referrer,
          };
          request.continue({ headers: overrideHeaders });
        } else {
          request.continue();
        }
      }
    });

    page.on('response', async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();

      if (resourceType === 'document') {
        const url = response.url();
        const status = response.status();
        const headers = response.headers();

        const matchingRequest = redirectChain.find(r => r.url === url);
        const timing = matchingRequest ? Date.now() - matchingRequest.startTime : 0;

        const params = {};
        try {
          const urlObj = new URL(url);
          urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
          });
        } catch (e) {}

        const contentLength = headers['content-length'];
        const bandwidthBytes = contentLength ? parseInt(contentLength) : null;

        let redirectType = 'http';
        if (status >= 300 && status < 400) {
          redirectType = 'http';
        } else if (status >= 200 && status < 300) {
          redirectType = 'final';
        } else {
          redirectType = 'error';
        }

        chain.push({
          url,
          status,
          redirect_type: redirectType,
          method: 'anti_cloaking',
          headers,
          params,
          timing_ms: timing,
          bandwidth_bytes: bandwidthBytes,
          error: status >= 400 ? `HTTP ${status}` : undefined,
        });
      }
    });

    page.on('popup', async (popup) => {
      const popupIndex = popupChains.length + 1;
      logger.info(`🪟 Popup #${popupIndex} detected!`);

      const openerUrl = page.url();
      const popupChain = [];

      try {
        await popup.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => {});
        const popupUrl = popup.url();

        popupChain.push({
          url: popupUrl,
          status: 200,
          redirect_type: 'popup',
          method: 'window.open',
          timing_ms: 0,
        });

        popupChains.push({
          popup_index: popupIndex,
          opener_url: openerUrl,
          final_url: popupUrl,
          chain: popupChain,
        });

        await popup.close();
      } catch (err) {
        logger.error(`Error handling popup #${popupIndex}:`, err.message);
      }
    });

    const navigationPromise = page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });

    const idleDetectionPromise = new Promise((resolve) => {
      const checkIdle = setInterval(() => {
        const timeSinceLastChange = Date.now() - lastUrlChange;
        // Wait 2 seconds for JavaScript redirects to execute (optimized)
        if (timeSinceLastChange > 2000) {
          clearInterval(checkIdle);
          logger.info('⚡ Anti-cloaking: Early stop - no URL changes for 2s');
          resolve();
        }
      }, 200);

      setTimeout(() => {
        clearInterval(checkIdle);
        resolve();
      }, timeout);
    });

    await Promise.race([navigationPromise, idleDetectionPromise]);

    // Single mouse movement for lightweight human simulation
    await page.mouse.move(150 + Math.random() * 100, 150 + Math.random() * 100);

    const pageContent = await page.content();

    if (pageContent.includes('data:text/html') || pageContent.includes('atob(') || pageContent.includes('fromCharCode')) {
      cloakingIndicators.push('obfuscated_code');
    }

    if (pageContent.match(/navigator\.webdriver|bot|crawler|spider/i)) {
      cloakingIndicators.push('bot_detection');
    }

    if (pageContent.match(/setTimeout.*redirect|setInterval.*redirect/i)) {
      cloakingIndicators.push('delayed_redirect');
    }

    if (popupChains.length > 2) {
      aggressivenessLevel = 'high';
    } else if (popupChains.length > 0 || cloakingIndicators.length > 0) {
      aggressivenessLevel = 'medium';
    }

    const finalUrl = page.url();
    if (chain.length === 0 || chain[chain.length - 1].url !== finalUrl) {
      const finalParams = {};
      try {
        const urlObj = new URL(finalUrl);
        urlObj.searchParams.forEach((value, key) => {
          finalParams[key] = value;
        });
      } catch (e) {}

      chain.push({
        url: finalUrl,
        status: 200,
        redirect_type: 'final',
        method: 'anti_cloaking',
        params: finalParams,
        timing_ms: 0,
        bandwidth_bytes: null,
      });
    }

    const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
    const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

    return {
      success: true,
      chain,
      popup_chains: popupChains,
      obfuscated_urls: obfuscatedUrls,
      cloaking_indicators: cloakingIndicators,
      aggressiveness_level: aggressivenessLevel,
      total_popups: popupChains.length,
      total_steps: chain.length,
      final_url: finalUrl,
      user_agent: userAgent,
      total_bandwidth_bytes: totalBandwidth,
      bandwidth_per_step_bytes: Math.round(avgBandwidth),
      execution_model: 'anti_cloaking_stealth',
    };

  } catch (error) {
    logger.error('Anti-cloaking trace error:', error);

    if (chain.length === 0) {
      chain.push({
        url,
        status: 0,
        redirect_type: 'error',
        method: 'anti_cloaking',
        error: error.message,
        timing_ms: 0,
        bandwidth_bytes: null,
      });
    }

    const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
    const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

    return {
      success: false,
      chain,
      popup_chains: popupChains,
      obfuscated_urls: obfuscatedUrls,
      cloaking_indicators: cloakingIndicators,
      aggressiveness_level: aggressivenessLevel,
      total_popups: popupChains.length,
      total_steps: chain.length,
      final_url: url,
      error: error.message,
      total_bandwidth_bytes: totalBandwidth,
      bandwidth_per_step_bytes: Math.round(avgBandwidth),
      execution_model: 'anti_cloaking_stealth',
    };
  } finally {
    if (page) {
      await page.close().catch(e => logger.error('Failed to close page:', e));
    }
  }
}

app.post('/trace', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      url,
      max_redirects,
      timeout_ms,
      user_agent,
      target_country,
      referrer,
      mode = 'browser',
      proxy_ip,
      proxy_port,
      follow_http_only,
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    logger.info('⚡ Trace request:', {
      url,
      mode,
      max_redirects,
      timeout_ms,
      target_country,
      referrer,
      proxy_ip,
      proxy_port,
      follow_http_only,
    });

    if (!proxySettings) {
      await loadProxySettings();
    }

    let geoUsername = proxy_ip || proxySettings.username;
    if (target_country && target_country.length === 2) {
      const countryCode = target_country.toLowerCase();
      if (!geoUsername.includes('-region-')) {
        geoUsername = `${geoUsername}-region-${countryCode}`;
        logger.info(`🌍 Geo-targeting: ${countryCode.toUpperCase()}`);
      }
    }

    const geoPromise = fetchGeolocation(geoUsername, proxySettings.password);

    let tracePromise;
    if (mode === 'http_only') {
      logger.info('⚡ Using HTTP-only mode (fast)');
      tracePromise = traceRedirectsHttpOnly(url, {
        maxRedirects: max_redirects || 20,
        timeout: timeout_ms || 5000,
        userAgent: user_agent || userAgentRotator.getNext(),
        targetCountry: target_country || null,
        referrer: referrer || null,
        proxyIp: proxy_ip || null,
        proxyPort: proxy_port || null,
      });
    } else if (mode === 'anti_cloaking') {
      logger.info('🕵️ Using Anti-Cloaking mode (advanced stealth)');
      tracePromise = traceRedirectsAntiCloaking(url, {
        maxRedirects: max_redirects || 20,
        timeout: timeout_ms || 90000,
        userAgent: user_agent || userAgentRotator.getNext(),
        targetCountry: target_country || null,
        referrer: referrer || null,
      });
    } else {
      logger.info('🌐 Using Browser mode (full rendering)');
      tracePromise = traceRedirectsBrowser(url, {
        maxRedirects: max_redirects || 20,
        timeout: timeout_ms || 60000,
        userAgent: user_agent || userAgentRotator.getNext(),
        targetCountry: target_country || null,
        referrer: referrer || null,
      });
    }

    const [result, geoData] = await Promise.all([tracePromise, geoPromise]);

    const totalTime = Date.now() - startTime;
    const bandwidthFormatted = formatBytes(result.total_bandwidth_bytes);
    logger.info(`✅ Trace completed (${mode}): ${result.total_steps} steps in ${totalTime}ms | ${bandwidthFormatted} transferred`);
    logger.info(`📊 Bandwidth details: total=${result.total_bandwidth_bytes}B, avg_per_step=${result.bandwidth_per_step_bytes}B`);

    res.json({
      ...result,
      proxy_used: true,
      proxy_type: 'residential',
      proxy_ip: geoData.ip,
      geo_location: {
        country: geoData.country,
        city: geoData.city,
        region: geoData.region,
      },
      total_timing_ms: totalTime,
      total_bandwidth_formatted: formatBytes(result.total_bandwidth_bytes),
      mode_used: mode,
    });

  } catch (error) {
    logger.error('Request error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    browser_initialized: !!browser,
    modes_supported: ['http_only', 'browser', 'anti_cloaking'],
  });
});

app.get('/ip', async (req, res) => {
  try {
    if (!proxySettings) {
      await loadProxySettings();
    }

    const response = await axios.get('https://api.ipify.org?format=json', {
      proxy: {
        host: proxySettings.host,
        port: parseInt(proxySettings.port),
        auth: {
          username: proxySettings.username,
          password: proxySettings.password,
        },
      },
    });

    res.json({
      proxy_ip: response.data.ip,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('IP check error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/user-agent-stats', (req, res) => {
  res.json({
    ...userAgentRotator.getStats(),
    description: 'User agent rotation stats - pool refreshes every hour with fresh agents'
  });
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Proxy service running on 0.0.0.0:${PORT}`);
  logger.info('Supported modes: http_only (fast), browser (full rendering), anti_cloaking (advanced stealth)');

  try {
    await loadProxySettings();
    logger.info('Luna Proxy configured from database:', {
      host: proxySettings.host,
      port: proxySettings.port,
    });
  } catch (error) {
    logger.error('Failed to load proxy settings on startup:', error);
  }
});
