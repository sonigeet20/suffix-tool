import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeIPs() {
  try {
    console.log('Fetching clicks for SURFSHARK_US_WW_SHEET_SMB...\n');
    
    const { data: clicks, error } = await supabase
      .from('google_ads_click_events')
      .select('id, user_ip, user_agent, redirect_url, target_country, clicked_at')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .order('clicked_at', { ascending: false });

    if (error) throw error;

    console.log(`Total clicks fetched: ${clicks.length}\n`);

    // Categorize clicks based on our criteria
    const categorized = clicks.map(click => {
      let category = 'real_user';
      let reason = 'Valid landing page';
      
      if (click.user_agent?.includes('GoogleHypersonic') || click.user_agent?.includes('gzip(gfe)')) {
        category = 'google_bot';
        reason = 'GoogleHypersonic UA';
      } else if (click.redirect_url?.includes('google.com/asnc')) {
        category = 'google_bot';
        reason = 'Redirected to google.com/asnc';
      } else if (click.redirect_url?.includes('{lpurl')) {
        category = 'invalid';
        reason = 'Macro not replaced';
      } else if (click.redirect_url?.includes('example.com')) {
        category = 'invalid';
        reason = 'Test URL';
      }
      
      return { ...click, category, reason };
    });

    const realUsers = categorized.filter(c => c.category === 'real_user');
    const googleBots = categorized.filter(c => c.category === 'google_bot');
    const invalid = categorized.filter(c => c.category === 'invalid');

    console.log(`=== CLICK CATEGORIZATION ===`);
    console.log(`Real users: ${realUsers.length} (${((realUsers.length / clicks.length) * 100).toFixed(2)}%)`);
    console.log(`Google bots: ${googleBots.length} (${((googleBots.length / clicks.length) * 100).toFixed(2)}%)`);
    console.log(`Invalid: ${invalid.length} (${((invalid.length / clicks.length) * 100).toFixed(2)}%)\n`);

    // Analyze IPs
    const ipMap = {};
    const googleIPs = [];
    const nonGoogleIPs = [];
    const privateIPs = [];

    realUsers.forEach(click => {
      const ip = click.user_ip || 'UNKNOWN';
      ipMap[ip] = (ipMap[ip] || 0) + 1;

      // Check if private IP (indicates internal/testing)
      const isPrivate = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|::1|fc00:|fd00:)/i.test(ip);
      
      // Check if Google (limited detection without GeoIP - would need external API)
      const isGoogle = ip.includes('Google') || ip.includes('8.8.') || ip.includes('8.9.');

      if (isPrivate) {
        privateIPs.push({ ip });
      } else if (isGoogle) {
        googleIPs.push({ ip });
      } else {
        nonGoogleIPs.push({ ip });
      }
    });

    console.log(`=== IP BREAKDOWN ===\n`);
    console.log(`Unique IPs: ${Object.keys(ipMap).length}`);
    console.log(`Private IPs (10.x, 172.x, 192.168.x, 127.x): ${privateIPs.length} (${((privateIPs.length / realUsers.length) * 100).toFixed(2)}%)`);
    console.log(`Google IPs: ${googleIPs.length} (${((googleIPs.length / realUsers.length) * 100).toFixed(2)}%)`);
    console.log(`Non-Google Public IPs: ${nonGoogleIPs.length} (${((nonGoogleIPs.length / realUsers.length) * 100).toFixed(2)}%)\n`);

    console.log(`=== TOP 20 IPs BY FREQUENCY ===\n`);
    Object.entries(ipMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([ip, count]) => {
        const percent = ((count / realUsers.length) * 100).toFixed(2);
        const type = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/i.test(ip) ? '[PRIVATE]' : '[PUBLIC]';
        console.log(`${ip.padEnd(15)} | ${count.toString().padEnd(3)} clicks (${percent.padStart(5)}%) ${type}`);
      });

    console.log(`\n=== COUNTRY DISTRIBUTION ===\n`);
    const countryMap = {};
    realUsers.forEach(click => {
      const country = click.target_country || 'UNKNOWN';
      countryMap[country] = (countryMap[country] || 0) + 1;
    });

    Object.entries(countryMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([country, count]) => {
        const percent = ((count / realUsers.length) * 100).toFixed(2);
        console.log(`${country}: ${count} clicks (${percent}%)`);
      });

    console.log(`\n=== SAMPLE NON-GOOGLE PUBLIC IPs (First 30) ===\n`);
    nonGoogleIPs.slice(0, 30).forEach(item => {
      console.log(item.ip);
    });

    // Compare with Google's reported 292
    console.log(`\n=== COMPARISON WITH GOOGLE REPORT ===`);
    console.log(`Google reported: 292 real user clicks`);
    console.log(`We found (by our categorization): ${realUsers.length} real user clicks`);
    console.log(`Difference: ${Math.abs(292 - realUsers.length)} (${((Math.abs(292 - realUsers.length) / 292) * 100).toFixed(2)}%)`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

analyzeIPs();

