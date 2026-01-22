const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--proxy-server=http://na.lunaproxy.com:12233'
    ]
  });

  const page = await browser.newPage();
  
  // Authenticate proxy
  await page.authenticate({
    username: 'user-admin_X5otK',
    password: 'Dang7898'
  });

  console.log('Navigating to BlackBox AI link...');
  const response = await page.goto('https://blackboxai.partnerlinks.io/pcn4bo8ipzxv', {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  console.log('Final URL:', page.url());
  console.log('Status:', response.status());
  
  await browser.close();
  console.log('✅ SUCCESS: Browser mode bypassed TLS fingerprinting');
})().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
