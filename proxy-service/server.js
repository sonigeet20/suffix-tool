const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const UserAgent = require('user-agents');
const { createClient } = require('@supabase/supabase-js');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { traceRedirectsInteractive } = require('./trace-interactive');
const GeoRotator = require('./lib/geo-rotator');
const dns = require('dns').promises;
require('dotenv').config();

// Pre-import got at module level to avoid dynamic import overhead per hop
let gotModule = null;
(async () => {
  const { default: got } = await import('got');
  gotModule = got;
})();

const app = express();
const PORT = process.env.PORT || 3000;

// Optimization #4: Pre-warm DNS for common affiliate domains
const COMMON_AFFILIATE_DOMAINS = [
  'pepperjamnetwork.com', 'cj.com', 'shareasale.com', 'awin1.com',
  'gotrackier.com', 'tradedoubler.com', 'adform.net', 'impact.com'
];
COMMON_AFFILIATE_DOMAINS.forEach(domain => {
  dns.resolve(domain).catch(() => {});
});

// Optimization #3: Final URL patterns for early stopping
const FINAL_URL_PATTERNS = [
  /\/(product|item|p|shop|pd|dp)\/[^/]+$/i,
  /\/cart|checkout|basket|buy/i,
  /\?utm_source=|&aff_|&clickid=|&affiliate=/i,
  /\.(html?|php|aspx?)$/i
];

// Create persistent agents for connection pooling
// NOTE: These are ONLY used for non-proxy HTTPS calls (like health checks)
// For proxy-based requests, we create fresh agents per request to ensure IP rotation
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: false,  // Disable for fresh connections
  timeout: 60000,
});

const httpAgent = new http.Agent({
  keepAlive: false,  // Disable for fresh connections
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

function generateSessionId(length = 16) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function buildProxyUsername(baseUsername, selectedCountry, existingHasRegion = false) {
  let username = baseUsername;

  if (selectedCountry && !existingHasRegion && !username.includes('-region-')) {
    username = `${username}-region-${selectedCountry.toLowerCase()}`;
  }

  const sessId = generateSessionId();
  username = `${username}-sessid-${sessId}-sesstime-90`;
  return username;
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

// Detect device type from user agent string
function detectDeviceType(userAgent) {
  const ua = userAgent.toLowerCase();
  
  if (/mobile|android|iphone|ipod|windows phone|blackberry|iemobile/.test(ua)) {
    return 'mobile';
  } else if (/ipad|tablet|playbook|silk|android 3|android 4/.test(ua)) {
    return 'tablet';
  }
  return 'desktop';
}

// Unique fingerprint generator per trace - now synced with user agent
function generateBrowserFingerprint(userAgent) {
  const deviceType = detectDeviceType(userAgent);

  // Randomize Accept-Language with various locale combinations
  const languages = [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.8',
    'en-US,en;q=0.8,fr;q=0.6',
    'en-US,en;q=0.7,es;q=0.5',
    'en-US,en;q=0.9,de;q=0.8',
    'en,en-US;q=0.8',
    'en-CA,en;q=0.9',
    'en-IE,en;q=0.8',
  ];
  const language = languages[Math.floor(Math.random() * languages.length)];

  // Randomize Accept-Encoding
  const encodings = [
    'gzip, deflate, br',
    'gzip, deflate',
    'br, gzip, deflate',
    'gzip, deflate, br, zstd',
  ];
  const encoding = encodings[Math.floor(Math.random() * encodings.length)];

  // Random timezone offset simulation
  const timezones = [
    'UTC', 'GMT', 'GMT+0', 'GMT-1', 'GMT-2', 'GMT-3', 'GMT-4', 'GMT-5',
    'GMT-6', 'GMT-7', 'GMT-8', 'GMT-9', 'GMT-10', 'GMT-11', 'GMT-12',
  ];
  const timezone = timezones[Math.floor(Math.random() * timezones.length)];

  // Device-specific screen resolutions
  let baseResolutions;
  let pixelRatios;
  
  if (deviceType === 'mobile') {
    // Mobile resolutions
    baseResolutions = [
      { width: 375, height: 667 },   // iPhone 6/7/8
      { width: 414, height: 896 },   // iPhone 11/XR
      { width: 390, height: 844 },   // iPhone 12/13
      { width: 393, height: 851 },   // Pixel 6
      { width: 412, height: 915 },   // Android
    ];
    // Mobile typically has higher pixel ratio
    pixelRatios = [2, 2.5, 3];
  } else if (deviceType === 'tablet') {
    // Tablet resolutions
    baseResolutions = [
      { width: 768, height: 1024 },  // iPad
      { width: 810, height: 1080 },  // iPad Air
      { width: 834, height: 1194 },  // iPad Pro 11"
      { width: 1024, height: 1366 }, // iPad Pro 12.9"
    ];
    pixelRatios = [1.5, 2];
  } else {
    // Desktop resolutions
    baseResolutions = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1200 },
    ];
    // Desktop typically has lower pixel ratio
    pixelRatios = [1, 1.25, 1.5];
  }

  const baseRes = baseResolutions[Math.floor(Math.random() * baseResolutions.length)];
  const viewport = {
    width: baseRes.width + Math.floor(Math.random() * 20 - 10),
    height: baseRes.height + Math.floor(Math.random() * 20 - 10),
  };

  // Color depth variation
  const colorDepths = [24, 32];
  const colorDepth = colorDepths[Math.floor(Math.random() * colorDepths.length)];

  // Pixel ratio (device-specific)
  const pixelRatio = pixelRatios[Math.floor(Math.random() * pixelRatios.length)];

  return {
    language,
    encoding,
    timezone,
    viewport,
    colorDepth,
    pixelRatio,
    deviceType,
  };
}

// Minimal blocking list - only block heavy trackers that may interfere
// Keeping it minimal to avoid detection and allow normal page behavior
const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.com/tr',
  'facebook.net',
  'hotjar.com',
  'clarity.ms',
  'mouseflow.com',
  'crazyegg.com',
  'mixpanel.com',
  'segment.com',
  'amplitude.com',
  'fullstory.com',
];

// Unified resource types to block in browser-based modes to reduce bandwidth
const BLOCKED_RESOURCE_TYPES = [
  'image',
  'stylesheet',
  'font',
  'media',
  'imageset',
  'texttrack',
  'websocket',
  'manifest',
  'other',
  'xhr',      // Block AJAX requests (analytics, tracking)
  'fetch',    // Block Fetch API requests
  'eventsource', // Block Server-Sent Events
  'ping',     // Block beacon/ping requests
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

async function initBrowser(forceNew = false) {
  // If forceNew=true (for traces), always launch fresh browser to get new IP
  // If forceNew=false (for health checks), reuse existing browser
  if (!forceNew && browser) return browser;

  if (!proxySettings) {
    await loadProxySettings();
  }

  const host = proxySettings.host;
  const port = proxySettings.port;

  // CRITICAL: Chrome/Chromium doesn't support auth in --proxy-server URL
  // We'll use page.authenticate() instead after browser launches
  const proxyServer = `http://${host}:${port}`;

  logger.info(forceNew ? 'Launching fresh browser for new IP' : 'Initializing browser with proxy:', proxyServer);

  // macOS workaround: Try to use system Chrome if bundled Chromium fails
  const launchOptions = {
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
  };

  // On macOS, try to use system Chrome to avoid ARM/Rosetta issues
  if (process.platform === 'darwin') {
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    
    const fs = require('fs');
    for (const chromePath of chromePaths) {
      if (fs.existsSync(chromePath)) {
        launchOptions.executablePath = chromePath;
        logger.info(`Using system browser: ${chromePath}`);
        break;
      }
    }
  }

  browser = await puppeteer.launch(launchOptions);

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

  // Generate unique fingerprint per trace - synced with user agent device type
  const fingerprint = generateBrowserFingerprint(userAgent);
  logger.info(`🖥️ Unique fingerprint: ${fingerprint.deviceType} | viewport=${fingerprint.viewport.width}x${fingerprint.viewport.height}, colorDepth=${fingerprint.colorDepth}, pixelRatio=${fingerprint.pixelRatio}`);

  const chain = [];
  let currentUrl = url;
  let redirectCount = 0;
  const visitedUrls = new Set();
  const startBudget = Date.now();
  const budgetMs = timeout;

  if (!proxySettings) {
    await loadProxySettings();
  }

  const proxyPassword = proxySettings.password;
  const proxyHost = proxySettings.host;
  const proxyPortNum = parseInt(proxyPort || proxySettings.port);

  const proxyUsername = buildProxyUsername(
    proxyIp || proxySettings.username,
    targetCountry || null,
    !!proxyIp
  );

  if (!proxyIp && targetCountry && targetCountry.length === 2) {
    logger.info(`🌍 HTTP-only: Geo-targeting ${targetCountry.toUpperCase()}`);
  } else {
    logger.info(`🔄 HTTP-only: Using Luna proxy (new connection = new IP)`);
  }

  const proxyUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPortNum}`;
  
  // Optimization #2: Reuse connections WITHIN this trace (but fresh agent per trace = new IP)
  // Luna rotates IPs on new agent creation, but we can reuse within single trace
  const traceAgent = new HttpsProxyAgent(proxyUrl, {
    keepAlive: true,   // Reuse within this trace for speed
    maxSockets: 5,     // Allow concurrent hops
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
    
    // Optimization #1: Adaptive timeout - start lower, adjust based on actual performance
    const avgHopTime = hopTimings.length > 0 
      ? hopTimings.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, hopTimings.length)
      : 3000; // Start at 3s, will adapt up if needed
    
    // Some affiliate domains (e.g., awin/doubleclick/elcorteingles) are consistently slower; raise the floor to avoid premature timeouts.
    const slowAffiliatePatterns = [/awin1\.com/i, /doubleclick\.net/i, /elcorteingles\.es/i];
    const timeoutFloor = slowAffiliatePatterns.some((p) => p.test(url)) ? 8000 : 5000;

    const budgetPerHop = Math.max(timeoutFloor, Math.min(remainingBudget * 0.7, avgHopTime * 1.2)); // Tighter multiplier
    
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
          'accept-language': fingerprint.language,
          'accept-encoding': fingerprint.encoding,
          'connection': 'close', // Don't keep alive - we're killing it anyway
          ...(referrer ? { 'referer': referrer } : {}),
        },
        retry: { limit: 0 },
        timeout: {
          connect: Math.max(6000, timeoutFloor + 1000),  // give slow domains more time to establish
          response: Math.max(3000, Math.floor(timeoutFloor * 0.75)), // and more time to respond
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
        
        // Optimization #3: Check if this looks like a final URL
        const looksLikeFinal = status >= 200 && status < 300 && 
          FINAL_URL_PATTERNS.some(pattern => pattern.test(url));
        
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
          if (looksLikeFinal) {
            logger.info(`  🎯 Final URL detected (pattern match) at hop ${currentHopIndex + 1}`);
          } else {
            logger.info(`  🎯 Final URL reached at hop ${currentHopIndex + 1}`);
          }
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
    targetCountry = selectedCountry || null,
    referrer = null,
    expectedFinalUrl = null, // Expected final destination (offer's final_url)
  } = options;

  const chain = [];
  const popupChains = [];
  let traceBrowser = null;
  let page = null;

  try {
    // Launch FRESH browser per trace - each new browser process = potential new IP
    traceBrowser = await initBrowser(true);
    page = await traceBrowser.newPage();

    if (!proxySettings) {
      await loadProxySettings();
    }

    // CRITICAL: Generate UNIQUE random ID per trace to force fresh Luna connection
    // This matches HTTP-only's approach: new agent/credentials = new IP
    const traceSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let proxyUsername = buildProxyUsername(proxySettings.username, targetCountry || null);
    const proxyPassword = proxySettings.password;

    // Apply geo-targeting via Luna region parameter
    if (targetCountry && targetCountry.length === 2) {
      const countryCode = targetCountry.toLowerCase();
      logger.info(`🌍 Browser: Geo-targeting ${countryCode.toUpperCase()} (session: ${traceSessionId.substring(0, 8)}...)`);
    } else {
      logger.info(`🔄 Browser: Fresh Luna connection (session: ${traceSessionId.substring(0, 8)}...)`);
    }

    // MUST authenticate before any requests to ensure Luna sees the username
    await page.authenticate({
      username: proxyUsername,
      password: proxyPassword,
    });

    // CRITICAL: Unique session ID per trace = unique username = fresh Luna connection
    // This forces Luna to treat each trace as a new session, rotating IPs

    await page.setUserAgent(userAgent);
    logger.info(`🎭 Using User Agent: ${userAgent.substring(0, 80)}...`);
    
    // Generate unique fingerprint per trace - synced with user agent device type
    const fingerprint = generateBrowserFingerprint(userAgent);
    logger.info(`🖥️ Unique fingerprint: ${fingerprint.deviceType} | viewport=${fingerprint.viewport.width}x${fingerprint.viewport.height}, colorDepth=${fingerprint.colorDepth}, pixelRatio=${fingerprint.pixelRatio}`);
    
    await page.setViewport(fingerprint.viewport);

    // Set realistic browser headers with unique fingerprint
    const headers = {
      'Accept-Language': fingerprint.language,
      'Accept-Encoding': fingerprint.encoding,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };
    
    if (referrer) {
      headers['Referer'] = referrer;
      logger.info(`🔗 Browser using custom referrer: ${referrer}`);
    }
    
    await page.setExtraHTTPHeaders(headers);

    // Enhanced stealth: mask automation indicators + randomize fingerprints + advanced redirect detection
    await page.evaluateOnNewDocument(() => {
      // Initialize redirect log
      window.__redirectLog = [];
      window.__formSubmissions = [];
      
      // Override webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Add chrome object
      window.chrome = {
        runtime: {},
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Randomize Canvas fingerprint
      const getRandomValues = window.crypto.getRandomValues.bind(window.crypto);
      Object.defineProperty(window.crypto, 'getRandomValues', {
        value: function(typedArray) {
          getRandomValues(typedArray);
          for (let i = 0; i < typedArray.length; i++) {
            typedArray[i] = (typedArray[i] + Math.floor(Math.random() * 256)) % 256;
          }
          return typedArray;
        },
      });
      
      // Randomize WebGL fingerprint
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };
      
      // ADVANCED REDIRECT DETECTION: Intercept all navigation methods
      const interceptors = {
        locationSetter: Object.getOwnPropertyDescriptor(window.Location.prototype, 'href'),
        locationReplace: window.location.replace,
        locationAssign: window.location.assign,
        historyPushState: window.history.pushState,
        historyReplaceState: window.history.replaceState,
      };

      // Override location.href setter
      Object.defineProperty(window.location, 'href', {
        get: () => interceptors.locationSetter.get.call(window.location),
        set: (url) => {
          window.__redirectLog.push({
            type: 'location.href',
            url: url,
            timestamp: Date.now(),
          });
          return interceptors.locationSetter.set.call(window.location, url);
        }
      });

      // Override location.replace
      window.location.replace = function(url) {
        window.__redirectLog.push({
          type: 'location.replace',
          url: url,
          timestamp: Date.now(),
        });
        return interceptors.locationReplace.call(window.location, url);
      };

      // Override location.assign
      window.location.assign = function(url) {
        window.__redirectLog.push({
          type: 'location.assign',
          url: url,
          timestamp: Date.now(),
        });
        return interceptors.locationAssign.call(window.location, url);
      };

      // Detect setTimeout/setInterval redirects
      const originalSetTimeout = window.setTimeout;
      const originalSetInterval = window.setInterval;

      window.setTimeout = function(fn, delay, ...args) {
        const fnString = fn.toString();
        if (fnString.includes('location') || fnString.includes('redirect') || fnString.includes('href')) {
          window.__redirectLog.push({
            type: 'setTimeout_redirect',
            delay: delay,
            timestamp: Date.now(),
          });
        }
        return originalSetTimeout.call(window, fn, delay, ...args);
      };

      window.setInterval = function(fn, delay, ...args) {
        const fnString = fn.toString();
        if (fnString.includes('location') || fnString.includes('redirect') || fnString.includes('href')) {
          window.__redirectLog.push({
            type: 'setInterval_redirect',
            delay: delay,
            timestamp: Date.now(),
          });
        }
        return originalSetInterval.call(window, fn, delay, ...args);
      };

      // Monitor meta refresh tags
      const metaObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'META' && node.httpEquiv?.toLowerCase() === 'refresh') {
              const content = node.content || '';
              const urlMatch = /url=([^;\s]+)/i.exec(content);
              if (urlMatch) {
                window.__redirectLog.push({
                  type: 'meta_refresh',
                  url: urlMatch[1],
                  content: content,
                  timestamp: Date.now(),
                });
              }
            }
          });
        });
      });

      // Monitor form submissions
      const formObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'FORM') {
              const form = node;
              const originalSubmit = form.submit;
              form.submit = function() {
                window.__formSubmissions.push({
                  action: form.action,
                  method: form.method || 'GET',
                  timestamp: Date.now(),
                });
                return originalSubmit.call(form);
              };
            }
          });
        });
      });

      document.addEventListener('DOMContentLoaded', () => {
        if (document.head) {
          metaObserver.observe(document.head, { childList: true, subtree: true });
        }
        if (document.body) {
          formObserver.observe(document.body, { childList: true, subtree: true });
        }
        
        // Monitor existing forms
        document.querySelectorAll('form').forEach((form) => {
          const originalSubmit = form.submit;
          form.submit = function() {
            window.__formSubmissions.push({
              action: form.action,
              method: form.method || 'GET',
              timestamp: Date.now(),
            });
            return originalSubmit.call(form);
          };
        });
      });
      
      // Disable animations for faster loading
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
    
    // Track ALL requests to detect retries
    const requestLog = {
      documentRequests: new Map(),
      totalRequests: 0,
      retryAttempts: 0,
      startTime: Date.now(),
    };

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        lastUrlChange = Date.now();
      }
    });

    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const requestUrl = request.url();
      
      requestLog.totalRequests++;

      if (resourceType === 'document') {
        const startTime = Date.now();
        const key = `${request.method()}-${requestUrl}`;
        
        // Check if this document URL was already requested (indicates retry)
        if (requestLog.documentRequests.has(key)) {
          const existing = requestLog.documentRequests.get(key);
          existing.retryCount = (existing.retryCount || 0) + 1;
          requestLog.retryAttempts++;
          logger.warn(`🔄 BROWSER RETRY DETECTED: ${requestUrl} (attempt ${existing.retryCount + 1})`);
        } else {
          requestLog.documentRequests.set(key, {
            url: requestUrl,
            method: request.method(),
            timestamp: Date.now(),
            retryCount: 0,
          });
          logger.info(`📄 Browser document request #${requestLog.documentRequests.size}: ${requestUrl}`);
        }
        
        redirectChain.push({
          url: requestUrl,
          method: request.method(),
          headers: request.headers(),
          startTime,
        });
        requestCount++;
      }

      const isBlockedDomain = BLOCKED_DOMAINS.some(domain => requestUrl.includes(domain));
      const shouldBlock = BLOCKED_RESOURCE_TYPES.includes(resourceType) || (isBlockedDomain && resourceType !== 'document');

      if (shouldBlock) {
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
          
          // ⚡ BANDWIDTH OPTIMIZATION: Stop loading final page body if we've reached expected destination
          // Only stop if expectedFinalUrl is provided and current URL matches it (by domain)
          if (expectedFinalUrl) {
            try {
              const currentDomain = new URL(url).hostname.replace(/^www\./, '');
              const expectedDomain = new URL(expectedFinalUrl).hostname.replace(/^www\./, '');
              
              if (currentDomain === expectedDomain) {
                logger.info(`⚡ Reached expected final URL: ${url} - stopping page load`);
                // Stop loading to save bandwidth - we have the URL and params
                await page.evaluate(() => {
                  if (window.stop) window.stop();
                  else if (document.execCommand) document.execCommand('Stop');
                });
              }
            } catch (e) {
              // Ignore URL parse errors
            }
          }
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

    // ✅ Limit to 1 attempt: fail fast on navigation errors (no implicit retries)
    const navigationPromise = page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,  // Single timeout, no retries
      referer: referrer || undefined,
    }).catch(err => {
      // Catch and log navigation errors without retry
      logger.warn(`⚠️ Browser navigation failed (no retry): ${err.message}`);
      // Don't re-throw - let idle detection handle it
      return null;
    });

    const idleDetectionPromise = new Promise(async (resolve) => {
      let idleCheckInterval;
      
      const checkIdle = async () => {
        const timeSinceLastChange = Date.now() - lastUrlChange;
        // Wait 5 seconds of no URL changes before checking for hidden redirects (increased for meta refresh delays)
        if (timeSinceLastChange > 5000) {
          clearInterval(idleCheckInterval);
          
          // ENHANCED: Search for hidden redirects in HTML BEFORE stopping
          try {
            const hiddenRedirects = await page.evaluate(() => {
              const redirects = [];
              
              // 1. Check URL parameters for redirect targets
              const currentUrl = new URL(window.location.href);
              const urlParam = currentUrl.searchParams.get('url');
              const redirectParam = currentUrl.searchParams.get('redirect');
              const targetParam = currentUrl.searchParams.get('target');
              
              if (urlParam && urlParam.startsWith('http')) {
                redirects.push({ type: 'url_parameter', url: decodeURIComponent(urlParam) });
              } else if (redirectParam && redirectParam.startsWith('http')) {
                redirects.push({ type: 'url_parameter', url: decodeURIComponent(redirectParam) });
              } else if (targetParam && targetParam.startsWith('http')) {
                redirects.push({ type: 'url_parameter', url: decodeURIComponent(targetParam) });
              }
              
              // 2. Check for meta refresh tags
              const metaTags = document.querySelectorAll('meta[http-equiv="refresh"]');
              metaTags.forEach(meta => {
                const content = meta.getAttribute('content') || '';
                const urlMatch = /url=([^;\s]+)/i.exec(content);
                if (urlMatch) {
                  redirects.push({ type: 'meta_refresh', url: urlMatch[1] });
                }
              });
              
              // 3. Check for JavaScript redirect patterns in script tags
              const scripts = document.querySelectorAll('script');
              scripts.forEach(script => {
                const content = script.textContent || '';
                
                // Look for location assignments
                const locationMatches = content.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
                if (locationMatches && locationMatches[1] && locationMatches[1].startsWith('http')) {
                  redirects.push({ type: 'js_location', url: locationMatches[1] });
                }
                
                // Look for location.replace
                const replaceMatches = content.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i);
                if (replaceMatches && replaceMatches[1] && replaceMatches[1].startsWith('http')) {
                  redirects.push({ type: 'js_replace', url: replaceMatches[1] });
                }
              });
              
              return redirects;
            });
            
            if (hiddenRedirects.length > 0) {
              logger.info(`🔎 Found ${hiddenRedirects.length} hidden redirect(s) in HTML`);
              
              // Follow the first valid redirect
              for (const redirect of hiddenRedirects) {
                logger.info(`  → ${redirect.type}: ${redirect.url}`);
                
                if (redirect.url && redirect.url.startsWith('http')) {
                  try {
                    logger.info(`🔄 Navigating to hidden redirect URL...`);
                    await page.goto(redirect.url, { timeout: 10000, waitUntil: 'domcontentloaded' });
                    lastUrlChange = Date.now();
                    logger.info(`✅ Navigated to: ${page.url()}`);
                    
                    // Wait a bit more and check again
                    await new Promise(r => setTimeout(r, 2000));
                    
                    // Reset idle detection to continue
                    idleCheckInterval = setInterval(checkIdle, 200);
                    return; // Don't resolve yet, continue monitoring
                  } catch (err) {
                    logger.warn(`⚠️ Navigation to hidden redirect failed: ${err.message}`);
                  }
                }
              }
            }
          } catch (err) {
            logger.warn(`⚠️ Error searching for hidden redirects: ${err.message}`);
          }
          
          logger.info('⚡ Browser: Early stop - no more redirects found');
          resolve();
        }
      };
      
      idleCheckInterval = setInterval(checkIdle, 200);

      setTimeout(() => {
        clearInterval(idleCheckInterval);
        resolve();
      }, timeout);
    });

    await Promise.race([navigationPromise, idleDetectionPromise]);

    // Get JS redirect log
    let jsRedirectLog = [];
    let formSubmissions = [];
    try {
      jsRedirectLog = await page.evaluate(() => window.__redirectLog || []);
      formSubmissions = await page.evaluate(() => window.__formSubmissions || []);

      
      if (jsRedirectLog.length > 0) {
        logger.info(`🔍 Detected ${jsRedirectLog.length} JS redirect attempts`);
        jsRedirectLog.forEach((log, i) => {
          logger.info(`  ${i + 1}. ${log.type}: ${log.url || 'delayed'}`);
        });
      }
      
      if (formSubmissions.length > 0) {
        logger.info(`📝 Detected ${formSubmissions.length} form submissions`);
        formSubmissions.forEach((form, i) => {
          logger.info(`  ${i + 1}. ${form.method} ${form.action}`);
        });
      }
    } catch (err) {
      logger.warn(`⚠️ Could not retrieve JS redirect log: ${err.message}`);
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
        method: 'browser',
        params: finalParams,
        timing_ms: 0,
        bandwidth_bytes: null,
      });
    }

    const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
    const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

    // Log network request summary
    const requestDuration = Date.now() - requestLog.startTime;
    const requestRatio = requestLog.documentRequests.size > 0 
      ? (requestLog.totalRequests / requestLog.documentRequests.size).toFixed(2) 
      : 'N/A';
    logger.info(`📊 Browser Mode Network Summary:
  ├─ Document requests: ${requestLog.documentRequests.size}
  ├─ Total network clicks: ${requestLog.totalRequests}
  ├─ Retry attempts detected: ${requestLog.retryAttempts}
  ├─ JS redirects detected: ${jsRedirectLog.length}
  ├─ Form submissions: ${formSubmissions.length}
  ├─ Request ratio (clicks/docs): ${requestRatio}x
  └─ Duration: ${requestDuration}ms`);

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
      js_redirects: jsRedirectLog,
      form_submissions: formSubmissions,
      network_stats: {
        total_network_clicks: requestLog.totalRequests,
        document_requests: requestLog.documentRequests.size,
        retry_attempts: requestLog.retryAttempts,
        request_ratio: parseFloat(requestRatio),
        js_redirect_attempts: jsRedirectLog.length,
        form_submission_count: formSubmissions.length,
      },
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
    // CRITICAL: Close browser after trace to force fresh connection next time
    if (traceBrowser) {
      await traceBrowser.close().catch(e => logger.error('Failed to close browser:', e));
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
    expectedFinalUrl = null,
  } = options;

  const chain = [];
  const popupChains = [];
  const obfuscatedUrls = [];
  const cloakingIndicators = [];
  const visitedScriptUrls = new Set();
  let traceBrowser = null;
  let page = null;
  let aggressivenessLevel = 'low';
  let latestPageContent = '';

  try {
    // Launch FRESH browser per trace - each new browser process = potential new IP
    traceBrowser = await initBrowser(true);
    page = await traceBrowser.newPage();

    if (!proxySettings) {
      await loadProxySettings();
    }

    // CRITICAL: Generate UNIQUE random ID per trace to force fresh Luna connection
    // This matches HTTP-only's approach: new agent/credentials = new IP
    const traceSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let proxyUsername = buildProxyUsername(proxySettings.username, targetCountry || null);
    const proxyPassword = proxySettings.password;

    if (targetCountry && targetCountry.length === 2) {
      const countryCode = targetCountry.toLowerCase();
      logger.info(`🕵️ Anti-cloaking: Geo-targeting ${countryCode.toUpperCase()} (session: ${traceSessionId.substring(0, 8)}...)`);
    } else {
      logger.info(`🔄 Anti-cloaking: Fresh Luna connection (session: ${traceSessionId.substring(0, 8)}...)`);
    }

    // MUST authenticate before any requests to ensure Luna sees the username
    await page.authenticate({
      username: proxyUsername,
      password: proxyPassword,
    });

    // CRITICAL: Unique session ID per trace = unique username = fresh Luna connection
    // This forces Luna to treat each trace as a new session, rotating IPs

    await page.setUserAgent(userAgent);
    logger.info(`🕵️ Anti-cloaking User Agent: ${userAgent.substring(0, 80)}...`);
    
    // Generate unique fingerprint per trace - synced with user agent device type
    const fingerprint = generateBrowserFingerprint(userAgent);
    logger.info(`🖥️ Unique fingerprint: ${fingerprint.deviceType} | viewport=${fingerprint.viewport.width}x${fingerprint.viewport.height}, colorDepth=${fingerprint.colorDepth}, pixelRatio=${fingerprint.pixelRatio}`);
    
    await page.setViewport(fingerprint.viewport);

    if (referrer) {
      await page.setExtraHTTPHeaders({
        'Referer': referrer,
        'Accept-Language': fingerprint.language,
        'Accept-Encoding': fingerprint.encoding,
      });
      logger.info(`🔗 Anti-cloaking using custom referrer: ${referrer}`);
    } else {
      await page.setExtraHTTPHeaders({
        'Accept-Language': fingerprint.language,
        'Accept-Encoding': fingerprint.encoding,
      });
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

      // Randomize Canvas fingerprint
      const getRandomValues = window.crypto.getRandomValues.bind(window.crypto);
      Object.defineProperty(window.crypto, 'getRandomValues', {
        value: function(typedArray) {
          getRandomValues(typedArray);
          for (let i = 0; i < typedArray.length; i++) {
            typedArray[i] = (typedArray[i] + Math.floor(Math.random() * 256)) % 256;
          }
          return typedArray;
        },
      });

      // Randomize WebGL fingerprint
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };

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

      // Capture top/parent navigation attempts (assign/replace) for later follow-up
      try {
        const hookLocation = (locObj) => {
          if (!locObj) return;
          ['assign', 'replace'].forEach(fn => {
            const original = locObj[fn];
            if (typeof original !== 'function') return;
            Object.defineProperty(locObj, fn, {
              configurable: true,
              value: function(url) {
                try { window.__forcedNavTarget = url; } catch (e) {}
                return original.call(this, url);
              }
            });
          });
        };

        hookLocation(window.top && window.top.location);
        hookLocation(window.parent && window.parent.location);
      } catch (e) {}
    });

    await page.setRequestInterception(true);

    const redirectChain = [];
    let requestCount = 0;
    let lastUrlChange = Date.now();
    
    // Track ALL requests to detect retries
    const requestLog = {
      documentRequests: new Map(),
      totalRequests: 0,
      retryAttempts: 0,
      startTime: Date.now(),
    };

    // Capture content after each navigation to avoid context destruction
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        lastUrlChange = Date.now();
        
        // Capture content immediately after navigation completes
        try {
          latestPageContent = await page.content();
        } catch (err) {
          // Context may still be destroyed in rapid redirects; ignore
          logger.warn('Could not capture content after navigation:', err.message);
        }
      }
    });

    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const requestUrl = request.url();
      
      requestLog.totalRequests++;

      if (resourceType === 'document') {
        const startTime = Date.now();
        const key = `${request.method()}-${requestUrl}`;
        
        // Check if this document URL was already requested (indicates retry)
        if (requestLog.documentRequests.has(key)) {
          const existing = requestLog.documentRequests.get(key);
          existing.retryCount = (existing.retryCount || 0) + 1;
          requestLog.retryAttempts++;
          logger.warn(`🔄 ANTI-CLOAKING RETRY DETECTED: ${requestUrl} (attempt ${existing.retryCount + 1})`);
        } else {
          requestLog.documentRequests.set(key, {
            url: requestUrl,
            method: request.method(),
            timestamp: Date.now(),
            retryCount: 0,
          });
          logger.info(`📄 Anti-cloaking document request #${requestLog.documentRequests.size}: ${requestUrl}`);
        }
        
        redirectChain.push({
          url: requestUrl,
          method: request.method(),
          headers: request.headers(),
          startTime,
        });
        requestCount++;
      }

      const isBlockedDomain = BLOCKED_DOMAINS.some(domain => requestUrl.includes(domain));
      const shouldBlock = BLOCKED_RESOURCE_TYPES.includes(resourceType) || (isBlockedDomain && resourceType !== 'document');

      if (shouldBlock) {
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

    // ✅ Limit to 1 attempt: fail fast on navigation errors (no implicit retries)
    const navigationPromise = page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,  // Single timeout, no retries
      referer: referrer || undefined,
    }).catch(err => {
      // Catch and log navigation errors without retry
      logger.warn(`⚠️ Anti-cloaking navigation failed (no retry): ${err.message}`);
      // Don't re-throw - let idle detection handle it
      return null;
    });

    const idleDetectionPromise = new Promise((resolve) => {
      const checkIdle = setInterval(() => {
        const timeSinceLastChange = Date.now() - lastUrlChange;
        // Wait ~3.5s for JavaScript redirects to execute; light DOM mutation sniff
        if (timeSinceLastChange > 3500) {
          clearInterval(checkIdle);
          logger.info('⚡ Anti-cloaking: Early stop - no URL changes for 2s');
          resolve();
        }
      }, 200);

      // Single mutation observer burst (~400ms) after 3s to see if page is still active
      setTimeout(async () => {
        try {
          const hadRecentMutation = await page.evaluate(() => {
            return new Promise((resolve) => {
              let mutated = false;
              const obs = new MutationObserver(() => { mutated = true; });
              obs.observe(document.documentElement || document.body, { subtree: true, childList: true, attributes: true });
              setTimeout(() => { obs.disconnect(); resolve(mutated); }, 400);
            });
          });

          if (!hadRecentMutation && (Date.now() - lastUrlChange) > 3000) {
            clearInterval(checkIdle);
            logger.info('⚡ Anti-cloaking: Early stop - idle + no mutations');
            resolve();
          }
        } catch (e) {
          // ignore and let main timeout handle
        }
      }, 3000);

      setTimeout(() => {
        clearInterval(checkIdle);
        resolve();
      }, timeout);
    });

    await Promise.race([navigationPromise, idleDetectionPromise]);

    // Single mouse movement for lightweight human simulation
    await page.mouse.move(150 + Math.random() * 100, 150 + Math.random() * 100);

    // Handle pages that set target_url and redirect via programmatic click
    try {
      const scriptRedirect = await page.evaluate(() => {
        try {
          const t = typeof target_url !== 'undefined' ? target_url : null;
          return t && t.trim() ? t.trim() : null;
        } catch (e) {
          return null;
        }
      });

      if (scriptRedirect && !visitedScriptUrls.has(scriptRedirect)) {
        visitedScriptUrls.add(scriptRedirect);
        logger.info(`🔀 Anti-cloaking: Following script-defined target_url -> ${scriptRedirect.substring(0, 120)}...`);
        try {
          await page.goto(scriptRedirect, { waitUntil: 'domcontentloaded', timeout: Math.min(10000, timeout) });
        } catch (err) {
          logger.warn(`Script redirect navigation failed: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`Script redirect detection error: ${err.message}`);
    }

    // Handle form auto-submit patterns (single follow)
    try {
      const formRedirect = await page.evaluate(() => {
        try {
          const forms = Array.from(document.forms || []);
          for (const f of forms) {
            const action = f.getAttribute('action') || f.action;
            if (action && action.trim()) {
              const url = new URL(action, document.baseURI).toString();
              return url;
            }
          }
          return null;
        } catch (e) {
          return null;
        }
      });

      if (formRedirect && !visitedScriptUrls.has(formRedirect)) {
        visitedScriptUrls.add(formRedirect);
        logger.info(`📝 Anti-cloaking: Following form action -> ${formRedirect.substring(0, 120)}...`);
        try {
          await page.goto(formRedirect, { waitUntil: 'domcontentloaded', timeout: Math.min(10000, timeout) });
        } catch (err) {
          logger.warn(`Form redirect navigation failed: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`Form redirect detection error: ${err.message}`);
    }

    // Follow captured parent/top navigation attempts
    try {
      const forcedNav = await page.evaluate(() => {
        try { return window.__forcedNavTarget || null; } catch (e) { return null; }
      });

      if (forcedNav && !visitedScriptUrls.has(forcedNav)) {
        visitedScriptUrls.add(forcedNav);
        logger.info(`⬆️ Anti-cloaking: Following top/parent redirect -> ${forcedNav.substring(0, 120)}...`);
        try {
          await page.goto(forcedNav, { waitUntil: 'domcontentloaded', timeout: Math.min(10000, timeout) });
        } catch (err) {
          logger.warn(`Top/parent redirect navigation failed: ${err.message}`);
        }
      }
    } catch (err) {
      logger.warn(`Top/parent redirect detection error: ${err.message}`);
    }

    // Use captured content if available, otherwise try to get it (with safety fallback)
    let pageContent = latestPageContent;
    if (!pageContent) {
      try {
        pageContent = await page.content();
      } catch (err) {
        logger.warn('Could not get final page content (context destroyed):', err.message);
        pageContent = '';
      }
    }

    if (pageContent) {
      if (pageContent.includes('data:text/html') || pageContent.includes('atob(') || pageContent.includes('fromCharCode')) {
        cloakingIndicators.push('obfuscated_code');
      }

      if (pageContent.match(/navigator\.webdriver|bot|crawler|spider/i)) {
        cloakingIndicators.push('bot_detection');
      }

      if (pageContent.match(/setTimeout.*redirect|setInterval.*redirect/i)) {
        cloakingIndicators.push('delayed_redirect');
      }

      // Detect meta refresh that opens new windows
      if (pageContent.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i)) {
        cloakingIndicators.push('meta_refresh');
      }
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

    // Log network request summary
    const requestDuration = Date.now() - requestLog.startTime;
    const requestRatio = requestLog.documentRequests.size > 0 
      ? (requestLog.totalRequests / requestLog.documentRequests.size).toFixed(2) 
      : 'N/A';
    logger.info(`📊 Anti-Cloaking Mode Network Summary:
  ├─ Document requests: ${requestLog.documentRequests.size}
  ├─ Total network clicks: ${requestLog.totalRequests}
  ├─ Retry attempts detected: ${requestLog.retryAttempts}
  ├─ Request ratio (clicks/docs): ${requestRatio}x
  └─ Duration: ${requestDuration}ms`);

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
      network_stats: {
        total_network_clicks: requestLog.totalRequests,
        document_requests: requestLog.documentRequests.size,
        retry_attempts: requestLog.retryAttempts,
        request_ratio: parseFloat(requestRatio),
      },
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
    // CRITICAL: Close browser after trace to force fresh connection next time
    if (traceBrowser) {
      await traceBrowser.close().catch(e => logger.error('Failed to close browser:', e));
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
      geo_pool,
      geo_strategy,
      geo_weights,
      force_country,
      enable_interactions = false,
      interaction_count = 0,
      bandwidth_limit_kb = null,
      expected_final_url = null, // Expected final destination URL from offer
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
      geo_pool,
      geo_strategy,
      geo_weights,
    });

    if (!proxySettings) {
      await loadProxySettings();
    }

    const normalizeCountry = (c) => {
      if (!c || typeof c !== 'string') return null;
      const trimmed = c.trim();
      return trimmed.length === 2 ? trimmed.toLowerCase() : null;
    };

    const sanitizedPool = Array.isArray(geo_pool)
      ? geo_pool.map(normalizeCountry).filter(Boolean)
      : [];

    const rotator = new GeoRotator({
      pool: sanitizedPool,
      strategy: geo_strategy || (geo_weights ? 'weighted' : 'round_robin'),
      weights: geo_weights || {},
    });

    const forcedCountry = normalizeCountry(force_country);
    const requestCountry = normalizeCountry(target_country);
    const selectedCountry = forcedCountry || requestCountry || rotator.next();

    logger.info('🌍 Geo selection', {
      selected_geo: selectedCountry || null,
      geo_strategy: geo_strategy || (geo_weights ? 'weighted' : 'round_robin'),
      geo_pool_size: sanitizedPool.length,
    });

    const geoUsername = buildProxyUsername(proxy_ip || proxySettings.username, selectedCountry || null, !!proxy_ip);
    if (selectedCountry) {
      logger.info(`🌍 Geo-targeting: ${selectedCountry.toUpperCase()}`);
    }

    const geoPromise = fetchGeolocation(geoUsername, proxySettings.password);

    let tracePromise;
    if (mode === 'http_only') {
      logger.info('⚡ Using HTTP-only mode (fast)');
      tracePromise = traceRedirectsHttpOnly(url, {
        maxRedirects: max_redirects || 20,
        timeout: timeout_ms || 5000,
        userAgent: user_agent || userAgentRotator.getNext(),
        targetCountry: selectedCountry || null,
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
        targetCountry: selectedCountry || null,
        referrer: referrer || null,
        expectedFinalUrl: expected_final_url || null,
      });
    } else if (mode === 'interactive') {
      logger.info('🎬 Using Interactive mode (anti-cloaking + session engagement)');
      tracePromise = traceRedirectsInteractive(url, {
        maxRedirects: max_redirects || 20,
        timeout: timeout_ms || 120000,
        userAgent: user_agent || userAgentRotator.getNext(),
        targetCountry: selectedCountry || null,
        referrer: referrer || null,
        minSessionTime: 4000,
        maxSessionTime: 8000,
      }, puppeteer, generateBrowserFingerprint, BLOCKED_DOMAINS, BLOCKED_RESOURCE_TYPES);
    } else {
      logger.info('🌐 Using Browser mode (full rendering)');
      tracePromise = traceRedirectsBrowser(url, {
        maxRedirects: max_redirects || 20,
        timeout: timeout_ms || 60000,
        userAgent: user_agent || userAgentRotator.getNext(),
        targetCountry: selectedCountry || null,
        referrer: referrer || null,
        expectedFinalUrl: expected_final_url || null,
      });
    }

    const [result, geoData] = await Promise.all([tracePromise, geoPromise]);

    const totalTime = Date.now() - startTime;
    const bandwidthFormatted = formatBytes(result.total_bandwidth_bytes);
    logger.info(`✅ Trace completed (${mode}): ${result.total_steps} steps in ${totalTime}ms | ${bandwidthFormatted} transferred`);
    logger.info(`📊 Bandwidth details: total=${result.total_bandwidth_bytes}B, avg_per_step=${result.bandwidth_per_step_bytes}B`);
    logger.info(`🌐 Proxy IP used: ${geoData.ip} | Location: ${geoData.city}, ${geoData.region}, ${geoData.country} | Selected Geo: ${selectedCountry ? selectedCountry.toUpperCase() : 'N/A'}`);

    res.json({
      ...result,
      selected_geo: selectedCountry || null,
      geo_strategy_used: geo_strategy || (geo_weights ? 'weighted' : 'round_robin'),
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
    modes_supported: ['http_only', 'browser', 'anti_cloaking', 'interactive'],
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
  logger.info('Supported modes: http_only (fast), browser (full rendering), anti_cloaking (advanced stealth), interactive (anti-cloaking + session engagement)');

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