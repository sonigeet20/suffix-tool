const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

async function traceWithBrightData() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get BrightData provider
  const { data: providers } = await supabase
    .from('proxy_providers')
    .select('*')
    .eq('provider_type', 'brightdata_browser')
    .eq('enabled', true)
    .limit(1);

  if (!providers || providers.length === 0) {
    console.error('❌ No BrightData provider found');
    process.exit(1);
  }

  const provider = providers[0];
  const API_URL = 'https://api.brightdata.com/request';
  const startUrl = 'https://blackboxai.partnerlinks.io/pcn4bo8ipzxv';
  
  console.log('\n🔍 Tracing redirects with BrightData Browser API');
  console.log(`Starting URL: ${startUrl}\n`);

  const chain = [];
  let currentUrl = startUrl;
  let hop = 0;
  const maxHops = 10;

  const parseMetaRefresh = (html) => {
    const match = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
    if (match && match[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, '');
    }
    return null;
  };

  const parseHttpRedirect = (html) => {
    const match = html.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                  html.match(/location\.href\s*=\s*["']([^"']+)["']/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  };

  while (hop < maxHops) {
    hop++;
    console.log(`\n🔄 Hop ${hop}: ${currentUrl.substring(0, 80)}${currentUrl.length > 80 ? '...' : ''}`);

    try {
      const payload = {
        zone: 'scraping_browser1',
        url: currentUrl,
        format: 'raw',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      };

      const startTime = Date.now();
      const response = await axios.post(API_URL, payload, {
        headers: {
          'Authorization': `Bearer ${provider.api_key}`,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      const duration = Date.now() - startTime;

      console.log(`   Status: ${response.status} (${duration}ms)`);

      chain.push({
        hop,
        url: currentUrl,
        status: response.status,
        duration,
      });

      // Check for HTTP redirect
      if ((response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307) && response.headers.location) {
        const nextUrl = response.headers.location;
        console.log(`   ➡️  HTTP ${response.status} redirect to: ${nextUrl.substring(0, 80)}...`);
        currentUrl = nextUrl;
        continue;
      }

      // Check for meta refresh or JS redirect
      if (response.status === 200 && response.data) {
        const html = typeof response.data === 'string' ? response.data : '';
        
        const metaRefresh = parseMetaRefresh(html);
        if (metaRefresh) {
          console.log(`   ➡️  Meta refresh to: ${metaRefresh.substring(0, 80)}...`);
          currentUrl = metaRefresh;
          continue;
        }

        const jsRedirect = parseHttpRedirect(html);
        if (jsRedirect) {
          console.log(`   ➡️  JS redirect to: ${jsRedirect.substring(0, 80)}...`);
          currentUrl = jsRedirect;
          continue;
        }

        // No more redirects found
        console.log(`   ✅ Final destination reached`);
        console.log(`\n🎯 FINAL URL: ${currentUrl}`);
        console.log(`\n📊 Total hops: ${hop}`);
        console.log(`📋 Redirect chain:`);
        chain.forEach((c, i) => {
          console.log(`   ${i + 1}. [${c.status}] ${c.url.substring(0, 60)}... (${c.duration}ms)`);
        });
        console.log(`\n✅ SUCCESS: BrightData Browser API traced full redirect chain!`);
        return;
      }

      // Unexpected status
      console.log(`   ⚠️ Unexpected status ${response.status}, stopping`);
      break;

    } catch (error) {
      console.error(`   ❌ Error at hop ${hop}:`, error.message);
      if (error.response) {
        console.error(`   Status:`, error.response.status);
      }
      break;
    }
  }

  if (hop >= maxHops) {
    console.log(`\n⚠️ Stopped at max hops (${maxHops})`);
    console.log(`Last URL: ${currentUrl}`);
  }
}

traceWithBrightData();
