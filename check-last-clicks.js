import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getLastClicks() {
  try {
    const { data, error } = await supabase
      .from('google_ads_click_events')
      .select('*')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .order('clicked_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }

    console.log('\n📊 Last 30 Clicks for SURFSHARK_US_WW_SHEET_SMB\n');
    console.log('=' .repeat(180));

    data.forEach((click, index) => {
      const timestamp = new Date(click.clicked_at).toLocaleString();
      const redirectUrl = click.redirect_url || 'N/A';
      const urlDisplay = redirectUrl.length > 80 
        ? redirectUrl.substring(0, 77) + '...' 
        : redirectUrl;
      
      // Determine click category
      let category = '✅ Real User';
      if (click.user_agent?.includes('GoogleHypersonic') || click.user_agent?.includes('gzip(gfe)')) {
        category = '🤖 Google Bot';
      } else if (click.redirect_url?.includes('{lpurl')) {
        category = '❌ Invalid (macro)';
      } else if (click.redirect_url?.includes('example.com')) {
        category = '⚠️ Test URL';
      }

      console.log(`\n${index + 1}. [${timestamp}]`);
      console.log(`   IP: ${click.user_ip} | Country: ${click.target_country || 'Unknown'}`);
      console.log(`   Category: ${category}`);
      console.log(`   Suffix: ${click.suffix || 'N/A'}`);
      console.log(`   Redirect: ${urlDisplay}`);
      console.log(`   Response: ${click.response_time_ms}ms | Trace: ${click.trace_success ? '✅' : '❌'}`);
      if (click.blocked) console.log(`   ⛔ BLOCKED - Reason: ${click.block_reason || 'No reason given'}`);
    });

    console.log('\n' + '='.repeat(180));

  } catch (err) {
    console.error('Error:', err);
  }
}

getLastClicks();
