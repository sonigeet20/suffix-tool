#!/usr/bin/env node

/**
 * Detailed IP rotation test for anti-cloaking mode
 * Testing with longer delays and detailed logging
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_URL = 'https://example.com';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAntiCloakingIpRotation() {
  console.log('\n' + '='.repeat(70));
  console.log('DETAILED ANTI-CLOAKING IP ROTATION TEST');
  console.log('='.repeat(70));

  const traces = [];
  const delayBetweenTraces = 2000; // 2 seconds between traces

  console.log(`\nTesting with ${delayBetweenTraces}ms delay between traces\n`);

  for (let i = 0; i < 4; i++) {
    console.log(`📍 Trace ${i + 1}/4...`);
    
    try {
      const response = await axios.post(`${BASE_URL}/trace`, {
        url: TEST_URL,
        mode: 'anti_cloaking',
        timeout_ms: 15000,
        max_redirects: 2,
      }, { timeout: 120000 });

      const trace = {
        traceNum: i + 1,
        ip: response.data.proxy_ip,
        location: `${response.data.geo_location.city}, ${response.data.geo_location.country}`,
        success: response.data.success,
        timing: response.data.total_timing_ms,
      };

      traces.push(trace);

      console.log(`  ✓ IP: ${trace.ip}`);
      console.log(`  ✓ Location: ${trace.location}`);
      console.log(`  ✓ Success: ${trace.success}`);
      console.log(`  ✓ Timing: ${trace.timing}ms\n`);

      if (i < 3) {
        console.log(`  ⏳ Waiting ${delayBetweenTraces}ms before next trace...\n`);
        await sleep(delayBetweenTraces);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}\n`);
      traces.push({
        traceNum: i + 1,
        error: error.message,
      });
    }
  }

  // Analysis
  console.log('\n' + '='.repeat(70));
  console.log('RESULTS ANALYSIS');
  console.log('='.repeat(70));

  const successfulTraces = traces.filter(t => !t.error);
  const ips = new Set(successfulTraces.map(t => t.ip));
  const uniqueIPs = Array.from(ips);

  console.log(`\n📊 Summary:`);
  console.log(`  Total traces: ${traces.length}`);
  console.log(`  Successful: ${successfulTraces.length}`);
  console.log(`  Unique IPs: ${uniqueIPs.length}`);
  console.log(`  IP Rotation: ${uniqueIPs.length > 1 ? '✅ WORKING' : '⚠️ NOT WORKING'}\n`);

  console.log(`📋 Trace Details:`);
  traces.forEach((trace, i) => {
    if (trace.error) {
      console.log(`  Trace ${i + 1}: ❌ ${trace.error}`);
    } else {
      const isDuplicate = traces.slice(0, i).some(t => t.ip === trace.ip);
      const marker = isDuplicate ? '⚠️' : '✅';
      console.log(`  Trace ${i + 1}: ${marker} IP ${trace.ip} (${trace.location})`);
    }
  });

  console.log(`\n🔍 IP Rotation Pattern:`);
  const ipSequence = successfulTraces.map(t => `${t.ip.substring(0, 8)}...`).join(' → ');
  console.log(`  ${ipSequence}\n`);

  if (uniqueIPs.length === 1) {
    console.log('⚠️ NOTE: All traces got the same IP. This could indicate:');
    console.log('   1. Luna Proxy rate limiting / caching behavior');
    console.log('   2. Browser session closing may not be triggering new connections');
    console.log('   3. Need longer delay or additional connection reset\n');
  }

  console.log('='.repeat(70) + '\n');
}

testAntiCloakingIpRotation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
