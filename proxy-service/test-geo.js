const puppeteer = require('puppeteer');

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

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=${host}:${port}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    try {
      const page = await browser.newPage();

      await page.authenticate({
        username: testCase.username,
        password: password,
      });

      await page.goto('https://lumtest.com/myip.json', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const content = await page.content();
      const match = content.match(/"country":\s*"([^"]+)"/);
      const country = match ? match[1] : 'Unknown';

      console.log(`   ✅ Result: ${country}`);
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    } finally {
      await browser.close();
    }
  }

  console.log('\n✨ Test complete!');
}

testGeoTargeting().catch(console.error);
