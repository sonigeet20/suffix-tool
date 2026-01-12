#!/usr/bin/env node

/**
 * Register current instance IP in Supabase tracked_instance_ips table
 * This enables automatic tracking and whitelisting of new EC2 instances
 * 
 * Run this on EC2 instance startup to register the IP
 * Then auto-whitelist-brightdata.js will whitelist it
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
 * Get instance ID from AWS metadata
 */
async function getInstanceId() {
  try {
    const response = await axios.get('http://169.254.169.254/latest/meta-data/instance-id', {
      timeout: 2000,
    });
    return response.data;
  } catch (error) {
    logger.warn('Failed to get instance ID from AWS metadata');
    // Fallback: use hostname or generate ID
    const os = require('os');
    return `manual-${os.hostname()}`;
  }
}

/**
 * Get current instance's public IP
 */
async function getPublicIP() {
  try {
    // Try AWS EC2 metadata service first
    logger.info('Getting IP from AWS metadata...');
    const response = await axios.get('http://169.254.169.254/latest/meta-data/public-ipv4', {
      timeout: 2000,
    });
    return response.data;
  } catch (error) {
    logger.warn('AWS metadata not available, using external service...');
    try {
      const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      return response.data.ip;
    } catch (err) {
      throw new Error('Failed to detect public IP');
    }
  }
}

/**
 * Register instance IP in Supabase
 */
async function registerInstanceIP(instanceId, publicIP) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  logger.info(`Registering instance ${instanceId} with IP ${publicIP}...`);

  const { data, error } = await supabase
    .from('tracked_instance_ips')
    .upsert({
      instance_id: instanceId,
      public_ip: publicIP,
      whitelisted: false,
    }, {
      onConflict: 'instance_id',
    })
    .select();

  if (error) {
    throw new Error(`Failed to register instance: ${error.message}`);
  }

  return data;
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔐 BrightData Instance IP Registration');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  try {
    // Get instance metadata
    logger.info('Step 1: Getting instance metadata...');
    const [instanceId, publicIP] = await Promise.all([
      getInstanceId(),
      getPublicIP(),
    ]);

    console.log(`📍 Instance ID: ${instanceId}`);
    console.log(`📍 Public IP: ${publicIP}`);
    console.log('');

    // Register in database
    logger.info('Step 2: Registering in Supabase...');
    const result = await registerInstanceIP(instanceId, publicIP);

    console.log('');
    console.log('✅ SUCCESS!');
    console.log(`   Instance ${instanceId} registered`);
    console.log(`   IP ${publicIP} will be whitelisted automatically`);
    console.log('');
    console.log('📋 Next: Run auto-whitelist-brightdata.js to whitelist the IP');
    console.log('   node auto-whitelist-brightdata.js');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Ensure SUPABASE_URL is set');
    console.error('  2. Ensure SUPABASE_SERVICE_ROLE_KEY is set');
    console.error('  3. Ensure tracked_instance_ips table exists (run migration)');
    console.error('');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { registerInstanceIP, getPublicIP, getInstanceId };
