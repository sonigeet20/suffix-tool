import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getClicksAfterAsnc() {
  try {
    // Last asnc was at 2026-01-30T01:47:33Z
    const lastAsnTime = new Date('2026-01-30T01:47:33Z');

    const { data, error } = await supabase
      .from('google_ads_click_events')
      .select('clicked_at, redirect_url, user_ip, target_country, user_agent, suffix')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .gt('clicked_at', lastAsnTime.toISOString())
      .order('clicked_at', { ascending: false });

    if (error) {
      console.error('Error fetching data:', error);
      return;
    }

    console.log('\n📊 Clicks After Last Asnc Redirect (1/30/2026 1:47:33 AM)\n');
    console.log('=' .repeat(120));
    console.log(`Total Clicks After Asnc: ${data.length}\n`);

    // Categorize redirects
    const redirectCategories = {
      surfshark: [],
      asnc: [],
      other: []
    };

    data.forEach(click => {
      if (click.redirect_url.includes('google.com/asnc')) {
        redirectCategories.asnc.push(click);
      } else if (click.redirect_url.includes('surfshark.com')) {
        redirectCategories.surfshark.push(click);
      } else {
        redirectCategories.other.push(click);
      }
    });

    console.log(`✅ Surfshark Redirects: ${redirectCategories.surfshark.length}`);
    console.log(`🔗 Asnc Redirects: ${redirectCategories.asnc.length}`);
    console.log(`❓ Other Redirects: ${redirectCategories.other.length}\n`);
    console.log('=' .repeat(120));

    if (redirectCategories.asnc.length > 0) {
      console.log('\n🔗 NEW Asnc Redirects After Last One:\n');
      redirectCategories.asnc.forEach((click, idx) => {
        const timestamp = new Date(click.clicked_at).toLocaleString();
        console.log(`${idx + 1}. [${timestamp}]`);
        console.log(`   IP: ${click.user_ip} | Country: ${click.target_country}`);
        console.log(`   URL: ${click.redirect_url.substring(0, 80)}...\n`);
      });
    }

    if (redirectCategories.surfshark.length > 0) {
      console.log('\n✅ Surfshark Redirects After Last Asnc:\n');
      redirectCategories.surfshark.forEach((click, idx) => {
        const timestamp = new Date(click.clicked_at).toLocaleString();
        console.log(`${idx + 1}. [${timestamp}]`);
        console.log(`   IP: ${click.user_ip} | Country: ${click.target_country}`);
        console.log(`   URL: ${click.redirect_url}\n`);
      });
    }

    if (redirectCategories.other.length > 0) {
      console.log('\n❓ Other Redirects:\n');
      redirectCategories.other.forEach((click, idx) => {
        const timestamp = new Date(click.clicked_at).toLocaleString();
        console.log(`${idx + 1}. [${timestamp}]`);
        console.log(`   IP: ${click.user_ip} | Country: ${click.target_country}`);
        console.log(`   URL: ${click.redirect_url}\n`);
      });
    }

    console.log('=' .repeat(120));
    
    // Summary
    console.log('\n📈 Summary:');
    const total = data.length;
    if (total > 0) {
      const surfsharkPct = ((redirectCategories.surfshark.length / total) * 100).toFixed(1);
      const asncPct = ((redirectCategories.asnc.length / total) * 100).toFixed(1);
      console.log(`   Surfshark: ${redirectCategories.surfshark.length}/${total} (${surfsharkPct}%)`);
      console.log(`   Asnc: ${redirectCategories.asnc.length}/${total} (${asncPct}%)`);
      if (redirectCategories.other.length > 0) {
        const otherPct = ((redirectCategories.other.length / total) * 100).toFixed(1);
        console.log(`   Other: ${redirectCategories.other.length}/${total} (${otherPct}%)`);
      }
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

getClicksAfterAsnc();
