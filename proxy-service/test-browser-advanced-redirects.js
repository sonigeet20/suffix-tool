/**
 * Test Advanced Browser Redirect Detection
 * Tests complex JS navigation scripts, meta refreshes, and form submissions
 * Before integrating into server.js
 */

const puppeteer = require('puppeteer');

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes
const IDLE_TIME = 3000; // 3 seconds of no changes before stopping

class AdvancedRedirectDetector {
  constructor(page) {
    this.page = page;
    this.redirectChain = [];
    this.lastUrlChange = Date.now();
    this.detectedRedirects = [];
    this.jsExecutions = [];
  }

  /**
   * Enhanced redirect detection via page evaluation
   * Monitors: location changes, meta refreshes, setTimeout/setInterval redirects
   */
  async injectRedirectDetector() {
    await this.page.evaluateOnNewDocument(() => {
      window.__redirectLog = [];
      window.__originalLocation = window.location.href;
      
      // Intercept all location change methods
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
            stack: new Error().stack,
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
          stack: new Error().stack,
        });
        return interceptors.locationReplace.call(window.location, url);
      };

      // Override location.assign
      window.location.assign = function(url) {
        window.__redirectLog.push({
          type: 'location.assign',
          url: url,
          timestamp: Date.now(),
          stack: new Error().stack,
        });
        return interceptors.locationAssign.call(window.location, url);
      };

      // Override history.pushState
      window.history.pushState = function(...args) {
        window.__redirectLog.push({
          type: 'history.pushState',
          url: args[2] || window.location.href,
          timestamp: Date.now(),
        });
        return interceptors.historyPushState.apply(window.history, args);
      };

      // Override history.replaceState
      window.history.replaceState = function(...args) {
        window.__redirectLog.push({
          type: 'history.replaceState',
          url: args[2] || window.location.href,
          timestamp: Date.now(),
        });
        return interceptors.historyReplaceState.apply(window.history, args);
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
            fnPreview: fnString.substring(0, 200),
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
            fnPreview: fnString.substring(0, 200),
            timestamp: Date.now(),
          });
        }
        return originalSetInterval.call(window, fn, delay, ...args);
      };

      // Monitor meta refresh tags
      const observer = new MutationObserver((mutations) => {
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

      if (document.head) {
        observer.observe(document.head, { childList: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          observer.observe(document.head, { childList: true, subtree: true });
        });
      }
    });
  }

  /**
   * Detect form auto-submissions
   */
  async detectFormRedirects() {
    try {
      const forms = await this.page.evaluate(() => {
        const formData = [];
        const forms = document.querySelectorAll('form');
        
        forms.forEach((form, index) => {
          const inputs = {};
          form.querySelectorAll('input, select, textarea').forEach(input => {
            if (input.name) {
              inputs[input.name] = input.value;
            }
          });

          // Check if form has auto-submit script
          const hasAutoSubmit = 
            form.querySelector('script')?.textContent.includes('submit') ||
            document.body.innerHTML.includes(`form[${index}].submit()`) ||
            document.body.innerHTML.includes('form.submit()');

          formData.push({
            action: form.action,
            method: form.method || 'GET',
            inputs: inputs,
            hasAutoSubmit: hasAutoSubmit,
          });
        });

        return formData;
      });

      return forms;
    } catch (err) {
      console.error('Form detection error:', err.message);
      return [];
    }
  }

  /**
   * Get all detected redirects from page
   */
  async getRedirectLog() {
    try {
      const log = await this.page.evaluate(() => window.__redirectLog || []);
      return log;
    } catch (err) {
      return [];
    }
  }

  /**
   * Monitor page for URL changes with advanced detection
   */
  async monitorPageChanges(timeout) {
    return new Promise((resolve) => {
      let lastUrl = this.page.url();
      let noChangeTimer;

      const checkChanges = async () => {
        const currentUrl = this.page.url();
        
        if (currentUrl !== lastUrl) {
          console.log(`🔄 URL changed: ${lastUrl} → ${currentUrl}`);
          lastUrl = currentUrl;
          this.lastUrlChange = Date.now();
          
          // Reset no-change timer
          clearTimeout(noChangeTimer);
          noChangeTimer = setTimeout(() => {
            console.log(`⏱️ No URL changes for ${IDLE_TIME}ms - stopping`);
            resolve();
          }, IDLE_TIME);

          // Check for JS-triggered redirects
          const redirectLog = await this.getRedirectLog();
          if (redirectLog.length > 0) {
            console.log(`📋 Detected ${redirectLog.length} JS redirect attempts`);
            redirectLog.forEach(log => {
              console.log(`  ├─ ${log.type}: ${log.url || 'N/A'}`);
            });
          }
        }
      };

      // Check every 200ms
      const interval = setInterval(checkChanges, 200);

      // Initial no-change timer
      noChangeTimer = setTimeout(() => {
        console.log(`⏱️ No URL changes for ${IDLE_TIME}ms - stopping`);
        clearInterval(interval);
        resolve();
      }, IDLE_TIME);

      // Maximum timeout
      setTimeout(() => {
        clearInterval(interval);
        clearTimeout(noChangeTimer);
        console.log(`⏰ Maximum timeout (${timeout}ms) reached`);
        resolve();
      }, timeout);
    });
  }
}

/**
 * Main test function
 */
async function testAdvancedRedirects(testUrl) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing Advanced Browser Redirect Detection`);
  console.log(`${'='.repeat(80)}`);
  console.log(`🎯 Target URL: ${testUrl}`);
  console.log(`⏰ Timeout: ${TEST_TIMEOUT}ms`);
  console.log(`⏱️ Idle detection: ${IDLE_TIME}ms\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();
    const detector = new AdvancedRedirectDetector(page);

    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Inject redirect detector before navigation
    await detector.injectRedirectDetector();

    // Track all navigation events
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        console.log(`📍 Frame navigated: ${frame.url()}`);
      }
    });

    // Track requests
    const requestLog = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'document') {
        const url = request.url();
        console.log(`📄 Document request: ${url}`);
        requestLog.push({
          url: url,
          type: request.resourceType(),
          method: request.method(),
        });
      }
    });

    // Start navigation
    console.log(`🚀 Starting navigation...\n`);
    const startTime = Date.now();

    try {
      await page.goto(testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TEST_TIMEOUT,
      });
    } catch (err) {
      console.log(`⚠️ Navigation error: ${err.message}`);
    }

    // Monitor for additional changes
    await detector.monitorPageChanges(TEST_TIMEOUT);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Get final results
    const finalUrl = page.url();
    const redirectLog = await detector.getRedirectLog();
    const forms = await detector.detectFormRedirects();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Test Results`);
    console.log(`${'='.repeat(80)}`);
    console.log(`⏱️ Total Duration: ${duration}ms`);
    console.log(`🎯 Initial URL: ${testUrl}`);
    console.log(`🏁 Final URL: ${finalUrl}`);
    console.log(`📄 Document Requests: ${requestLog.length}`);
    console.log(`🔄 JS Redirects Detected: ${redirectLog.length}`);
    console.log(`📝 Forms Found: ${forms.length}`);

    if (redirectLog.length > 0) {
      console.log(`\n📋 JS Redirect Log:`);
      redirectLog.forEach((log, i) => {
        console.log(`  ${i + 1}. ${log.type}`);
        console.log(`     URL: ${log.url || 'N/A'}`);
        if (log.delay) console.log(`     Delay: ${log.delay}ms`);
        if (log.fnPreview) console.log(`     Function: ${log.fnPreview}`);
      });
    }

    if (forms.length > 0) {
      console.log(`\n📝 Forms Detected:`);
      forms.forEach((form, i) => {
        console.log(`  ${i + 1}. ${form.method.toUpperCase()} ${form.action}`);
        console.log(`     Auto-submit: ${form.hasAutoSubmit ? 'YES' : 'NO'}`);
        console.log(`     Inputs: ${Object.keys(form.inputs).length}`);
      });
    }

    if (requestLog.length > 0) {
      console.log(`\n📄 Document Request Chain:`);
      requestLog.forEach((req, i) => {
        console.log(`  ${i + 1}. ${req.method} ${req.url}`);
      });
    }

    console.log(`\n${'='.repeat(80)}\n`);

    return {
      success: true,
      initialUrl: testUrl,
      finalUrl: finalUrl,
      chain: requestLog,
      jsRedirects: redirectLog,
      forms: forms,
      duration: duration,
    };

  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Run tests
const testUrls = [
  // Test URL from command line or default
  process.argv[2] || 'https://tatrck.com/h/0Hu30-ze0jAg?model=cpc',
];

(async () => {
  for (const url of testUrls) {
    const result = await testAdvancedRedirects(url);
    
    if (result.success) {
      console.log(`✅ Test completed successfully`);
      console.log(`   Steps: ${result.chain.length}`);
      console.log(`   JS Redirects: ${result.jsRedirects.length}`);
      console.log(`   Forms: ${result.forms.length}`);
    } else {
      console.log(`❌ Test failed: ${result.error}`);
    }
  }
  
  process.exit(0);
})();
