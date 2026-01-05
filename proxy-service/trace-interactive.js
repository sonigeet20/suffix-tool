/**
 * Interactive Tracing Method
 * Uses ANTI-CLOAKING tracing logic + adds lightweight session interactions
 * No fallback methods - clean and simple
 */

const winston = require('winston');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');

// Create dedicated logger for interactive mode
const interactiveLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'interactive-trace.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

/**
 * Generate random interactive actions (scrolls, mouse moves, waits)
 */
function generateRandomActions() {
  const actions = [];
  const actionCount = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < actionCount; i++) {
    const actionType = Math.random();
    if (actionType < 0.5) {
      const scrolls = Math.floor(Math.random() * 2) + 1;
      const scrollDir = Math.random() < 0.5 ? 'down' : 'up';
      const scrollAmount = Math.floor(Math.random() * 300) + 100;
      actions.push({ type: 'scroll', direction: scrollDir, amount: scrollAmount, count: scrolls });
    } else if (actionType < 0.85) {
      const x = Math.floor(Math.random() * 800) + 100;
      const y = Math.floor(Math.random() * 600) + 100;
      actions.push({ type: 'mouse_move', x, y, delay: Math.floor(Math.random() * 500) + 200 });
    } else {
      const waitTime = Math.floor(Math.random() * 1000) + 300;
      actions.push({ type: 'wait', duration: waitTime });
    }
  }
  return actions;
}

/**
 * Execute random actions on final URL
 */
async function executeRandomActions(page, sessionStartTime, minSessionTime, maxSessionTime) {
  const sessionMetrics = {
    scrolls_performed: 0,
    mouse_movements: 0,
    waits_performed: 0,
    total_actions: 0,
    session_dwell_time_ms: 0,
    interactions: []
  };

  try {
    const randomSessionTime = Math.floor(Math.random() * (maxSessionTime - minSessionTime)) + minSessionTime;
    interactiveLogger.info(`🎯 Starting interactive session: ${randomSessionTime}ms (range: ${minSessionTime}-${maxSessionTime}ms)`);
    
    const sessionEndTime = sessionStartTime + randomSessionTime;
    let actionIndex = 0;
    let actions = generateRandomActions();
    interactiveLogger.info(`📋 Generated ${actions.length} initial actions for session`);

    while (Date.now() < sessionEndTime) {
      const remainingTime = sessionEndTime - Date.now();
      
      if (actionIndex >= actions.length) {
        actions = generateRandomActions();
        actionIndex = 0;
        interactiveLogger.info(`🔄 Generated new batch of ${actions.length} actions (${remainingTime}ms remaining)`);
      }

      const action = actions[actionIndex];
      interactiveLogger.info(`⚙️ Executing action #${sessionMetrics.total_actions + 1}: ${action.type}`);

      try {
        if (action.type === 'scroll') {
          for (let i = 0; i < action.count; i++) {
            const direction = action.direction === 'down' ? 1 : -1;
            await page.evaluate((amount, dir) => {
              window.scrollBy(0, amount * dir);
            }, action.amount, direction);
            
            sessionMetrics.scrolls_performed++;
            sessionMetrics.interactions.push({
              type: 'scroll',
              direction: action.direction,
              amount: action.amount,
              timestamp: Date.now()
            });
            
            interactiveLogger.info(`↕️ Scroll ${action.direction} by ${action.amount}px (scroll #${sessionMetrics.scrolls_performed})`);
            await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
          }
        } 
        else if (action.type === 'mouse_move') {
          await page.mouse.move(action.x, action.y);
          sessionMetrics.mouse_movements++;
          sessionMetrics.interactions.push({
            type: 'mouse_move',
            x: action.x,
            y: action.y,
            timestamp: Date.now()
          });
          
          interactiveLogger.info(`🖱️ Mouse move to (${action.x}, ${action.y})`);
          await new Promise(r => setTimeout(r, action.delay));
        } 
        else if (action.type === 'wait') {
          const actualWait = Math.min(action.duration, sessionEndTime - Date.now());
          if (actualWait > 0) {
            sessionMetrics.waits_performed++;
            sessionMetrics.interactions.push({
              type: 'wait',
              duration: actualWait,
              timestamp: Date.now()
            });
            
            interactiveLogger.info(`⏱️ Wait ${actualWait}ms`);
            await new Promise(r => setTimeout(r, actualWait));
          }
        }

        sessionMetrics.total_actions++;
      } catch (err) {
        interactiveLogger.warn(`⚠️ Action execution failed: ${err.message}`);
      }

      actionIndex++;
    }

    sessionMetrics.session_dwell_time_ms = Date.now() - sessionStartTime;
    interactiveLogger.info(`✅ Interactive session complete: ${sessionMetrics.session_dwell_time_ms}ms dwell time`);
    interactiveLogger.info(`📊 Session Summary:
  ├─ Scrolls: ${sessionMetrics.scrolls_performed}
  ├─ Mouse movements: ${sessionMetrics.mouse_movements}
  ├─ Waits: ${sessionMetrics.waits_performed}
  ├─ Total actions: ${sessionMetrics.total_actions}
  └─ Dwell time: ${sessionMetrics.session_dwell_time_ms}ms`);

    return sessionMetrics;
  } catch (err) {
    interactiveLogger.error(`❌ Session execution error: ${err.message}`);
    return sessionMetrics;
  }
}

/**
 * Main interactive tracing function
 * Uses ANTI-CLOAKING tracing logic + interaction phase
 */
async function traceRedirectsInteractive(
  url,
  options = {},
  puppeteerModule,
  generateBrowserFingerprintFunc,
  blockedDomains,
  blockedResourceTypes,
  loadProxySettingsFunc
) {
  const {
    maxRedirects = 20,
    timeout = 90000,
    userAgent = null,
    targetCountry = null,
    referrer = null,
    minSessionTime = 3000,
    maxSessionTime = 8000,
  } = options;

  if (minSessionTime > maxSessionTime) {
    interactiveLogger.error(`❌ Invalid session times: min (${minSessionTime}) > max (${maxSessionTime})`);
    return { success: false, error: 'Invalid session time configuration: min > max' };
  }

  interactiveLogger.info(`🎬 Interactive trace started: ${url.substring(0, 100)}...`);
  interactiveLogger.info(`⏰ Session config: min=${minSessionTime}ms, max=${maxSessionTime}ms`);

  const chain = [];
  const popupChains = [];
  const cloakingIndicators = [];
  const visitedScriptUrls = new Set();
  let traceBrowser = null;
  let page = null;
  let latestPageContent = '';
  let lastDocumentUrl = null; // Declare outside try block for catch access

  // Fallback Supabase-based loader if not provided
  async function defaultLoadProxySettings() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured in env');
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from('settings')
      .select('luna_proxy_host, luna_proxy_port, luna_proxy_username, luna_proxy_password')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No proxy settings found in Supabase settings table');
    const settings = {
      host: data.luna_proxy_host,
      port: data.luna_proxy_port,
      username: data.luna_proxy_username,
      password: data.luna_proxy_password,
    };
    if (!settings.host || !settings.port || !settings.username || !settings.password) {
      throw new Error('Incomplete proxy settings from Supabase');
    }
    return settings;
  }

  try {
    // Load proxy settings
    const proxySettings = await (loadProxySettingsFunc ? loadProxySettingsFunc() : defaultLoadProxySettings());
    interactiveLogger.info(`✅ Proxy settings loaded`);

    // Launch fresh browser (unique session for new IP)
    interactiveLogger.info(`🚀 Launching fresh browser for new IP...`);
    const host = proxySettings.host;
    const port = proxySettings.port;
    const proxyServer = `http://${host}:${port}`;

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

    if (process.platform === 'darwin') {
      const fs = require('fs');
      const chromePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      ];
      
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          launchOptions.executablePath = chromePath;
          interactiveLogger.info(`✅ Using system browser: ${chromePath}`);
          break;
        }
      }
    }

    traceBrowser = await puppeteerModule.launch(launchOptions);
    page = await traceBrowser.newPage();
    interactiveLogger.info(`✅ Browser and page created`);

    // Generate unique session ID for fresh Luna connection
    const traceSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    let proxyUsername = `${proxySettings.username}-sid-${traceSessionId}`;
    const proxyPassword = proxySettings.password;

    // Apply geo-targeting
    if (targetCountry && targetCountry.length === 2) {
      const countryCode = targetCountry.toLowerCase();
      proxyUsername = `${proxyUsername}-region-${countryCode}`;
      interactiveLogger.info(`🌍 Geo-targeting: ${countryCode.toUpperCase()} (session: ${traceSessionId.substring(0, 8)}...)`);
    } else {
      interactiveLogger.info(`🔄 Fresh Luna connection (session: ${traceSessionId.substring(0, 8)}...)`);
    }

    // Authenticate with proxy
    await page.authenticate({ username: proxyUsername, password: proxyPassword });
    interactiveLogger.info(`✅ Proxy authenticated`);

    // Set user agent and fingerprint
    await page.setUserAgent(userAgent);
    interactiveLogger.info(`🎭 User Agent: ${userAgent.substring(0, 80)}...`);
    
    const fingerprint = generateBrowserFingerprintFunc(userAgent);
    interactiveLogger.info(`🖥️ Fingerprint: ${fingerprint.deviceType} | viewport=${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
    
    await page.setViewport(fingerprint.viewport);

    // Set headers
    const headers = {
      'Accept-Language': fingerprint.language,
      'Accept-Encoding': fingerprint.encoding,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };
    
    if (referrer) {
      headers['Referer'] = referrer;
      interactiveLogger.info(`🔗 Using custom referrer: ${referrer}`);
    }
    
    await page.setExtraHTTPHeaders(headers);

    // Stealth measures
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
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

      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.call(this, parameter);
      };

      const style = document.createElement('style');
      style.textContent = `* { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }`;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    });

    interactiveLogger.info(`✅ Stealth measures applied`);

    // Request interception
    await page.setRequestInterception(true);

    const redirectChain = [];
    let lastUrlChange = Date.now();
    // lastDocumentUrl already declared at function scope
    const idleThresholdMs = 5000;
    const minNavigationWindowMs = 12000;
    const requestLog = {
      documentRequests: new Map(),
      totalRequests: 0,
      retryAttempts: 0,
      startTime: Date.now(),
    };

    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        lastUrlChange = Date.now();
        interactiveLogger.info(`📄 Frame navigated to: ${page.url().substring(0, 100)}...`);
        try {
          latestPageContent = await page.content();
        } catch (err) {
          interactiveLogger.warn(`⚠️ Could not capture content: ${err.message}`);
        }
      }
    });

    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const requestUrl = request.url();
      requestLog.totalRequests++;

      if (resourceType === 'document') {
        const key = `${request.method()}-${requestUrl}`;
        
        if (requestLog.documentRequests.has(key)) {
          const existing = requestLog.documentRequests.get(key);
          existing.retryCount = (existing.retryCount || 0) + 1;
          requestLog.retryAttempts++;
          interactiveLogger.warn(`🔄 RETRY DETECTED: ${requestUrl.substring(0, 80)}... (attempt ${existing.retryCount + 1})`);
        } else {
          requestLog.documentRequests.set(key, {
            url: requestUrl,
            method: request.method(),
            timestamp: Date.now(),
            retryCount: 0,
          });
          interactiveLogger.info(`📄 Document request #${requestLog.documentRequests.size}: ${requestUrl.substring(0, 100)}...`);
        }

        lastDocumentUrl = requestUrl;
        
        redirectChain.push({
          url: requestUrl,
          method: request.method(),
          headers: request.headers(),
          startTime: Date.now(),
        });
      }

      const isBlockedDomain = blockedDomains.some(domain => requestUrl.includes(domain));
      const shouldBlock = blockedResourceTypes.includes(resourceType) || (isBlockedDomain && resourceType !== 'document');

      if (shouldBlock) {
        request.abort();
      } else {
        if (referrer && resourceType === 'document') {
          request.continue({ headers: { ...request.headers(), 'Referer': referrer } });
        } else {
          request.continue();
        }
      }
    });

    page.on('response', async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();

      if (resourceType === 'document') {
        const responseUrl = response.url();
        const status = response.status();
        const headers = response.headers();

        interactiveLogger.info(`📨 Response: ${status} from ${responseUrl.substring(0, 80)}...`);

        const params = {};
        try {
          const urlObj = new URL(responseUrl);
          urlObj.searchParams.forEach((value, key) => { params[key] = value; });
        } catch (e) {}

        const contentLength = headers['content-length'];
        const bandwidthBytes = contentLength ? parseInt(contentLength) : null;

        let redirectType = 'http';
        if (status >= 300 && status < 400) redirectType = 'http';
        else if (status >= 200 && status < 300) redirectType = 'final';
        else redirectType = 'error';

        chain.push({
          url: responseUrl,
          status,
          redirect_type: redirectType,
          method: 'interactive',
          headers,
          params,
          timing_ms: 0,
          bandwidth_bytes: bandwidthBytes,
          error: status >= 400 ? `HTTP ${status}` : undefined,
        });
      }
    });

    // Navigate to initial URL
    interactiveLogger.info(`🌐 Navigating to: ${url.substring(0, 100)}...`);
    const navigationPromise = page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
      referer: referrer || undefined,
    }).catch(err => {
      interactiveLogger.warn(`⚠️ Navigation failed (no retry): ${err.message}`);
      return null;
    });

    // Idle detection
    const idleDetectionPromise = new Promise((resolve) => {
      let idleCheckInterval;
      let idleCheckInProgress = false;

      const checkIdle = async () => {
        if (idleCheckInProgress) return;
        idleCheckInProgress = true;

        const timeSinceLastChange = Date.now() - lastUrlChange;
        if (timeSinceLastChange > idleThresholdMs) {
          if (Date.now() - requestLog.startTime < minNavigationWindowMs && lastDocumentUrl) {
            idleCheckInProgress = false;
            return;
          }

          clearInterval(idleCheckInterval);

          try {
            const hiddenRedirects = await page.evaluate(() => {
              const redirects = [];

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

              const metaTags = document.querySelectorAll('meta[http-equiv="refresh"]');
              metaTags.forEach(meta => {
                const content = meta.getAttribute('content') || '';
                const urlMatch = /url=([^;\s]+)/i.exec(content);
                if (urlMatch) {
                  redirects.push({ type: 'meta_refresh', url: urlMatch[1] });
                }
              });

              const scripts = document.querySelectorAll('script');
              scripts.forEach(script => {
                const content = script.textContent || '';

                const locationMatches = content.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
                if (locationMatches && locationMatches[1] && locationMatches[1].startsWith('http')) {
                  redirects.push({ type: 'js_location', url: locationMatches[1] });
                }

                const replaceMatches = content.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i);
                if (replaceMatches && replaceMatches[1] && replaceMatches[1].startsWith('http')) {
                  redirects.push({ type: 'js_replace', url: replaceMatches[1] });
                }
              });

              return redirects;
            });

            if (hiddenRedirects.length > 0) {
              interactiveLogger.info(`🔎 Found ${hiddenRedirects.length} hidden redirect(s) in HTML`);

              for (const redirect of hiddenRedirects) {
                interactiveLogger.info(`  → ${redirect.type}: ${redirect.url}`);

                if (redirect.url && redirect.url.startsWith('http')) {
                  try {
                    interactiveLogger.info(`🔄 Navigating to hidden redirect URL...`);
                    await page.goto(redirect.url, { timeout: 10000, waitUntil: 'domcontentloaded' });
                    lastUrlChange = Date.now();
                    lastDocumentUrl = page.url();
                    interactiveLogger.info(`✅ Navigated to: ${lastDocumentUrl.substring(0, 100)}...`);

                    await new Promise(r => setTimeout(r, 2000));
                    idleCheckInterval = setInterval(checkIdle, 200);
                    idleCheckInProgress = false;
                    return;
                  } catch (err) {
                    interactiveLogger.warn(`⚠️ Navigation to hidden redirect failed: ${err.message}`);
                  }
                }
              }
            }
          } catch (err) {
            interactiveLogger.warn(`⚠️ Error searching for hidden redirects: ${err.message}`);
          }

          interactiveLogger.info(`⚡ Idle detected - no URL changes for ${idleThresholdMs / 1000}s`);
          resolve();
        }

        idleCheckInProgress = false;
      };

      idleCheckInterval = setInterval(checkIdle, 200);

      setTimeout(() => {
        clearInterval(idleCheckInterval);
        resolve();
      }, timeout);
    });

    await Promise.race([navigationPromise, idleDetectionPromise]);

    // Get final URL
    const finalUrl = page.url();
    const isBlankFinal = !finalUrl || finalUrl.startsWith('about:blank') || finalUrl.startsWith('chrome-error://');
    const finalUrlCandidate = isBlankFinal && lastDocumentUrl ? lastDocumentUrl : finalUrl;
    const finalStatus = (!finalUrlCandidate || finalUrlCandidate.startsWith('about:blank') || finalUrlCandidate.startsWith('chrome-error://')) ? 0 : 200;
    interactiveLogger.info(`🎯 Final URL reached: ${finalUrl.substring(0, 100)}...`);
    if (finalUrl !== finalUrlCandidate) {
      interactiveLogger.info(`↩️ Using last document URL fallback: ${finalUrlCandidate.substring(0, 100)}...`);
    }

    if (chain.length === 0 || chain[chain.length - 1].url !== finalUrlCandidate) {
      const finalParams = {};
      try {
        const urlObj = new URL(finalUrlCandidate);
        urlObj.searchParams.forEach((value, key) => { finalParams[key] = value; });
      } catch (e) {}

      chain.push({
        url: finalUrlCandidate,
        status: finalStatus,
        redirect_type: 'final',
        method: 'interactive',
        params: finalParams,
        timing_ms: 0,
        bandwidth_bytes: null,
      });
    }

    // Determine trace success
    const traceSuccessful = finalStatus >= 200 && finalStatus < 400 && chain.some(e => e.redirect_type === 'final' && e.status >= 200 && e.status < 400 && e.url === finalUrlCandidate);
    if (!traceSuccessful) {
      interactiveLogger.info('⛔ Skipping interactive session: trace not successful or proxy connection failed');
      const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
      const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;
      const docCount = chain.filter(e => e.method === 'interactive' && e.redirect_type !== 'error').length;
      return {
        success: false,
        chain,
        popup_chains: popupChains,
        cloaking_indicators: cloakingIndicators,
        total_popups: popupChains.length,
        total_steps: chain.length,
        final_url: finalUrlCandidate,
        user_agent: userAgent,
        total_bandwidth_bytes: totalBandwidth,
        bandwidth_per_step_bytes: Math.round(avgBandwidth),
        execution_model: 'interactive_engagement',
        network_stats: {
          total_network_clicks: 0,
          document_requests: docCount,
          retry_attempts: 0,
          request_ratio: docCount > 0 ? 0 : null,
        },
        session_metrics: null,
      };
    }

    // ===== START INTERACTIVE SESSION ON FINAL URL =====
    interactiveLogger.info(`\n${'='.repeat(60)}`);
    interactiveLogger.info(`🎬 INTERACTIVE SESSION PHASE STARTING`);
    interactiveLogger.info(`${'='.repeat(60)}\n`);

    const sessionStartTime = Date.now();
    const sessionMetrics = await executeRandomActions(
      page,
      sessionStartTime,
      minSessionTime,
      maxSessionTime
    );

    interactiveLogger.info(`\n${'='.repeat(60)}`);
    interactiveLogger.info(`✅ INTERACTIVE SESSION PHASE COMPLETE`);
    interactiveLogger.info(`${'='.repeat(60)}\n`);

    // Cloaking detection
    let pageContent = latestPageContent;
    if (!pageContent) {
      try {
        pageContent = await page.content();
      } catch (err) {
        interactiveLogger.warn(`⚠️ Could not get final content: ${err.message}`);
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
      if (pageContent.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/i)) {
        cloakingIndicators.push('meta_refresh');
      }
    }

    const totalBandwidth = chain.reduce((sum, entry) => sum + (entry.bandwidth_bytes || 0), 0);
    const avgBandwidth = chain.length > 0 ? totalBandwidth / chain.length : 0;

    const requestDuration = Date.now() - requestLog.startTime;
    const requestRatio = requestLog.documentRequests.size > 0 
      ? (requestLog.totalRequests / requestLog.documentRequests.size).toFixed(2) 
      : 'N/A';

    interactiveLogger.info(`📊 TRACE COMPLETE - Interactive Mode Summary:
  ├─ Document requests: ${requestLog.documentRequests.size}
  ├─ Total network clicks: ${requestLog.totalRequests}
  ├─ Retry attempts detected: ${requestLog.retryAttempts}
  ├─ Request ratio (clicks/docs): ${requestRatio}x
  ├─ Duration: ${requestDuration}ms
  ├─ Session dwell time: ${sessionMetrics.session_dwell_time_ms}ms
  └─ Total interactions: ${sessionMetrics.total_actions}`);

    return {
      success: true,
      chain,
      popup_chains: popupChains,
      cloaking_indicators: cloakingIndicators,
      total_popups: popupChains.length,
      total_steps: chain.length,
      final_url: finalUrlCandidate,
      user_agent: userAgent,
      total_bandwidth_bytes: totalBandwidth,
      bandwidth_per_step_bytes: Math.round(avgBandwidth),
      execution_model: 'interactive_engagement',
      network_stats: {
        total_network_clicks: requestLog.totalRequests,
        document_requests: requestLog.documentRequests.size,
        retry_attempts: requestLog.retryAttempts,
        request_ratio: parseFloat(requestRatio),
      },
      session_metrics: sessionMetrics,
    };

  } catch (error) {
    interactiveLogger.error(`❌ Trace error: ${error.message}`);
    interactiveLogger.error(error.stack);

    if (chain.length === 0) {
      chain.push({
        url,
        status: 0,
        redirect_type: 'error',
        method: 'interactive',
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
      cloaking_indicators: cloakingIndicators,
      total_popups: popupChains.length,
      total_steps: chain.length,
      final_url: lastDocumentUrl || url,
      error: error.message,
      total_bandwidth_bytes: totalBandwidth,
      bandwidth_per_step_bytes: Math.round(avgBandwidth),
      execution_model: 'interactive_engagement',
    };
  } finally {
    if (page) {
      await page.close().catch(e => interactiveLogger.error(`Failed to close page: ${e.message}`));
    }
    if (traceBrowser) {
      await traceBrowser.close().catch(e => interactiveLogger.error(`Failed to close browser: ${e.message}`));
    }
    interactiveLogger.info(`✅ Cleanup complete\n`);
  }
}

module.exports = {
  traceRedirectsInteractive,
};
