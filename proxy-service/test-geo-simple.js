const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

async function testGeoTargeting() {
  console.log('Testing Luna Proxy Geo-Targeting Formats...\n');

  const baseUsername = 'user-admin_X5otK';
  const password = process.env.LUNA_PASSWORD || 'YOUR_PASSWORD';
  const host = 'gw-us.lunaproxy.net';
  const port = 12233;

  const testCases = [
    { name: 'No targeting', username: baseUsername },
    { name: 'Lowercase -region-us', username: `${baseUsername}-region-us` },
    { name: 'Uppercase -region-US', username: `${baseUsername}-region-US` },
    { name: 'Country code -country-us', username: `${baseUsername}-country-us` },
    { name: 'Country code -country-US', username: `${baseUsername}-country-US` },
  ];

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);
    console.log(`   Username: ${testCase.username}`);

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
      console.log(`   ✅ Country: ${data.country}`);
      console.log(`   📍 IP: ${data.ip}`);
      console.log(`   🏙️  City: ${data.geo?.city || 'Unknown'}`);
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n✨ Test complete!');
}

testGeoTargeting().catch(console.error);
