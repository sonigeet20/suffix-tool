#!/usr/bin/env node

/**
 * Sync BrightData whitelist with tracked instances
 * 
 * This script:
 * 1. Gets all unwhitelisted IPs from tracked_instance_ips table
 * 2. Attempts to whitelist each IP in BrightData
 * 3. Updates their whitelist status in the database
 * 4. Should be run periodically (cron or PM2)
 * 
 * Usage:
 *   node sync-brightdata-whitelist.js
 * 
 * Run periodically (cron example):
 *   Every 5 minutes: cd /path/to/proxy-service && node sync-brightdata-whitelist.js >> /var/log/brightdata-sync.log 2>&1
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
 * Get unwhitelisted instances from database
 */
async function getUnwhitelistedInstances(supabase) {
  const { data, error } = await supabase
    .from('tracked_instance_ips')
    .select('id, instance_id, public_ip')
    .eq('whitelisted', false)
    .order('created_at', { ascending: true })
    .limit(10); // Process max 10 per run to avoid rate limiting

  if (error) {
    throw new Error(`Failed to fetch instances: ${error.message}`);
  }

  return data || [];
}

/**
 * Try to whitelist IP via BrightData local API
 */
async function whitelistIP(ip) {
  // BrightData local API endpoints
  // Reference: https://docs.brightdata.com/api-reference/proxy-manager/allowlist-ips
  
  const endpoints = [
    {
      name: 'Proxy Allowlist',
      url: 'http://127.0.0.1:22999/api/wip',
    },
    {
      name: 'UI Allowlist',
      url: 'http://127.0.0.1:22999/api/add_whitelist_ip',
    },
  ];

  for (const endpoint of endpoints) {
    try {
      logger.info(`Trying ${endpoint.name}...`);
      
      const response = await axios.put(endpoint.url, {
        ip: ip,
      }, {
        headers: {
          'Authorization': 'API key',
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      });

      logger.info(`✅ Successfully whitelisted ${ip} via ${endpoint.name}`);
      return { success: true, data: response.data };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logger.warn('Local API not available on this endpoint');
        continue;
      }
      
      if (error.response?.status === 409) {
        // Already whitelisted
        logger.info(`ℹ️ IP ${ip} already whitelisted`);
        return { success: true, data: { alreadyWhitelisted: true } };
      }

      logger.warn(`${endpoint.name} error: ${error.response?.status || error.message}`);
      continue;
    }
  }

  return {
    success: false,
    error: 'Local API not available',
    requiresManual: true,
  };
}

/**
 * Update instance IP whitelist status
 */
async function updateWhitelistStatus(supabase, instanceId, whitelisted, error = null) {
  const { data, error: updateError } = await supabase
    .from('tracked_instance_ips')
    .update({
      whitelisted: whitelisted,
      last_whitelist_attempt: new Date().toISOString(),
      whitelist_error: error,
    })
    .eq('instance_id', instanceId)
    .select();

  if (updateError) {
    logger.error(`Failed to update ${instanceId}: ${updateError.message}`);
    return null;
  }

  return data;
}

/**
 * Main sync function
 */
async function syncBrightDataWhitelist() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔐 BrightData Whitelist Sync');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get unwhitelisted IPs
    logger.info('Fetching unwhitelisted instances...');
    const instances = await getUnwhitelistedInstances(supabase);

    if (instances.length === 0) {
      console.log('✅ All instances are whitelisted!');
      console.log('');
      process.exit(0);
    }

    console.log(`Found ${instances.length} unwhitelisted instance(s):`);
    console.log('');

    let whitelisted = 0;
    let failed = 0;
    let manualRequired = 0;

    // Process each instance
    for (const instance of instances) {
      const result = await whitelistIP(instance.public_ip);

      if (result.success) {
        await updateWhitelistStatus(supabase, instance.instance_id, true, null);
        console.log(`✅ ${instance.instance_id}: ${instance.public_ip} whitelisted`);
        whitelisted++;
      } else if (result.requiresManual) {
        logger.warn(`${instance.instance_id}: ${instance.public_ip} - Manual whitelisting required`);
        manualRequired++;
        // Don't mark as whitelisted, but don't fail either
      } else {
        await updateWhitelistStatus(supabase, instance.instance_id, false, result.error);
        console.log(`❌ ${instance.instance_id}: ${instance.public_ip} - ${result.error}`);
        failed++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 Summary:');
    console.log(`   ✅ Whitelisted: ${whitelisted}`);
    console.log(`   ⏳ Manual required: ${manualRequired}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('═══════════════════════════════════════════════════════════');

    if (manualRequired > 0) {
      console.log('');
      console.log('📋 Manual Action Required:');
      for (const instance of instances) {
        const result = await whitelistIP(instance.public_ip);
        if (result.requiresManual) {
          console.log(`   • ${instance.instance_id}: ${instance.public_ip}`);
        }
      }
      console.log('');
      console.log('Go to: https://brightdata.com/cp/zones');
      console.log('Zone: testing_softality_1');
      console.log('Click: Zone Settings → IP Whitelist');
    }

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error('Sync failed:', error.message);
    console.error('');
    process.exit(1);
  }
}

if (require.main === module) {
  syncBrightDataWhitelist();
}

module.exports = { syncBrightDataWhitelist };
