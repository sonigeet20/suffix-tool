import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getLastAsnc() {
  try {
    // Get the last asnc redirect
    const { data: lastAsnc, error: asnError } = await supabase
      .from('google_ads_click_events')
      .select('clicked_at, redirect_url, user_ip, target_country, user_agent')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .ilike('redirect_url', '%google.com/asnc%')
      .order('clicked_at', { ascending: false })
      .limit(1);

    if (asnError) {
      console.error('Error fetching data:', asnError);
      return;
    }

    if (!lastAsnc || lastAsnc.length === 0) {
      console.log('No asnc redirects found');
      return;
    }

    const click = lastAsnc[0];
    const timestamp = new Date(click.clicked_at);
    const now = new Date();
    const diffMs = now - timestamp;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeDiff = '';
    if (diffDays > 0) {
      timeDiff = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      timeDiff = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
      timeDiff = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }

    console.log('\n⏰ Last Google Ads Verification (asnc) Redirection\n');
    console.log('=' .repeat(100));
    console.log(`\nTimestamp: ${timestamp.toLocaleString()}`);
    console.log(`Time Ago:  ${timeDiff}\n`);
    console.log(`IP:        ${click.user_ip}`);
    console.log(`Country:   ${click.target_country}`);
    console.log(`URL:       ${click.redirect_url.substring(0, 90)}...`);
    console.log(`User Agent: ${click.user_agent || 'N/A'}\n`);
    console.log('=' .repeat(100));

  } catch (err) {
    console.error('Error:', err);
  }
}

getLastAsnc();
