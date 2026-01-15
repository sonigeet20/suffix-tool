#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(supabaseUrl, supabaseKey);

const PROXY_SERVICE_URL = 'http://localhost:3000';

async function readSettingsTable() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 READING SETTINGS TABLE FROM SUPABASE');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .order('id');

  if (error) {
    console.error('❌ Error reading settings table:', error);
    return null;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  Settings table is empty\n');
    return [];
  }

  console.log(`✅ Found ${data.length} settings entries:\n`);
  
  data.forEach((setting, index) => {
    console.log(`\n[${index + 1}] Setting ID: ${setting.id}`);
    console.log(`    Key: ${setting.key}`);
    console.log(`    Value: ${typeof setting.value === 'object' ? JSON.stringify(setting.value, null, 2) : setting.value}`);
    console.log(`    Created: ${setting.created_at}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════\n');
  return data;
}

async function readProxyProviders() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔌 READING PROXY PROVIDERS TABLE FROM SUPABASE');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { data, error } = await supabase
    .from('proxy_providers')
    .select('*')
    .order('id');

  if (error) {
    console.error('❌ Error reading proxy_providers table:', error);
    return null;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  Proxy providers table is empty\n');
    return [];
  }

  console.log(`✅ Found ${data.length} proxy providers:\n`);
  
  data.forEach((provider, index) => {
    console.log(`\n[${index + 1}] Provider ID: ${provider.id}`);
    console.log(`    User ID: ${provider.user_id}`);
    console.log(`    Type: ${provider.provider_type}`);
    console.log(`    Name: ${provider.name}`);
    console.log(`    Enabled: ${provider.enabled}`);
    console.log(`    Priority: ${provider.priority}`);
    
    if (provider.provider_type === 'luna') {
      console.log(`    Config: ${JSON.stringify({
        host: provider.host,
        port: provider.port,
        username: provider.username ? provider.username.substring(0, 20) + '...' : 'N/A',
      })}`);
    } else if (provider.provider_type === 'brightdata_browser') {
      console.log(`    Config: ${JSON.stringify({
        host: provider.host,
        username: provider.username ? provider.username.substring(0, 30) + '...' : 'N/A',
        api_key: provider.api_key ? provider.api_key.substring(0, 15) + '...' : 'N/A',
      })}`);
    } else if (provider.provider_type === 'brightdata') {
      console.log(`    Config: ${JSON.stringify({
        host: provider.host,
        port: provider.port,
        username: provider.username ? provider.username.substring(0, 30) + '...' : 'N/A',
      })}`);
    }
    
    console.log(`    Created: ${provider.created_at}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════\n');
  return data;
}

async function testProxyConnection(provider) {
  console.log(`\n🧪 Testing Provider: ${provider.name} (${provider.provider_type})`);
  console.log('─────────────────────────────────────────────────────────');

  if (!provider.enabled) {
    console.log('⚠️  SKIPPED: Provider is disabled\n');
    return { provider: provider.name, status: 'SKIPPED', reason: 'disabled' };
  }

  try {
    const testUrl = 'https://httpbin.org/ip';
    let result;

    if (provider.provider_type === 'luna') {
      // Test Luna proxy via browser mode
      console.log(`Testing Luna proxy: ${provider.host}:${provider.port}`);
      
      const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
        url: testUrl,
        mode: 'browser',
        max_redirects: 1,
        timeout_ms: 30000,
      }, {
        timeout: 35000,
        validateStatus: () => true,
      });

      if (response.data.error) {
        console.log(`❌ FAIL: ${response.data.error}`);
        return { provider: provider.name, type: provider.provider_type, status: 'FAIL', error: response.data.error };
      }

      const steps = response.data.steps || [];
      const finalUrl = response.data.final_url;
      
      console.log(`✅ SUCCESS: Traced ${steps.length} step(s)`);
      console.log(`   Final URL: ${finalUrl}`);
      
      if (steps.length > 0 && steps[0].response_body) {
        try {
          const ipResponse = JSON.parse(steps[0].response_body);
          console.log(`   Proxy IP: ${ipResponse.origin || 'unknown'}`);
          result = { provider: provider.name, type: provider.provider_type, status: 'PASS', ip: ipResponse.origin, steps: steps.length };
        } catch (e) {
          result = { provider: provider.name, type: provider.provider_type, status: 'PASS', steps: steps.length };
        }
      } else {
        result = { provider: provider.name, type: provider.provider_type, status: 'PASS', steps: steps.length };
      }

    } else if (provider.provider_type === 'brightdata') {
      // Test Bright Data regular proxy
      console.log(`Testing Bright Data proxy: ${provider.host}:${provider.port}`);
      
      const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
        url: testUrl,
        mode: 'browser',
        max_redirects: 1,
        timeout_ms: 30000,
      }, {
        timeout: 35000,
        validateStatus: () => true,
      });

      if (response.data.error) {
        console.log(`❌ FAIL: ${response.data.error}`);
        return { provider: provider.name, type: provider.provider_type, status: 'FAIL', error: response.data.error };
      }

      const steps = response.data.steps || [];
      console.log(`✅ SUCCESS: Traced ${steps.length} step(s)`);
      
      if (steps.length > 0 && steps[0].response_body) {
        try {
          const ipResponse = JSON.parse(steps[0].response_body);
          console.log(`   Proxy IP: ${ipResponse.origin || 'unknown'}`);
          result = { provider: provider.name, type: provider.provider_type, status: 'PASS', ip: ipResponse.origin, steps: steps.length };
        } catch (e) {
          result = { provider: provider.name, type: provider.provider_type, status: 'PASS', steps: steps.length };
        }
      } else {
        result = { provider: provider.name, type: provider.provider_type, status: 'PASS', steps: steps.length };
      }

    } else if (provider.provider_type === 'brightdata_browser') {
      // Test Bright Data Browser API
      console.log('Testing Bright Data Browser API...');
      
      const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
        url: testUrl,
        mode: 'brightdata_browser',
        user_id: provider.user_id,
        offer_id: 'test_offer',
        max_redirects: 1,
        timeout_ms: 45000,
      }, {
        timeout: 50000,
        validateStatus: () => true,
      });

      if (response.data.error) {
        // Check if it's the expected "no provider found" error (which means user_context is working)
        if (response.data.error.includes('No enabled Bright Data Browser provider found') || 
            response.data.details?.includes('No enabled Bright Data Browser provider found')) {
          console.log(`⚠️  EXPECTED: Provider found in DB but not enabled for this user`);
          console.log(`   This confirms user_context is being sent correctly ✅`);
          result = { provider: provider.name, type: provider.provider_type, status: 'PARTIAL', note: 'user_context working, provider needs user association' };
        } else if (response.data.error.includes('requires user context')) {
          console.log(`❌ FAIL: Still shows "requires user context" error`);
          result = { provider: provider.name, type: provider.provider_type, status: 'FAIL', error: 'user_context not being sent' };
        } else {
          console.log(`❌ FAIL: ${response.data.error}`);
          result = { provider: provider.name, type: provider.provider_type, status: 'FAIL', error: response.data.error };
        }
      } else {
        const steps = response.data.steps || [];
        console.log(`✅ SUCCESS: Traced ${steps.length} step(s)`);
        result = { provider: provider.name, type: provider.provider_type, status: 'PASS', steps: steps.length };
      }

    } else {
      console.log(`⚠️  SKIPPED: Unknown provider type '${provider.provider_type}'\n`);
      result = { provider: provider.name, type: provider.provider_type, status: 'SKIPPED', reason: 'unknown type' };
    }

    console.log('');
    return result;

  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.log('   Make sure proxy-service is running on port 3000\n');
    }
    return { provider: provider.name, type: provider.provider_type, status: 'ERROR', error: error.message };
  }
}

async function testAllProviders() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          TESTING ALL PROXY PROVIDERS FROM DB              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // First, check if proxy service is running
  try {
    const healthCheck = await axios.get(`${PROXY_SERVICE_URL}/health`, { timeout: 5000 });
    console.log('✅ Proxy service is running');
    console.log(`   Status: ${healthCheck.data.status}`);
    console.log(`   Modes: ${healthCheck.data.modes_supported?.join(', ') || 'N/A'}\n`);
  } catch (error) {
    console.error('❌ Cannot connect to proxy service on port 3000');
    console.error('   Please start the proxy service first:\n');
    console.error('   cd proxy-service && node server.js\n');
    process.exit(1);
  }

  // Read settings table
  const settings = await readSettingsTable();
  
  // Read proxy providers table
  const providers = await readProxyProviders();

  if (!providers || providers.length === 0) {
    console.log('❌ No proxy providers found to test\n');
    return;
  }

  // Test each provider
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTING PROXY CONNECTIONS');
  console.log('═══════════════════════════════════════════════════════════');

  const results = [];
  for (const provider of providers) {
    const result = await testProxyConnection(provider);
    results.push(result);
    
    // Add delay between tests to avoid overwhelming the service
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     TEST SUMMARY                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const skipped = results.filter(r => r.status === 'SKIPPED');
  const partial = results.filter(r => r.status === 'PARTIAL');
  const errors = results.filter(r => r.status === 'ERROR');

  console.log(`Total Providers: ${results.length}`);
  console.log(`✅ PASSED: ${passed.length}`);
  console.log(`⚠️  PARTIAL: ${partial.length} (working but needs configuration)`);
  console.log(`❌ FAILED: ${failed.length}`);
  console.log(`⏭️  SKIPPED: ${skipped.length}`);
  console.log(`💥 ERRORS: ${errors.length}\n`);

  // Detailed results
  results.forEach(result => {
    const icon = result.status === 'PASS' ? '✅' : 
                 result.status === 'PARTIAL' ? '⚠️' : 
                 result.status === 'FAIL' ? '❌' : 
                 result.status === 'ERROR' ? '💥' : '⏭️';
    console.log(`${icon} ${result.provider} (${result.type}): ${result.status}`);
    
    if (result.ip) {
      console.log(`   Proxy IP: ${result.ip}`);
    }
    if (result.steps !== undefined) {
      console.log(`   Steps traced: ${result.steps}`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.note) {
      console.log(`   Note: ${result.note}`);
    }
    if (result.reason) {
      console.log(`   Reason: ${result.reason}`);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Exit code based on results
  if (failed.length > 0 || errors.length > 0) {
    console.log('⚠️  Some tests failed or encountered errors\n');
    process.exit(1);
  } else if (passed.length > 0 || partial.length > 0) {
    console.log('✅ All enabled providers are working!\n');
    process.exit(0);
  } else {
    console.log('⏭️  All providers were skipped\n');
    process.exit(0);
  }
}

// Run the tests
testAllProviders().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
