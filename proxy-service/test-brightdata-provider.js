#!/usr/bin/env node

/**
 * Test script for BrightData proxy provider from settings table
 * Tests that BrightData credentials from settings are correctly loaded and used
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const LOCAL_SERVER = 'http://localhost:3000';
const TEST_URL = 'https://httpbin.org/redirect/2';

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

async function testBrightDataProxy(bdSettings) {
  console.log(`\n🧪 Testing BrightData Proxy...`);
  console.log(`   Host: ${bdSettings.host}`);
  console.log(`   Port: ${bdSettings.port}`);
  console.log(`   Username: ${bdSettings.username?.substring(0, 20)}...`);
  
  const requestBody = {
    url: TEST_URL,
    max_redirects: 5,
    timeout_ms: 15000,
    mode: 'http_only',
    proxy_host: bdSettings.host,
    proxy_provider_port: bdSettings.port,
    proxy_provider_username: bdSettings.username,
    proxy_provider_password: bdSettings.password,
  };

  try {
    const startTime = Date.now();
    const response = await axios.post(`${LOCAL_SERVER}/trace`, requestBody, {
      timeout: 20000,
    });
    const elapsed = Date.now() - startTime;

    console.log(`✅ Success (${elapsed}ms)`);
    console.log(`   Proxy IP: ${response.data.proxy_ip || 'N/A'}`);
    console.log(`   Geo Location: ${response.data.geo_location?.country || 'N/A'} - ${response.data.geo_location?.city || 'N/A'}`);
    console.log(`   Steps: ${response.data.total_steps}`);
    console.log(`   Final URL: ${response.data.final_url?.substring(0, 60)}...`);
    console.log(`   ✓ BrightData proxy credentials accepted`);
    
    return { success: true, elapsed, data: response.data };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    if (error.response?.data) {
      console.log(`   Error: ${JSON.stringify(error.response.data)}`);
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.log(`   ⚠️  Timeout - BrightData proxy may be slow or credentials invalid`);
    }
    return { success: false, error: error.message };
  }
}

async function testWithGeoTargeting(bdSettings, targetCountry) {
  console.log(`\n🌍 Testing BrightData with Geo-Targeting: ${targetCountry.toUpperCase()}`);
  
  const requestBody = {
    url: TEST_URL,
    max_redirects: 5,
    timeout_ms: 15000,
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
      timeout: 20000,
    });
    const elapsed = Date.now() - startTime;

    console.log(`✅ Success (${elapsed}ms)`);
    console.log(`   Requested Country: ${targetCountry.toUpperCase()}`);
    console.log(`   Actual Country: ${response.data.geo_location?.country || 'N/A'}`);
    console.log(`   Proxy IP: ${response.data.proxy_ip || 'N/A'}`);
    
    const countryMatch = response.data.geo_location?.country?.toLowerCase() === targetCountry.toLowerCase();
    if (countryMatch) {
      console.log(`   ✅ Geo-targeting successful!`);
    } else {
      console.log(`   ⚠️  Geo-targeting may not have worked (got ${response.data.geo_location?.country})`);
    }
    
    return { success: true, elapsed, countryMatch, data: response.data };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 BrightData Proxy Provider Test Suite');
  console.log('========================================');
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

  // Load BrightData settings from database
  console.log('📡 Loading BrightData credentials from settings table...');
  let bdSettings;
  try {
    bdSettings = await loadBrightDataSettings();
    console.log('✅ BrightData settings loaded');
    
    if (!bdSettings.host || !bdSettings.port || !bdSettings.username || !bdSettings.password) {
      console.error('❌ Incomplete BrightData settings in database');
      console.log('Missing:', {
        host: !bdSettings.host,
        port: !bdSettings.port,
        username: !bdSettings.username,
        password: !bdSettings.password,
      });
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to load BrightData settings:', error.message);
    process.exit(1);
  }

  const results = [];

  // Test 1: Basic BrightData proxy
  console.log('\n📍 Test 1: BrightData Proxy (basic)');
  results.push(await testBrightDataProxy(bdSettings));

  // Test 2: BrightData with geo-targeting (US)
  console.log('\n📍 Test 2: BrightData Proxy with Geo-Targeting (US)');
  results.push(await testWithGeoTargeting(bdSettings, 'us'));

  // Test 3: BrightData with geo-targeting (GB)
  console.log('\n📍 Test 3: BrightData Proxy with Geo-Targeting (GB)');
  results.push(await testWithGeoTargeting(bdSettings, 'gb'));

  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('===============');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  console.log('\n💡 Notes:');
  console.log('   - BrightData proxy credentials loaded from settings table');
  console.log('   - Tests verify that custom proxy provider routing works');
  console.log('   - Check server logs for: "Using custom proxy provider: <host>:<port>"');
  console.log('   - Geo-targeting accuracy depends on BrightData\'s IP pool');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
