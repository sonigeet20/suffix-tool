const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

async function testWithDatabaseProvider() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('\n�� Checking for BrightData Browser providers in database...\n');

  // Query for BrightData browser providers
  const { data: providers, error } = await supabase
    .from('proxy_providers')
    .select('*')
    .eq('provider_type', 'brightdata_browser')
    .eq('enabled', true);

  if (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  }

  if (!providers || providers.length === 0) {
    console.log('❌ No BrightData Browser providers configured in database');
    console.log('\nYou need to add a BrightData provider:');
    console.log('1. Go to https://brightdata.com/cp/zones');
    console.log('2. Create a "Scraping Browser" zone');
    console.log('3. Get your API token');
    console.log('4. Add to proxy_providers table:');
    console.log('   INSERT INTO proxy_providers (user_id, name, provider_type, api_key, enabled)');
    console.log('   VALUES (\'your-user-id\', \'BrightData Browser\', \'brightdata_browser\', \'your-api-key\', true);');
    process.exit(1);
  }

  console.log(`✅ Found ${providers.length} BrightData provider(s):`);
  providers.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name} (ID: ${p.id})`);
    console.log(`   API Key: ${p.api_key ? p.api_key.substring(0, 15) + '...' : 'NOT SET'}`);
    console.log(`   Enabled: ${p.enabled}`);
  });

  const provider = providers[0];
  
  if (!provider.api_key) {
    console.log('\n❌ Provider has no API key configured');
    process.exit(1);
  }

  console.log(`\n🧪 Testing with provider: ${provider.name}`);
  
  const testUrl = 'https://blackboxai.partnerlinks.io/pcn4bo8ipzxv';
  console.log(`URL: ${testUrl}\n`);

  const payload = {
    zone: 'scraping_browser1',
    url: testUrl,
    format: 'raw',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  };

  try {
    console.log('📡 Sending request to BrightData API...');
    const startTime = Date.now();
    
    const response = await axios.post('https://api.brightdata.com/request', payload, {
      headers: {
        'Authorization': `Bearer ${provider.api_key}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
      maxRedirects: 0,
      validateStatus: () => true,
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ Response received!');
    console.log(`Status: ${response.status}`);
    console.log(`Duration: ${duration}ms`);
    
    if (response.status === 200) {
      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      console.log('\nBody preview (first 300 chars):');
      console.log(body.substring(0, 300));
      
      // Check for redirect/meta refresh
      if (body.includes('location') && response.headers.location) {
        console.log('\n🔄 HTTP Redirect:');
        console.log('Location:', response.headers.location);
      }
      
      if (body.includes('http-equiv') && body.includes('refresh')) {
        console.log('\n🔄 Meta refresh detected in HTML');
      }
      
      console.log('\n✅ SUCCESS: BrightData Browser API successfully fetched the page!');
      console.log('✅ TLS fingerprinting bypassed with real browser rendering!');
    } else if (response.status === 302 || response.status === 301) {
      console.log('\n🔄 Redirect response');
      console.log('Location:', response.headers.location);
      console.log('\n✅ SUCCESS: Got redirect response - BrightData is working!');
    } else {
      console.log(`\n⚠️ Unexpected status: ${response.status}`);
      console.log('Response data:', response.data);
    }

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    
    if (error.message.includes('401') || error.message.includes('403')) {
      console.log('\n💡 Authentication error - your BrightData API key might be invalid');
      console.log('Please check: https://brightdata.com/cp/zones');
    } else if (error.message.includes('timeout')) {
      console.log('\n💡 Request timed out - this is normal for first request (browser cold start)');
      console.log('Try running again - subsequent requests should be faster');
    }
    
    process.exit(1);
  }
}

testWithDatabaseProvider();
