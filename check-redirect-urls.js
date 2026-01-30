import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getRedirectUrls() {
  try {
    const { data, error } = await supabase
      .from('google_ads_click_events')
      .select('redirect_url, clicked_at')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .order('clicked_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }

    console.log('\n🔗 Redirect URLs for Last 30 Clicks (SURFSHARK_US_WW_SHEET_SMB)\n');
    console.log('=' .repeat(100));

    data.forEach((click, index) => {
      const timestamp = new Date(click.clicked_at).toLocaleString();
      console.log(`${index + 1}. [${timestamp}]`);
      console.log(`   ${click.redirect_url || 'NULL'}\n`);
    });

    // Count unique URLs
    const urlCounts = {};
    data.forEach(click => {
      const url = click.redirect_url || 'NULL';
      urlCounts[url] = (urlCounts[url] || 0) + 1;
    });

    console.log('=' .repeat(100));
    console.log('\n📊 Unique URLs Summary:\n');
    Object.entries(urlCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([url, count]) => {
        console.log(`   ${count}x - ${url}`);
      });

  } catch (err) {
    console.error('Error:', err);
  }
}

getRedirectUrls();
