const axios = require('axios');
require('dotenv').config();

async function testBrightDataBrowser() {
  // Check if BrightData API key is configured
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  
  if (!apiKey) {
    console.error('❌ BRIGHTDATA_API_KEY not found in .env file');
    console.log('\nTo test BrightData, you need to:');
    console.log('1. Get your API key from https://brightdata.com/cp/zones');
    console.log('2. Add to .env file: BRIGHTDATA_API_KEY=your-api-key');
    process.exit(1);
  }

  const testUrl = 'https://blackboxai.partnerlinks.io/pcn4bo8ipzxv';
  
  console.log('\n🧪 Testing BrightData Browser API with BlackBox AI link');
  console.log('URL:', testUrl);
  console.log('API Key:', apiKey.substring(0, 10) + '...\n');

  const payload = {
    zone: 'scraping_browser1',
    url: testUrl,
    format: 'raw',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  };

  try {
    console.log('📡 Sending request to BrightData API...');
    const startTime = Date.now();
    
    const response = await axios.post('https://api.brightdata.com/request', payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
      maxRedirects: 0,
      validateStatus: () => true, // Accept any status
    });

    const duration = Date.now() - startTime;

    console.log('\n✅ Response received!');
    console.log('Status:', response.status);
    console.log('Duration:', duration + 'ms');
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    
    if (response.data) {
      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      console.log('\nBody preview (first 500 chars):');
      console.log(body.substring(0, 500));
      
      // Check for redirect
      if (response.status === 302 || response.status === 301) {
        console.log('\n🔄 Redirect detected!');
        console.log('Location:', response.headers.location);
      }
      
      // Check for meta refresh
      if (body.includes('http-equiv') && body.includes('refresh')) {
        console.log('\n🔄 Meta refresh detected in HTML');
        const match = body.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
        if (match && match[1]) {
          console.log('Meta refresh URL:', match[1]);
        }
      }
    }

    if (response.status === 200) {
      console.log('\n✅ SUCCESS: BrightData Browser API bypassed TLS fingerprinting!');
    } else if (response.status >= 400) {
      console.log('\n⚠️ Got error status:', response.status);
      console.log('This might indicate API issues or rate limiting');
    }

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Network error - check internet connection');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.log('\n💡 Authentication error - check your BrightData API key');
    } else if (error.message.includes('timeout')) {
      console.log('\n💡 Request timed out - BrightData might be slow or overloaded');
    }
    
    process.exit(1);
  }
}

testBrightDataBrowser();
