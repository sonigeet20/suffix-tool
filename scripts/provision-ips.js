#!/usr/bin/env node

/**
 * IP Pool Provisioning Script
 *
 * Provisions Luna proxy IPs to the ip_rotation_pool table for parallel tracing.
 * Each "IP" represents a proxy endpoint that can handle concurrent requests.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const POOL_CONFIG = {
  // Provision IPs per country
  countries: {
    us: 50,   // 50 concurrent USA traces
    uk: 20,   // 20 concurrent UK traces
    ca: 15,   // 15 concurrent Canada traces
    au: 10,   // 10 concurrent Australia traces
    de: 5,    // 5 concurrent Germany traces
  },

  // Luna proxy settings (will use rotating residential IPs)
  provider: 'luna',
  port: '7000',
};

async function clearExistingIPs() {
  console.log('🗑️  Clearing existing IPs...');

  const { error } = await supabase
    .from('ip_rotation_pool')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (error) {
    console.error('❌ Failed to clear existing IPs:', error.message);
    return false;
  }

  console.log('✅ Existing IPs cleared');
  return true;
}

async function provisionCountryIPs(country, count) {
  console.log(`\n📡 Provisioning ${count} IPs for ${country.toUpperCase()}...`);

  const ips = [];
  for (let i = 1; i <= count; i++) {
    ips.push({
      ip_address: `luna-${country}-slot-${i}`,
      ip_port: POOL_CONFIG.port,
      country: country,
      provider: POOL_CONFIG.provider,
      status: 'available',
      is_healthy: true,
      notes: `Auto-provisioned Luna residential proxy endpoint ${i} for ${country}`,
    });
  }

  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < ips.length; i += batchSize) {
    const batch = ips.slice(i, i + batchSize);

    const { error } = await supabase
      .from('ip_rotation_pool')
      .insert(batch);

    if (error) {
      console.error(`❌ Failed to provision batch ${i / batchSize + 1}:`, error.message);
      return false;
    }

    console.log(`  ✅ Batch ${i / batchSize + 1}: ${batch.length} IPs provisioned`);
  }

  return true;
}

async function verifyProvisioning() {
  console.log('\n🔍 Verifying provisioning...');

  const { data, error } = await supabase
    .from('ip_rotation_pool')
    .select('country, status, provider')
    .eq('is_healthy', true);

  if (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }

  const summary = data.reduce((acc, ip) => {
    acc[ip.country] = (acc[ip.country] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📊 Provisioning Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  Object.entries(summary).forEach(([country, count]) => {
    console.log(`  ${country.toUpperCase()}: ${count} IPs`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  TOTAL: ${data.length} IPs`);
  console.log('');

  return true;
}

async function main() {
  console.log('🚀 IP Pool Provisioning Script');
  console.log('================================\n');

  // Step 1: Clear existing IPs
  const cleared = await clearExistingIPs();
  if (!cleared) {
    console.error('❌ Failed to clear existing IPs. Exiting.');
    process.exit(1);
  }

  // Step 2: Provision IPs for each country
  let totalProvisioned = 0;
  for (const [country, count] of Object.entries(POOL_CONFIG.countries)) {
    const success = await provisionCountryIPs(country, count);
    if (!success) {
      console.error(`❌ Failed to provision ${country} IPs. Continuing...`);
    } else {
      totalProvisioned += count;
    }
  }

  // Step 3: Verify provisioning
  await verifyProvisioning();

  console.log('✅ IP provisioning complete!');
  console.log(`\n💡 Tips:`);
  console.log('  - Monitor pool utilization with ip_pool_statistics table');
  console.log('  - Run maintenance every minute: POST /functions/v1/ip-pool-maintenance');
  console.log('  - Scale up if utilization consistently exceeds 80%');
  console.log('  - Each IP can handle 1 concurrent trace with 60s cooldown\n');
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
