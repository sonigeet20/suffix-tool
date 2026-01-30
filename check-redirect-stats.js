import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getRedirectStats() {
  try {
    // Get all redirect URLs for SURFSHARK_US_WW_SHEET_SMB
    const { data, error } = await supabase
      .from('google_ads_click_events')
      .select('redirect_url, blocked, trace_success, response_time_ms, user_agent, clicked_at')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB');

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }

    // Group by redirect_url and calculate stats
    const stats = {};
    
    data.forEach(click => {
      const url = click.redirect_url || 'NO_URL';
      if (!stats[url]) {
        stats[url] = {
          total_clicks: 0,
          blocked: 0,
          successful_traces: 0,
          total_response_time: 0,
          response_time_count: 0,
          last_click: click.clicked_at,
          is_google_bot: false,
          is_invalid: false
        };
      }

      stats[url].total_clicks++;
      if (click.blocked) stats[url].blocked++;
      if (click.trace_success) stats[url].successful_traces++;
      if (click.response_time_ms) {
        stats[url].total_response_time += click.response_time_ms;
        stats[url].response_time_count++;
      }
      if (click.clicked_at > stats[url].last_click) {
        stats[url].last_click = click.clicked_at;
      }

      // Categorize
      if (click.user_agent?.includes('GoogleHypersonic') || click.user_agent?.includes('gzip(gfe)')) {
        stats[url].is_google_bot = true;
      }
      if (click.redirect_url?.includes('{lpurl')) {
        stats[url].is_invalid = true;
      }
    });

    // Sort by click count
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].total_clicks - a[1].total_clicks);

    console.log('\n📊 Redirect URL Stats for SURFSHARK_US_WW_SHEET_SMB\n');
    console.log('=' .repeat(150));

    sorted.forEach(([url, stat], index) => {
      const avgResponseTime = stat.response_time_count > 0 
        ? (stat.total_response_time / stat.response_time_count).toFixed(2)
        : 'N/A';
      
      const blockedPct = ((stat.blocked / stat.total_clicks) * 100).toFixed(1);
      const tracePct = ((stat.successful_traces / stat.total_clicks) * 100).toFixed(1);

      console.log(`\n${index + 1}. Redirect URL: ${url.substring(0, 80)}...`);
      console.log(`   Total Clicks: ${stat.total_clicks}`);
      console.log(`   Blocked: ${stat.blocked} (${blockedPct}%)`);
      console.log(`   Successful Traces: ${stat.successful_traces} (${tracePct}%)`);
      console.log(`   Avg Response Time: ${avgResponseTime}ms`);
      console.log(`   Last Click: ${new Date(stat.last_click).toLocaleString()}`);
      if (stat.is_google_bot) console.log(`   ⚠️  Detected as Google Bot`);
      if (stat.is_invalid) console.log(`   ❌ Invalid URL (macro not replaced)`);
    });

    console.log('\n' + '='.repeat(150));
    console.log(`\nTotal Unique Redirect URLs: ${sorted.length}`);
    console.log(`Total Clicks Across All URLs: ${data.length}`);

  } catch (err) {
    console.error('Error:', err);
  }
}

getRedirectStats();
