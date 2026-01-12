#!/usr/bin/env node

/**
 * Local test script for proxy provider routing
 * Tests that custom proxy providers are correctly passed and used
 */

const axios = require('axios');

const LOCAL_SERVER = 'http://localhost:3000';
const TEST_URL = 'https://httpbin.org/redirect/2';

// Test proxy providers (using mock credentials for testing)
const testProviders = {
  luna: {
    name: 'Luna (default)',
    host: null, // Will use default from settings
    port: null,
    username: null,
    password: null,
  },
  webshare: {
    name: 'Webshare',
    host: 'p.webshare.io',
    port: 80,
    username: 'test-webshare-user',
    password: 'test-webshare-pass',
  },
  oxylabs: {
    name: 'Oxylabs',
    host: 'pr.oxylabs.io',
    port: 7777,
    username: 'customer-test-cc-us',
    password: 'test-oxylabs-pass',
  },
};

async function testProxyProvider(providerKey) {
  const provider = testProviders[providerKey];
  console.log(`\n🧪 Testing ${provider.name}...`);
  console.log(`   Host: ${provider.host || 'default Luna'}`);
  
  const requestBody = {
    url: TEST_URL,
    max_redirects: 5,
    timeout_ms: 10000,
    mode: 'http_only',
  };

  // Add custom proxy provider credentials if specified
  if (provider.host) {
    requestBody.proxy_host = provider.host;
    requestBody.proxy_provider_port = provider.port;
    requestBody.proxy_provider_username = provider.username;
    requestBody.proxy_provider_password = provider.password;
  }

  try {
    const startTime = Date.now();
    const response = await axios.post(`${LOCAL_SERVER}/trace`, requestBody, {
      timeout: 15000,
    });
    const elapsed = Date.now() - startTime;

    console.log(`✅ Success (${elapsed}ms)`);
    console.log(`   Proxy IP: ${response.data.proxy_ip || 'N/A'}`);
    console.log(`   Steps: ${response.data.total_steps}`);
    console.log(`   Final URL: ${response.data.final_url?.substring(0, 60)}...`);
    
    // Check if custom proxy was acknowledged
    if (provider.host && response.data.mode_used) {
      console.log(`   ✓ Custom proxy acknowledged in response`);
    }
    
    return { success: true, provider: providerKey, elapsed, data: response.data };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    if (error.response?.data) {
      console.log(`   Error: ${JSON.stringify(error.response.data)}`);
    }
    return { success: false, provider: providerKey, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Proxy Provider Routing Test Suite');
  console.log('=====================================');
  console.log(`Target URL: ${TEST_URL}`);
  console.log(`Local Server: ${LOCAL_SERVER}`);

  // Check if server is running
  try {
    await axios.get(`${LOCAL_SERVER}/health`, { timeout: 2000 });
    console.log('✅ Server is running\n');
  } catch (error) {
    console.error('❌ Server is not running! Start it with: npm start');
    process.exit(1);
  }

  const results = [];

  // Test 1: Default Luna proxy
  console.log('\n📍 Test 1: Default Luna Proxy (no custom provider)');
  results.push(await testProxyProvider('luna'));

  // Test 2: Webshare proxy
  console.log('\n📍 Test 2: Custom Webshare Proxy');
  results.push(await testProxyProvider('webshare'));

  // Test 3: Oxylabs proxy
  console.log('\n📍 Test 3: Custom Oxylabs Proxy');
  results.push(await testProxyProvider('oxylabs'));

  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('===============');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    const provider = testProviders[result.provider].name;
    console.log(`${icon} ${provider}: ${result.success ? `${result.elapsed}ms` : result.error}`);
  });

  console.log('\n💡 Notes:');
  console.log('   - Webshare and Oxylabs tests will fail if credentials are not real');
  console.log('   - The important check is that the server ACCEPTS the custom proxy parameters');
  console.log('   - Check server logs to verify custom proxy credentials are being used');
  console.log('   - Look for log line: "Using custom proxy provider: <host>:<port>"');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
