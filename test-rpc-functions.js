import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEwNDgsImV4cCI6MjA4MTUzNzA0OH0.pi_6p2H2nuPfJvdT3pHNGpk0BTI3WQKTSzsj8dxQBA8'
);

async function testRPCFunctions() {
  console.log('\n=== Testing RPC Functions ===\n');

  // Test get_recent_click_events
  console.log('1. Testing get_recent_click_events (all offers):');
  const { data: recentAll, error: error1 } = await supabase.rpc('get_recent_click_events', {
    p_offer_name: null,
    p_limit: 5
  });
  
  if (error1) {
    console.error('ERROR:', error1);
  } else {
    console.log(`✓ Found ${recentAll?.length || 0} recent clicks`);
    if (recentAll && recentAll.length > 0) {
      console.log('Sample:', {
        offer_name: recentAll[0].offer_name,
        user_ip: recentAll[0].user_ip,
        timestamp: recentAll[0].click_timestamp
      });
    }
  }

  // Test get_click_stats_by_category
  console.log('\n2. Testing get_click_stats_by_category (all offers):');
  const { data: stats, error: error2 } = await supabase.rpc('get_click_stats_by_category', {
    p_offer_name: null,
    p_days: 7
  });
  
  if (error2) {
    console.error('ERROR:', error2);
  } else {
    console.log(`✓ Found stats for ${stats?.length || 0} offers`);
    if (stats && stats.length > 0) {
      stats.forEach(s => {
        console.log(`  - ${s.offer_name}: ${s.total_clicks} total, ${s.real_users} real users (${s.real_user_percentage}%)`);
      });
    }
  }

  // Test with SURFSHARK offer name
  console.log('\n3. Testing with SURFSHARK_US_WW_SHEET_SMB offer:');
  const { data: surfshark, error: error3 } = await supabase.rpc('get_click_stats_by_category', {
    p_offer_name: 'SURFSHARK_US_WW_SHEET_SMB',
    p_days: 7
  });
  
  if (error3) {
    console.error('ERROR:', error3);
  } else {
    console.log('Result:', surfshark);
  }

  // Get list of offer names from database
  console.log('\n4. Getting distinct offer names from database:');
  const { data: offers, error: error4 } = await supabase
    .from('google_ads_click_events')
    .select('offer_name')
    .limit(100);
  
  if (error4) {
    console.error('ERROR:', error4);
  } else {
    const uniqueOffers = [...new Set(offers.map(o => o.offer_name))];
    console.log('Offer names in database:', uniqueOffers);
  }
}

testRPCFunctions().then(() => {
  console.log('\n=== Test Complete ===\n');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
