const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE'
);

(async () => {
  const offerName = process.argv[2] || '%';
  const hours = parseInt(process.argv[3]) || 24;

  const { data, error } = await supabase
    .from('google_ads_silent_fetch_stats')
    .select('*')
    .ilike('offer_name', offerName)
    .gte('created_at', new Date(Date.now() - hours*60*60*1000).toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(`\n=== Google Ads Silent Fetch Analysis ===`);
  console.log(`Offer filter: ${offerName}`);
  console.log(`Time range: Last ${hours} hours`);
  console.log(`Total records: ${data.length}\n`);
  
  if (data.length === 0) {
    console.log('No data found');
    process.exit(0);
  }

  // Classify requests
  const classified = data.map(row => {
    let ipType = 'Real User';
    let reason = '';

    if (row.user_agent) {
      if (row.user_agent.includes('Googlebot') || row.user_agent.includes('AdsBot-Google')) {
        ipType = 'Google Bot';
        reason = 'User agent contains Googlebot/AdsBot';
      } else if (row.user_agent.includes('bingbot') || row.user_agent.includes('BingPreview')) {
        ipType = 'Bing Bot';
        reason = 'User agent contains bingbot';
      }
    }

    if (row.client_ip && (row.client_ip.startsWith('66.249.') || row.client_ip.startsWith('66.102.'))) {
      ipType = 'Google Bot';
      reason = 'IP is from Google bot range';
    }

    if (row.client_ip && (row.client_ip.startsWith('172.') || row.client_ip.startsWith('10.') || row.client_ip.startsWith('192.168.'))) {
      ipType = 'Internal/Test';
      reason = 'Private IP address';
    }

    return { ...row, ipType, reason };
  });

  // Summary by type
  const summary = classified.reduce((acc, row) => {
    acc[row.ipType] = (acc[row.ipType] || 0) + 1;
    return acc;
  }, {});

  console.log('--- Summary by Type ---');
  Object.entries(summary).forEach(([type, count]) => {
    console.log(`${type}: ${count} (${(count/data.length*100).toFixed(1)}%)`);
  });

  // Recent clicks with full details
  console.log('\n--- Recent Clicks (Last 20) ---');
  classified.slice(0, 20).forEach((row, i) => {
    const time = new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19);
    console.log(`\n${i+1}. [${row.ipType}] ${row.offer_name}`);
    console.log(`   Time: ${time}`);
    console.log(`   IP: ${row.client_ip} (${row.client_country || 'unknown'})`);
    console.log(`   User Agent: ${row.user_agent || '(not logged)'}`);
    console.log(`   Referrer: ${row.referrer || '(none)'}`);
    if (row.reason) console.log(`   Classification: ${row.reason}`);
  });

  // User agent analysis
  console.log('\n--- User Agent Analysis ---');
  const userAgents = classified.filter(r => r.user_agent).reduce((acc, row) => {
    const ua = row.user_agent.substring(0, 100); // Truncate long UAs
    acc[ua] = (acc[ua] || 0) + 1;
    return acc;
  }, {});
  
  Object.entries(userAgents)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([ua, count]) => {
      console.log(`${count}x: ${ua}${ua.length >= 100 ? '...' : ''}`);
    });

  // Cookie drop verification hints
  console.log('\n--- Cookie Drop Verification ---');
  console.log('To verify cookies are being dropped:');
  console.log('1. Look for real user requests (not bots)');
  console.log('2. Check if same IP makes multiple requests (indicates cookie not working)');
  console.log('3. Real users should have browser user agents (Chrome, Safari, Firefox)');
  console.log('4. Referrer should be empty or from Google Ads');
  
  const ipCounts = classified.reduce((acc, row) => {
    acc[row.client_ip] = (acc[row.client_ip] || 0) + 1;
    return acc;
  }, {});
  
  const repeatedIps = Object.entries(ipCounts).filter(([ip, count]) => count > 5);
  if (repeatedIps.length > 0) {
    console.log('\n⚠️  IPs with many requests (possible cookie issues):');
    repeatedIps.forEach(([ip, count]) => {
      const sample = classified.find(r => r.client_ip === ip);
      console.log(`   ${ip}: ${count} requests - ${sample.ipType} - ${sample.offer_name}`);
    });
  } else {
    console.log('\n✅ No IPs with excessive requests - cookies likely working');
  }

})();
