#!/usr/bin/env node

/**
 * Comprehensive BrightData geo-targeting test
 * Tests real geo-targeting with IP location verification
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const LOCAL_SERVER = 'http://localhost:3000';
// Use a URL that returns IP info
const TEST_URL = 'https://ipapi.co/json/';

async function loadBrightDataSettings() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('settings')
    .select('bright_data_proxy_host, bright_data_proxy_port, bright_data_proxy_username, bright_data_proxy_password')
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Failed to load BrightData settings: ' + (error?.message || 'No data'));
  }

  return {
    host: data.bright_data_proxy_host,
    port: data.bright_data_proxy_port,
    username: data.bright_data_proxy_username,
    password: data.bright_data_proxy_password,
  };
}

async function testGeoTargeting(bdSettings, targetCountry, countryName) {
  console.log(`\n🌍 Testing Geo-Targeting: ${countryName} (${targetCountry.toUpperCase()})`);
  console.log(`   Target URL: ${TEST_URL}`);
  console.log(`   Proxy: ${bdSettings.host}:${bdSettings.port}`);
  
  const requestBody = {
    url: TEST_URL,
    max_redirects: 0,
    timeout_ms: 20000,
    mode: 'http_only',
    target_country: targetCountry,
    proxy_host: bdSettings.host,
    proxy_provider_port: bdSettings.port,
    proxy_provider_username: bdSettings.username,
    proxy_provider_password: bdSettings.password,
  };

  try {
    const startTime = Date.now();
    const response = await axios.post(`${LOCAL_SERVER}/trace`, requestBody, {
      timeout: 25000,
    });
    const elapsed = Date.now() - startTime;

    console.log(`\n✅ Trace Completed (${elapsed}ms)`);
    console.log(`   Total Steps: ${response.data.total_steps}`);
    console.log(`   Proxy IP: ${response.data.proxy_ip || 'N/A'}`);
    console.log(`   Geo Location (from proxy service):`);
    console.log(`     - Country: ${response.data.geo_location?.country || 'N/A'}`);
    console.log(`     - City: ${response.data.geo_location?.city || 'N/A'}`);
    console.log(`     - Region: ${response.data.geo_location?.region || 'N/A'}`);

    // Parse the final page content to see actual IP info
    if (response.data.chain && response.data.chain.length > 0) {
      const finalStep = response.data.chain[response.data.chain.length - 1];
      
      console.log(`\n   📄 Response from ${TEST_URL}:`);
      
      if (finalStep.page_content) {
        try {
          // Try to parse as JSON (ipapi.co returns JSON)
          const ipInfo = JSON.parse(finalStep.page_content);
          console.log(`     - IP: ${ipInfo.ip}`);
          console.log(`     - Country: ${ipInfo.country_name} (${ipInfo.country})`);
          console.log(`     - City: ${ipInfo.city}`);
          console.log(`     - Region: ${ipInfo.region}`);
          console.log(`     - ISP: ${ipInfo.org}`);
          
          // Verify geo-targeting worked
          const requestedCountry = targetCountry.toUpperCase();
          const actualCountry = ipInfo.country?.toUpperCase();
          
          if (actualCountry === requestedCountry) {
            console.log(`\n   ✅ GEO-TARGETING SUCCESS! Got ${actualCountry} as requested`);
            return { success: true, elapsed, matched: true, actualCountry, ipInfo };
          } else {
            console.log(`\n   ⚠️  GEO-TARGETING MISMATCH: Requested ${requestedCountry}, got ${actualCountry}`);
            return { success: true, elapsed, matched: false, actualCountry, ipInfo };
          }
        } catch (parseErr) {
          console.log(`     (Could not parse response as JSON)`);
          console.log(`     Raw content preview: ${finalStep.page_content?.substring(0, 200)}...`);
        }
      }
    }
    
    return { success: true, elapsed, matched: null };
  } catch (error) {
    console.log(`\n❌ Failed: ${error.message}`);
    if (error.response?.data) {
      console.log(`   Error: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.log(`   ⚠️  Timeout - proxy may be slow or credentials invalid`);
    }
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('🚀 BrightData Geo-Targeting Test Suite');
  console.log('═══════════════════════════════════════════════');
  console.log(`Local Server: ${LOCAL_SERVER}`);

  // Check if server is running
  try {
    await axios.get(`${LOCAL_SERVER}/health`, { timeout: 2000 });
    console.log('✅ Proxy service is running\n');
  } catch (error) {
    console.error('❌ Proxy service not running! Start with: node server.js');
    process.exit(1);
  }

  // Load BrightData settings
  console.log('📡 Loading BrightData credentials from database...');
  let bdSettings;
  try {
    bdSettings = await loadBrightDataSettings();
    console.log('✅ BrightData settings loaded');
    console.log(`   Host: ${bdSettings.host}`);
    console.log(`   Port: ${bdSettings.port}`);
    console.log(`   Username: ${bdSettings.username?.substring(0, 25)}...`);
  } catch (error) {
    console.error('❌ Failed to load BrightData settings:', error.message);
    process.exit(1);
  }

  const testCases = [
    { code: 'us', name: 'United States' },
    { code: 'gb', name: 'United Kingdom' },
    { code: 'de', name: 'Germany' },
    { code: 'jp', name: 'Japan' },
  ];

  const results = [];
  
  for (const testCase of testCases) {
    const result = await testGeoTargeting(bdSettings, testCase.code, testCase.name);
    results.push({ ...result, country: testCase.code });
    
    // Wait a bit between tests to avoid rate limiting
    if (testCases.indexOf(testCase) < testCases.length - 1) {
      console.log('\n   ⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Summary
  console.log('\n\n═══════════════════════════════════════════════');
  console.log('📊 Test Results Summary');
  console.log('═══════════════════════════════════════════════');
  
  const successful = results.filter(r => r.success);
  const matched = results.filter(r => r.matched === true);
  const mismatched = results.filter(r => r.matched === false);
  const unknown = results.filter(r => r.matched === null);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`🎯 Geo Match: ${matched.length}/${results.length}`);
  console.log(`❌ Geo Mismatch: ${mismatched.length}/${results.length}`);
  console.log(`❓ Unknown: ${unknown.length}/${results.length}`);
  
  console.log('\nDetailed Results:');
  results.forEach(result => {
    const icon = result.matched ? '✅' : result.matched === false ? '⚠️' : '❓';
    const country = result.country.toUpperCase();
    const actual = result.actualCountry || 'N/A';
    console.log(`${icon} ${country}: ${result.success ? `Got ${actual} (${result.elapsed}ms)` : result.error}`);
  });

  console.log('\n💡 Notes:');
  console.log('   ✅ = Geo-targeting worked perfectly');
  console.log('   ⚠️  = Request succeeded but wrong country');
  console.log('   ❓ = Could not verify geo-targeting');
  console.log('   ❌ = Request failed');
  console.log('\n   Check /tmp/proxy-test-server.log for detailed server logs');

  const failed = results.filter(r => !r.success).length;
  const geoFailed = results.filter(r => r.matched === false).length;
  
  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed completely`);
  }
  if (geoFailed > 0) {
    console.log(`⚠️  ${geoFailed} test(s) had geo-targeting mismatches`);
  }
  if (matched.length === results.length) {
    console.log('\n🎉 All geo-targeting tests PASSED!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
