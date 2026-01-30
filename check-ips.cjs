const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE'
);

(async () => {
  const { data, error } = await supabase
    .from('google_ads_silent_fetch_stats')
    .select('offer_name, client_ip, client_country, created_at')
    .gte('fetch_date', new Date(Date.now() - 48*60*60*1000).toISOString().split('T')[0])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\n=== Google Ads Silent Fetch IPs (Last 48 hours) ===\n');
  console.log('Total records:', data.length);
  
  if (data.length === 0) {
    console.log('No data found for last 48 hours');
    process.exit(0);
  }

  // Classify IPs
  const classified = data.map(row => {
    let ipType = 'Real User IP';
    if (row.client_ip.startsWith('66.249.') || row.client_ip.startsWith('66.102.') || row.client_ip.startsWith('66.220.')) {
      ipType = 'Googlebot';
    } else if (row.client_ip.startsWith('157.55.') || row.client_ip.startsWith('207.46.')) {
      ipType = 'Bing Bot';
    } else if (row.client_ip.startsWith('172.') || row.client_ip.startsWith('10.') || row.client_ip.startsWith('192.168.')) {
      ipType = 'Private/Internal';
    }
    return { ...row, ipType };
  });

  // Group by IP type
  const summary = classified.reduce((acc, row) => {
    acc[row.ipType] = (acc[row.ipType] || 0) + 1;
    return acc;
  }, {});

  console.log('\n--- Summary by IP Type ---');
  Object.entries(summary).forEach(([type, count]) => {
    console.log(`${type}: ${count} clicks (${(count/data.length*100).toFixed(1)}%)`);
  });

  console.log('\n--- Sample Recent Clicks (First 30) ---');
  classified.slice(0, 30).forEach((row, i) => {
    const time = new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19);
    console.log(`${i+1}. [${row.ipType.padEnd(15)}] ${row.offer_name.padEnd(30)} | IP: ${row.client_ip.padEnd(15)} | ${row.client_country} | ${time}`);
  });

  console.log('\n--- Unique IPs by Type ---');
  const uniqueByType = classified.reduce((acc, row) => {
    if (!acc[row.ipType]) acc[row.ipType] = new Set();
    acc[row.ipType].add(row.client_ip);
    return acc;
  }, {});
  Object.entries(uniqueByType).forEach(([type, ips]) => {
    console.log(`${type}: ${ips.size} unique IPs`);
  });

  console.log('\n--- Offers with Most Activity ---');
  const offerCounts = classified.reduce((acc, row) => {
    acc[row.offer_name] = (acc[row.offer_name] || 0) + 1;
    return acc;
  }, {});
  Object.entries(offerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([offer, count]) => {
      console.log(`${offer}: ${count} clicks`);
    });
})();
