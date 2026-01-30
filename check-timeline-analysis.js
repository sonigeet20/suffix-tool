import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getTimelineAnalysis() {
  try {
    // Get all clicks with their timestamps
    const { data, error } = await supabase
      .from('google_ads_click_events')
      .select('clicked_at, redirect_url')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .order('clicked_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }

    console.log('\n📅 Click Timeline Analysis (Last 50 Clicks)\n');
    console.log('=' .repeat(120));

    // Find first and last asnc
    let firstAsnc = null;
    let lastAsnc = null;
    let clicksAfterLastAsnc = 0;
    let clicksBeforeFirstAsnc = 0;

    // Check each click
    data.forEach((click, idx) => {
      const isAsnc = click.redirect_url.includes('google.com/asnc');
      
      if (isAsnc) {
        if (lastAsnc === null) {
          lastAsnc = click;
        }
        firstAsnc = click; // Keep updating to find the earliest
      } else {
        if (lastAsnc !== null && firstAsnc === lastAsnc) {
          clicksAfterLastAsnc++;
        } else if (lastAsnc === null) {
          clicksBeforeFirstAsnc++;
        }
      }
    });

    const newestClick = data[0];
    const oldestClick = data[data.length - 1];

    console.log(`Total Clicks (Last 50): ${data.length}`);
    console.log(`Newest Click: ${new Date(newestClick.clicked_at).toLocaleString()}`);
    console.log(`Oldest Click: ${new Date(oldestClick.clicked_at).toLocaleString()}\n`);

    if (lastAsnc) {
      console.log(`Last Asnc Redirect: ${new Date(lastAsnc.clicked_at).toLocaleString()}`);
      console.log(`Clicks AFTER last asnc: ${clicksAfterLastAsnc}`);
    }

    console.log('\n' + '=' .repeat(120));

    // Show timeline with markers
    console.log('\n📊 Timeline (most recent first):\n');
    let lastType = null;
    let consecutiveCount = 0;

    data.forEach((click, idx) => {
      const isAsnc = click.redirect_url.includes('google.com/asnc');
      const isSurfshark = click.redirect_url.includes('surfshark.com');
      const type = isAsnc ? '🔗 ASNC' : isSurfshark ? '✅ SURFSHARK' : '❓ OTHER';
      
      const timestamp = new Date(click.clicked_at).toLocaleString();
      console.log(`${idx + 1}. [${timestamp}] ${type}`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

getTimelineAnalysis();
