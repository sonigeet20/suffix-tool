const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE'
);

(async () => {
  const { data, error } = await supabase
    .from('google_ads_silent_fetch_stats')
    .select('offer_name, client_ip, client_country, created_at')
    .ilike('offer_name', '%SURFSHARK%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\n=== SURFSHARK All-Time Data ===\n');
  console.log('Total records:', data.length);
  
  if (data.length === 0) {
    console.log('No SURFSHARK data found');
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

  console.log('\n--- All Clicks ---');
  classified.forEach((row, i) => {
    const time = new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19);
    console.log(`${i+1}. [${row.ipType.padEnd(15)}] ${row.offer_name.padEnd(35)} | IP: ${row.client_ip.padEnd(40)} | ${(row.client_country || 'UNKNOWN').padEnd(7)} | ${time}`);
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

  console.log('\n--- Unique IP List ---');
  const allUniqueIps = new Set(classified.map(r => r.client_ip));
  Array.from(allUniqueIps).forEach((ip, i) => {
    const count = classified.filter(r => r.client_ip === ip).length;
    const countries = [...new Set(classified.filter(r => r.client_ip === ip).map(r => r.client_country))].join(', ');
    console.log(`${i+1}. ${ip.padEnd(40)} - ${count} clicks - Countries: ${countries}`);
  });

  console.log('\n--- Offers Breakdown ---');
  const offerCounts = classified.reduce((acc, row) => {
    acc[row.offer_name] = (acc[row.offer_name] || 0) + 1;
    return acc;
  }, {});
  Object.entries(offerCounts).forEach(([offer, count]) => {
    console.log(`${offer}: ${count} clicks`);
  });

  console.log('\n--- Date Range ---');
  const dates = classified.map(r => new Date(r.created_at));
  console.log(`First click: ${new Date(Math.min(...dates)).toISOString().replace('T', ' ').substring(0, 19)}`);
  console.log(`Last click: ${new Date(Math.max(...dates)).toISOString().replace('T', ' ').substring(0, 19)}`);
})();
