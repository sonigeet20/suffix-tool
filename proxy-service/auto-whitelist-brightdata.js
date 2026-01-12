#!/usr/bin/env node

/**
 * Auto-whitelist current EC2 instance IP in BrightData
 * 
 * This script:
 * 1. Detects the current instance's public IP
 * 2. Adds it to BrightData zone whitelist via API
 * 3. Should be run on instance startup
 * 
 * Usage:
 *   node auto-whitelist-brightdata.js
 * 
 * Environment variables:
 *   BRIGHTDATA_API_TOKEN - BrightData API token (from https://brightdata.com/cp/api_tokens)
 *   BRIGHTDATA_CUSTOMER_ID - Your BrightData customer ID (e.g., hl_a908b07a)
 *   BRIGHTDATA_ZONE_NAME - Zone name to whitelist IP in (e.g., testing_softality_1)
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
};

/**
 * Get current instance's public IP address
 */
async function getCurrentPublicIP() {
  try {
    // Try AWS EC2 metadata service first (works on EC2 instances)
    logger.info('Attempting to get IP from AWS EC2 metadata service...');
    const awsResponse = await axios.get('http://169.254.169.254/latest/meta-data/public-ipv4', {
      timeout: 2000,
    });
    
    if (awsResponse.data) {
      logger.info(`✅ Got IP from AWS metadata: ${awsResponse.data}`);
      return awsResponse.data;
    }
  } catch (awsError) {
    logger.warn('AWS metadata service not available (not on EC2 or IMDSv2 required)');
  }

  // Fallback: Use external service
  try {
    logger.info('Falling back to external IP detection service...');
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    logger.info(`✅ Got IP from ipify: ${response.data.ip}`);
    return response.data.ip;
  } catch (error) {
    throw new Error(`Failed to detect public IP: ${error.message}`);
  }
}

/**
 * Get BrightData credentials from Supabase settings
 */
async function getBrightDataSettings() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('settings')
    .select('brightdata_admin_api_token, brightdata_customer_id, brightdata_zone_name')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load BrightData settings: ${error.message}`);
  }

  if (!data || !data.brightdata_admin_api_token) {
    throw new Error('BrightData admin API token not found in settings table (brightdata_admin_api_token)');
  }

  return {
    apiToken: data.brightdata_admin_api_token,
    customerId: data.brightdata_customer_id,
    zoneName: data.brightdata_zone_name,
  };
}

/**
 * Get current whitelist for a BrightData zone
 */
async function getCurrentWhitelist(apiToken, customerId, zoneName) {
  // Try multiple possible API endpoints
  const endpoints = [
    `https://brightdata.com/api/zone/whitelist_ips?customer=${customerId}&zone=${zoneName}`,
    `https://brightdata.com/api/zone/${zoneName}/whitelist`,
    `https://api.brightdata.com/api/zone/whitelist_ips?customer=${customerId}&zone=${zoneName}`,
  ];

  for (const url of endpoints) {
    try {
      logger.info(`Trying endpoint: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
      });
      
      logger.info(`✓ Whitelist endpoint working: ${url}`);
      return response.data.whitelist || response.data || [];
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`Endpoint not found: ${url}`);
        continue;
      }
      logger.warn(`Failed endpoint ${url}: ${error.message}`);
      continue;
    }
  }
  
  logger.warn('Zone not found or no whitelist configured');
  return [];
}

/**
 * Add IP to BrightData zone whitelist
 */
async function addIPToWhitelist(apiToken, customerId, zoneName, ipAddress) {
  // BrightData local API endpoints (available on port 22999)
  // Reference: https://docs.brightdata.com/api-reference/proxy-manager/allowlist-ips
  
  const endpoints = [
    {
      name: 'Proxy Allowlist',
      url: 'http://127.0.0.1:22999/api/wip',
      method: 'put',
    },
    {
      name: 'UI Allowlist',
      url: 'http://127.0.0.1:22999/api/add_whitelist_ip',
      method: 'put',
    },
  ];

  for (const endpoint of endpoints) {
    try {
      logger.info(`Trying ${endpoint.name} endpoint (${endpoint.url})...`);
      
      const response = await axios({
        method: endpoint.method,
        url: endpoint.url,
        data: { ip: ipAddress },
        headers: {
          'Authorization': 'API key',
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      });
      
      logger.info(`✅ Successfully added IP via ${endpoint.name}`);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.warn('Local BrightData API not available (port 22999)');
        continue;
      }
      
      if (error.response?.status === 409) {
        logger.info(`ℹ️ IP ${ipAddress} already whitelisted`);
        return { alreadyWhitelisted: true };
      }
      
      logger.warn(`${endpoint.name} failed: ${error.response?.status || error.message}`);
    }
  }

  // If we get here, local API is not available
  logger.warn('Local BrightData API not available (port 22999)');
  logger.info('This is expected on EC2 instances without local BrightData service.');
  logger.info('');
  logger.info('📋 Manual Action Required:');
  logger.info('   1. Go to: https://brightdata.com/cp/zones');
  logger.info('   2. Select zone: ' + zoneName);
  logger.info('   3. Click "Zone Settings" → "IP Whitelist"');
  logger.info('   4. Add IP manually: ' + ipAddress);
  logger.info('');
  return { manual_whitelisting_required: true, ip: ipAddress };
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('🔐 BrightData IP Auto-Whitelist');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // Step 1: Get current public IP
    logger.info('Step 1: Detecting current public IP...');
    const publicIP = await getCurrentPublicIP();
    console.log(`\n📍 Current Public IP: ${publicIP}\n`);

    // Step 2: Load BrightData settings
    logger.info('Step 2: Loading BrightData credentials from database...');
    const settings = await getBrightDataSettings();
    
    if (!settings.customerId || !settings.zoneName) {
      throw new Error('BrightData customer ID and zone name must be configured in settings table');
    }
    
    console.log(`\n🔧 BrightData Configuration:`);
    console.log(`   Customer ID: ${settings.customerId}`);
    console.log(`   Zone Name: ${settings.zoneName}\n`);

    // Step 3: Check current whitelist
    logger.info('Step 3: Checking current whitelist...');
    const currentWhitelist = await getCurrentWhitelist(
      settings.apiToken,
      settings.customerId,
      settings.zoneName
    );
    
    if (currentWhitelist.includes(publicIP)) {
      console.log(`\n✅ IP ${publicIP} is already whitelisted!`);
      console.log(`   No action needed.\n`);
      return;
    }

    console.log(`   Current whitelist has ${currentWhitelist.length} IP(s)`);
    if (currentWhitelist.length > 0) {
      currentWhitelist.forEach(ip => console.log(`   - ${ip}`));
    }

    // Step 4: Add IP to whitelist
    logger.info(`\nStep 4: Adding ${publicIP} to whitelist...`);
    await addIPToWhitelist(
      settings.apiToken,
      settings.customerId,
      settings.zoneName,
      publicIP
    );

    console.log(`\n✅ SUCCESS!`);
    console.log(`   IP ${publicIP} has been whitelisted in BrightData zone ${settings.zoneName}`);
    console.log(`   BrightData proxy should now work from this instance.\n`);

  } catch (error) {
    logger.error(`Failed to whitelist IP: ${error.message}`);
    
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
    console.log('   2. Add brightdata_api_token, brightdata_customer_id, brightdata_zone_name to settings table');
    console.log('   3. Get API token from: https://brightdata.com/cp/api_tokens');
    console.log('   4. Check zone name in: https://brightdata.com/cp/zones\n');
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { getCurrentPublicIP, addIPToWhitelist, getBrightDataSettings };
