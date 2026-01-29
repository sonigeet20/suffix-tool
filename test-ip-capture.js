import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function testIPCapture() {
  try {
    console.log('🧪 Testing IP capture with new code...\n');
    
    // Get the most recent clicks (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: recentClicks, error } = await supabase
      .from('google_ads_click_events')
      .select('id, user_ip, user_agent, clicked_at, offer_name')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .gte('clicked_at', fiveMinutesAgo)
      .order('clicked_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!recentClicks || recentClicks.length === 0) {
      console.log('⏳ No recent clicks in last 5 minutes. Checking last hour...');
      
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: hourClicks, error: hourError } = await supabase
        .from('google_ads_click_events')
        .select('id, user_ip, user_agent, clicked_at, offer_name')
        .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
        .gte('clicked_at', oneHourAgo)
        .order('clicked_at', { ascending: false })
        .limit(10);

      if (hourError) throw hourError;
      console.log(`Found ${hourClicks.length} clicks in last hour:\n`);
      
      hourClicks.forEach((click, i) => {
        const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1)/i.test(click.user_ip);
        const marker = isPrivate ? '🔴 PRIVATE' : '🟢 PUBLIC';
        console.log(`${i + 1}. ${marker} | IP: ${click.user_ip.padEnd(15)} | Time: ${new Date(click.clicked_at).toLocaleString()}`);
      });
    } else {
      console.log(`✅ Found ${recentClicks.length} clicks in last 5 minutes:\n`);
      
      recentClicks.forEach((click, i) => {
        const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1)/i.test(click.user_ip);
        const marker = isPrivate ? '🔴 PRIVATE' : '🟢 PUBLIC';
        console.log(`${i + 1}. ${marker} | IP: ${click.user_ip.padEnd(15)} | Time: ${new Date(click.clicked_at).toLocaleString()}`);
      });
    }

    // Get IP diversity stats
    console.log('\n📊 IP Diversity Analysis:');
    const { data: allRecentClicks, error: allError } = await supabase
      .from('google_ads_click_events')
      .select('user_ip')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .gte('clicked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (allError) throw allError;

    const uniqueIPs = new Set(allRecentClicks.map(c => c.user_ip));
    const privateIPs = allRecentClicks.filter(c => 
      /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1)/i.test(c.user_ip)
    ).length;
    const publicIPs = allRecentClicks.length - privateIPs;

    console.log(`Total clicks (24h): ${allRecentClicks.length}`);
    console.log(`Unique IPs: ${uniqueIPs.size}`);
    console.log(`Private IPs: ${privateIPs} (${((privateIPs / allRecentClicks.length) * 100).toFixed(1)}%)`);
    console.log(`Public IPs: ${publicIPs} (${((publicIPs / allRecentClicks.length) * 100).toFixed(1)}%)`);

    if (publicIPs > 0) {
      console.log('\n✅ SUCCESS! Real user IPs are being captured!');
    } else if (uniqueIPs.size === 1) {
      console.log('\n⚠️  Still seeing single IP (likely NLB IP) - deployment may not have restarted service');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

testIPCapture();
