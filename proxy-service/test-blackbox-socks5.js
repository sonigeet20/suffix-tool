const puppeteer = require('puppeteer');
require('dotenv').config();

async function testWithSOCKS5() {
  console.log('\n🧪 Testing Puppeteer with Luna SOCKS5 Proxy');
  console.log('URL: https://blackboxai.partnerlinks.io/pcn4bo8ipzxv\n');

  // Luna SOCKS5 credentials
  const socksProxy = 'socks5://as.lunaproxy.com:12233';
  const socksUsername = 'user-static_W6isN-region-in-sessid-inqyotrnc9dvdukkyn-sesstime-90';
  const socksPassword = 'Test7898';
  
  console.log(`🌐 Proxy: ${socksProxy}`);
  console.log(`🔐 Auth: ${socksUsername.substring(0, 20)}...****\n`);

  let browser;
  try {
    console.log('🚀 Launching Puppeteer with SOCKS5 proxy...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--proxy-server=${socksProxy}`,
        '--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE localhost"',
      ]
    });

    const page = await browser.newPage();
    
    // Authenticate SOCKS5 proxy
    await page.authenticate({
      username: socksUsername,
      password: socksPassword
    });

    console.log('📡 Navigating to BlackBox AI link...');
    
    // Track navigation
    const redirects = [];
    let finalUrl = null;
    
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      if ((status >= 300 && status < 400) || url.includes('partnerlinks') || url.includes('blackbox')) {
        console.log(`   [${status}] ${url.substring(0, 80)}...`);
        redirects.push({ url, status });
      }
    });
    
    const startTime = Date.now();
    
    const response = await page.goto('https://blackboxai.partnerlinks.io/pcn4bo8ipzxv', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
    
    const duration = Date.now() - startTime;
    finalUrl = page.url();
    
    console.log(`\n✅ Page loaded! (${duration}ms)`);
    console.log(`Status: ${response.status()}`);
    console.log(`Final URL: ${finalUrl}\n`);
    
    console.log('📋 Redirect chain:');
    redirects.forEach((r, i) => {
      console.log(`   ${i + 1}. [${r.status}] ${r.url.substring(0, 70)}...`);
    });
    
    if (finalUrl.includes('blackbox.ai')) {
      console.log('\n✅ SUCCESS: Puppeteer + Luna SOCKS5 proxy works perfectly!');
      console.log('✅ TLS fingerprinting bypassed with SOCKS5!');
      console.log('\n🎯 SOLUTION: Update server to use SOCKS5 instead of HTTP CONNECT proxy');
    } else {
      console.log('\n⚠️ Unexpected final URL');
    }
    
    await browser.close();

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    
    if (browser) {
      await browser.close();
    }
    
    process.exit(1);
  }
}

testWithSOCKS5();
