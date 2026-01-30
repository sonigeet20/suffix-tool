import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEwNDgsImV4cCI6MjA4MTUzNzA0OH0.pi_6p2H2nuPfJvdT3pHNGpk0BTI3WQKTSzsj8dxQBA8'
);

async function checkRecentIPs() {
  const { data, error } = await supabase
    .from('google_ads_click_events')
    .select('user_ip, clicked_at, offer_name')
    .order('clicked_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('\nLast 20 clicks:');
    data.forEach((row, i) => {
      const isPrivate = row.user_ip?.startsWith('172.') || row.user_ip?.startsWith('10.') || row.user_ip?.startsWith('192.168.');
      console.log(`${i+1}. ${row.clicked_at} | ${row.user_ip} ${isPrivate ? '⚠️ PRIVATE' : '✓ PUBLIC'} | ${row.offer_name}`);
    });
    
    const privateCount = data.filter(r => r.user_ip?.startsWith('172.')).length;
    const publicCount = data.filter(r => !r.user_ip?.startsWith('172.') && !r.user_ip?.startsWith('10.') && !r.user_ip?.startsWith('192.168.')).length;
    
    console.log(`\nSummary: ${publicCount} public IPs, ${privateCount} private IPs`);
  }
}

checkRecentIPs();
