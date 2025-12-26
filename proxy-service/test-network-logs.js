#!/usr/bin/env node
/**
 * Test script to trace URLs and check for hidden retries in network logs
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test URLs
const TEST_URLS = [
  'https://example.com',
  'https://httpbin.org/redirect-to?url=https://httpbin.org/get',
];

async function testTraceMode(url, mode) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing ${mode.toUpperCase()} mode on ${url}`);
  console.log('='.repeat(80));

  try {
    const response = await axios.post(`${BASE_URL}/trace`, {
      url,
      mode,
      max_redirects: 20,
      timeout_ms: mode === 'anti_cloaking' ? 90000 : 60000,
    }, {
      timeout: mode === 'anti_cloaking' ? 120000 : 90000,
    });

    const data = response.data;

    if (data.network_stats) {
      console.log(`\n📊 Network Statistics:`);
      console.log(`   • Total Network Clicks: ${data.network_stats.total_network_clicks}`);
      console.log(`   • Document Requests: ${data.network_stats.document_requests}`);
      console.log(`   • Retry Attempts: ${data.network_stats.retry_attempts}`);
      console.log(`   • Request Ratio: ${data.network_stats.request_ratio}x`);
      
      if (data.network_stats.request_ratio > 2) {
        console.log(`   ⚠️  WARNING: High retry ratio detected! (${data.network_stats.request_ratio}x)`);
      } else if (data.network_stats.request_ratio === 1) {
        console.log(`   ✅ Perfect 1:1 ratio - no hidden retries!`);
      }
    }

    console.log(`\n📍 Redirect Chain (${data.total_steps} steps):`);
    data.chain.forEach((step, idx) => {
      console.log(`   ${idx + 1}. ${step.redirect_type.toUpperCase()}: ${step.url.substring(0, 70)}`);
      if (step.status) {
        console.log(`      └─ Status: ${step.status}${step.bandwidth_bytes ? `, Size: ${(step.bandwidth_bytes / 1024).toFixed(2)}KB` : ''}`);
      }
    });

    console.log(`\n✅ Final URL: ${data.final_url}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

async function main() {
  console.log('🚀 Starting Network Retry Detection Tests\n');

  // Test browser mode first
  for (const url of TEST_URLS) {
    await testTraceMode(url, 'browser');
  }

  // Then test anti-cloaking
  for (const url of TEST_URLS) {
    await testTraceMode(url, 'anti_cloaking');
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Tests complete! Check the server logs above for detailed network events.');
  console.log('='.repeat(80));
}

main().catch(console.error);
