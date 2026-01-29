const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk0NzY4OTUsImV4cCI6MTc1NzI1Mjg5NX0.jPmRKYNzJzOoYv9o0HV3CqrGHcLtDV1q3AEZ5y0GDWE'
);

async function test() {
  console.log('\n📊 Testing Real User IP and Geo Data Capture\n');

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60000).toISOString();
  
  const { data: clicks, error } = await supabase
    .from('google_ads_click_events')
    .select('id, client_ip, country, user_agent, offer_name, clicked_at')
    .gte('clicked_at', twoHoursAgo)
    .order('clicked_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!clicks || clicks.length === 0) {
    console.log('⚠️ No clicks found in last 2 hours');
    return;
  }

  let publicIpCount = 0;
  let privateIpCount = 0;
  let geoDataCount = 0;
  const ipSet = new Set();
  const countries = {};

  clicks.forEach(click => {
    const ip = click.client_ip || 'UNKNOWN';
    ipSet.add(ip);

    if (ip.startsWith('172.31.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
      privateIpCount++;
    } else if (ip !== 'UNKNOWN') {
      publicIpCount++;
    }

    if (click.country && click.country !== 'UNKNOWN') {
      geoDataCount++;
      countries[click.country] = (countries[click.country] || 0) + 1;
    }
  });

  console.log(`✅ Analyzed ${clicks.length} clicks from last 2 hours\n`);
  
  console.log('📍 IP Analysis:');
  console.log(`  🔵 Public IPs: ${publicIpCount} (${((publicIpCount / clicks.length) * 100).toFixed(2)}%)`);
  console.log(`  🔴 Private IPs: ${privateIpCount} (${((privateIpCount / clicks.length) * 100).toFixed(2)}%)`);
  console.log(`  ❓ Unknown: ${clicks.length - publicIpCount - privateIpCount}\n`);

  console.log('🌍 Geo Data Analysis:');
  console.log(`  ✅ Geo Data Found: ${geoDataCount} (${((geoDataCount / clicks.length) * 100).toFixed(2)}%)`);
  console.log(`  ❌ Missing Country: ${clicks.length - geoDataCount}\n`);

  if (Object.keys(countries).length > 0) {
    console.log('🗺️  Top 5 Countries:');
    Object.entries(countries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([country, count]) => {
        console.log(`  ${country}: ${count}`);
      });
    console.log('');
  }

  console.log(`📊 Unique IPs: ${ipSet.size}\n`);

  console.log('📋 Latest 5 Clicks:');
  clicks.slice(0, 5).forEach(click => {
    const timeStr = new Date(click.clicked_at).toLocaleString();
    console.log(`  ${timeStr} | IP: ${click.client_ip || 'UNKNOWN'} | Country: ${click.country || 'UNKNOWN'}`);
  });

  console.log('\n' + '='.repeat(60));
  if (publicIpCount > 0 && geoDataCount > 0) {
    console.log('✅ SUCCESS! All instances capturing:');
    console.log('   ✓ Real user IPs (public addresses)');
    console.log('   ✓ Geo data (countries)');
  } else if (publicIpCount > 0) {
    console.log('⚠️  Real user IPs captured but geo data incomplete');
  } else {
    console.log('❌ Not capturing real user IPs yet');
  }
  console.log('='.repeat(60) + '\n');
}

test();
