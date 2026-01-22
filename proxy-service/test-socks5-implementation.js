#!/usr/bin/env node

/**
 * Test SOCKS5 Proxy Implementation Locally
 * 
 * This script tests both HTTP and SOCKS5 proxy protocols with the BlackBox AI link
 * that was experiencing TLS fingerprinting issues.
 * 
 * Usage:
 *   node test-socks5-implementation.js
 */

const axios = require('axios');

const TEST_URL = 'https://blackboxai.partnerlinks.io/pcn4bo8ipzxv';
const PROXY_SERVICE_URL = process.env.PROXY_SERVICE_URL || 'http://localhost:3000';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testProxyProtocol(protocol, mode = 'http_only') {
  log(colors.blue, `\n${'='.repeat(60)}`);
  log(colors.blue, `Testing ${protocol.toUpperCase()} with mode: ${mode}`);
  log(colors.blue, '='.repeat(60));

  try {
    const requestData = {
      url: TEST_URL,
      max_redirects: 20,
      timeout_ms: 60000,
      mode: mode,
      proxy_protocol: protocol,
      target_country: 'in',
    };

    log(colors.yellow, '\nRequest payload:', JSON.stringify(requestData, null, 2));

    const startTime = Date.now();
    const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, requestData, {
      timeout: 70000,
    });
    const duration = Date.now() - startTime;

    const result = response.data;

    if (result.success) {
      log(colors.green, `\n✅ SUCCESS (${duration}ms)`);
      log(colors.green, `Proxy IP: ${result.proxy_ip || 'N/A'}`);
      log(colors.green, `Geo: ${result.geo_location?.country || 'N/A'} / ${result.geo_location?.city || 'N/A'}`);
      log(colors.green, `Total steps: ${result.chain?.length || 0}`);
      
      if (result.chain && result.chain.length > 0) {
        log(colors.magenta, '\nRedirect chain:');
        result.chain.forEach((step, i) => {
          const stepNum = i + 1;
          const url = step.url;
          const status = step.status;
          const type = step.redirect_type;
          log(colors.magenta, `  ${stepNum}. [${status}] ${type} → ${url.substring(0, 80)}...`);
        });

        const finalUrl = result.chain[result.chain.length - 1]?.url || 'N/A';
        log(colors.green, `\nFinal URL: ${finalUrl}`);
      }

      return { success: true, duration, chainLength: result.chain?.length || 0 };
    } else {
      log(colors.red, `\n❌ FAILED`);
      log(colors.red, `Error: ${result.error || 'Unknown error'}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    log(colors.red, `\n❌ EXCEPTION`);
    if (error.response) {
      log(colors.red, `Status: ${error.response.status}`);
      log(colors.red, `Error: ${JSON.stringify(error.response.data)}`);
    } else {
      log(colors.red, `Error: ${error.message}`);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log(colors.magenta, '\n╔══════════════════════════════════════════════════════╗');
  log(colors.magenta, '║  SOCKS5 Proxy Implementation Test Suite             ║');
  log(colors.magenta, '╚══════════════════════════════════════════════════════╝\n');

  log(colors.yellow, `Target URL: ${TEST_URL}`);
  log(colors.yellow, `Proxy Service: ${PROXY_SERVICE_URL}`);
  log(colors.yellow, `\nEnsure proxy-service is running: cd proxy-service && node server.js`);

  const results = {
    http_only_mode: {},
    browser_mode: {},
  };

  // Test HTTP-only mode
  log(colors.blue, '\n\n📊 Testing HTTP-ONLY Mode');
  results.http_only_mode.http = await testProxyProtocol('http', 'http_only');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests
  results.http_only_mode.socks5 = await testProxyProtocol('socks5', 'http_only');

  // Test browser mode
  log(colors.blue, '\n\n📊 Testing BROWSER Mode');
  await new Promise(resolve => setTimeout(resolve, 2000));
  results.browser_mode.http = await testProxyProtocol('http', 'browser');
  await new Promise(resolve => setTimeout(resolve, 2000));
  results.browser_mode.socks5 = await testProxyProtocol('socks5', 'browser');

  // Summary
  log(colors.magenta, '\n\n╔══════════════════════════════════════════════════════╗');
  log(colors.magenta, '║  Test Results Summary                                ║');
  log(colors.magenta, '╚══════════════════════════════════════════════════════╝\n');

  log(colors.blue, 'HTTP-ONLY Mode:');
  log(colors.yellow, `  HTTP:   ${results.http_only_mode.http.success ? '✅ PASS' : '❌ FAIL'} ${results.http_only_mode.http.success ? `(${results.http_only_mode.http.duration}ms, ${results.http_only_mode.http.chainLength} steps)` : `(${results.http_only_mode.http.error})`}`);
  log(colors.yellow, `  SOCKS5: ${results.http_only_mode.socks5.success ? '✅ PASS' : '❌ FAIL'} ${results.http_only_mode.socks5.success ? `(${results.http_only_mode.socks5.duration}ms, ${results.http_only_mode.socks5.chainLength} steps)` : `(${results.http_only_mode.socks5.error})`}`);

  log(colors.blue, '\nBROWSER Mode:');
  log(colors.yellow, `  HTTP:   ${results.browser_mode.http.success ? '✅ PASS' : '❌ FAIL'} ${results.browser_mode.http.success ? `(${results.browser_mode.http.duration}ms, ${results.browser_mode.http.chainLength} steps)` : `(${results.browser_mode.http.error})`}`);
  log(colors.yellow, `  SOCKS5: ${results.browser_mode.socks5.success ? '✅ PASS' : '❌ FAIL'} ${results.browser_mode.socks5.success ? `(${results.browser_mode.socks5.duration}ms, ${results.browser_mode.socks5.chainLength} steps)` : `(${results.browser_mode.socks5.error})`}`);

  // Determine recommendation
  log(colors.magenta, '\n\n💡 Recommendation:');
  if (results.http_only_mode.socks5.success && !results.http_only_mode.http.success) {
    log(colors.green, '   ✅ Use SOCKS5 for this offer (HTTP fails due to TLS fingerprinting)');
  } else if (results.http_only_mode.http.success && results.http_only_mode.socks5.success) {
    log(colors.green, '   ✅ Both protocols work, HTTP is faster but SOCKS5 bypasses TLS fingerprinting');
  } else if (!results.http_only_mode.http.success && !results.http_only_mode.socks5.success) {
    log(colors.red, '   ❌ Both protocols fail, check proxy configuration');
  } else {
    log(colors.yellow, '   ⚠️  Mixed results, manual investigation recommended');
  }

  log(colors.reset, '\n');
}

// Run tests
runTests().catch(err => {
  log(colors.red, '\n❌ Fatal error:', err);
  process.exit(1);
});
