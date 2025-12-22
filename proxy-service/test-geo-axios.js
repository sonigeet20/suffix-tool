const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function testGeoTargeting() {
  console.log('Testing Luna Proxy Geo-Targeting Formats...\n');

  const baseUsername = 'user-admin_X5otK';
  const password = process.env.LUNA_PASSWORD;

  if (!password) {
    console.error('❌ LUNA_PASSWORD environment variable not set');
    console.error('Usage: LUNA_PASSWORD="your_password" node test-geo-axios.js');
    process.exit(1);
  }

  const host = 'gw-us.lunaproxy.net';
  const port = 12233;

  const testCases = [
    { name: 'No targeting (baseline)', username: baseUsername },
    { name: 'Lowercase -region-us', username: `${baseUsername}-region-us` },
    { name: 'Uppercase -region-US', username: `${baseUsername}-region-US` },
    { name: 'Lowercase -country-us', username: `${baseUsername}-country-us` },
    { name: 'Uppercase -country-US', username: `${baseUsername}-country-US` },
  ];

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Testing: ${testCase.name}`);
    console.log(`   Username: ${testCase.username}`);
    console.log(`${'='.repeat(60)}`);

    const proxyUrl = `http://${testCase.username}:${password}@${host}:${port}`;
    const agent = new HttpsProxyAgent(proxyUrl);

    try {
      const response = await axios.get('https://lumtest.com/myip.json', {
        httpsAgent: agent,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const data = response.data;
      console.log(`✅ SUCCESS`);
      console.log(`   Country: ${data.country} (${data.country_code})`);
      console.log(`   IP: ${data.ip}`);
      console.log(`   City: ${data.geo?.city || 'Unknown'}`);
      console.log(`   Region: ${data.geo?.region || 'Unknown'}`);
    } catch (error) {
      console.log(`❌ FAILED`);
      console.log(`   Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }

    // Wait 2 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Test complete!');
  console.log('='.repeat(60));
  console.log('\n📝 Analysis:');
  console.log('   - If all show same country: geo-targeting not working');
  console.log('   - If one shows US: that format works!');
  console.log('   - Compare "No targeting" with others to see difference');
}

testGeoTargeting().catch(console.error);
