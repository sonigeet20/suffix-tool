const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

async function testBrightDataWithWait() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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
  const startUrl = 'https://blackboxai.partnerlinks.io/pcn4bo8ipzxv';
  
  console.log('\n🔍 Testing BrightData with wait_for_network_idle');
  console.log(`Starting URL: ${startUrl}\n`);

  const payload = {
    zone: 'scraping_browser1',
    url: startUrl,
    format: 'raw',
    // Wait for all redirects and network activity to complete
    wait_for_network_idle: true,
    // Also try to capture the final URL from response headers
    return_headers: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  };

  try {
    console.log('📡 Sending request with wait_for_network_idle...');
    const startTime = Date.now();
    
    const response = await axios.post('https://api.brightdata.com/request', payload, {
      headers: {
        'Authorization': `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2 minutes for network idle
      validateStatus: () => true,
    });

    const duration = Date.now() - startTime;

    console.log(`\n✅ Response received! (${duration}ms)`);
    console.log(`Status: ${response.status}`);
    
    // Check response headers for final URL
    if (response.headers['x-final-url']) {
      console.log(`\n🎯 FINAL URL (from header): ${response.headers['x-final-url']}`);
    }
    
    if (response.headers['x-brightdata-url']) {
      console.log(`🎯 BrightData URL: ${response.headers['x-brightdata-url']}`);
    }

    // Parse HTML for current location
    if (response.data) {
      const html = typeof response.data === 'string' ? response.data : '';
      
      // Check for canonical URL
      const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      if (canonicalMatch) {
        console.log(`🎯 Canonical URL: ${canonicalMatch[1]}`);
      }
      
      // Check for og:url
      const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
      if (ogUrlMatch) {
        console.log(`🎯 OG URL: ${ogUrlMatch[1]}`);
      }
      
      // Look for window.location in scripts
      const locationMatch = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
      if (locationMatch) {
        console.log(`🎯 JS Location: ${locationMatch[1]}`);
      }
      
      // Check URL bar from page title/domain
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        console.log(`📄 Page Title: ${titleMatch[1]}`);
      }
      
      // Look for href in base tag
      const baseMatch = html.match(/<base[^>]+href=["']([^"']+)["']/i);
      if (baseMatch) {
        console.log(`🎯 Base href: ${baseMatch[1]}`);
      }

      console.log(`\n📄 HTML preview (first 400 chars):`);
      console.log(html.substring(0, 400));
    }

    console.log('\n✅ SUCCESS: BrightData Browser API completed!');
    console.log('\n💡 Note: BrightData scraping_browser renders the page and follows redirects automatically.');
    console.log('The HTML returned is from the FINAL destination after all redirects.');
    console.log('To track redirect chain, we need to parse network logs or use a different approach.');

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data).substring(0, 300));
    }
    
    process.exit(1);
  }
}

testBrightDataWithWait();
