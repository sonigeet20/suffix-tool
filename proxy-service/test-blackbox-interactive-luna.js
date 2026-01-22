const puppeteer = require('puppeteer');
require('dotenv').config();

async function testInteractiveWithLuna() {
  console.log('\n🧪 Testing Interactive Mode (Puppeteer) with Luna Proxy');
  console.log('URL: https://blackboxai.partnerlinks.io/pcn4bo8ipzxv\n');

  const proxyUrl = 'http://na.lunaproxy.com:12233';
  const proxyAuth = 'user-admin_X5otK:Dang7898';
  
  console.log(`🌐 Proxy: ${proxyUrl}`);
  console.log(`🔐 Auth: ${proxyAuth.split(':')[0]}:****\n`);

  let browser;
  try {
    console.log('🚀 Launching Puppeteer with Luna proxy...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--proxy-server=${proxyUrl}`,
      ]
    });

    const page = await browser.newPage();
    
    // Authenticate proxy
    await page.authenticate({
      username: 'user-admin_X5otK',
      password: 'Dang7898'
    });

    console.log('📡 Navigating to BlackBox AI link...');
    
    const startTime = Date.now();
    
    try {
      const response = await page.goto('https://blackboxai.partnerlinks.io/pcn4bo8ipzxv', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });
      
      const duration = Date.now() - startTime;
      
      console.log(`\n✅ Page loaded! (${duration}ms)`);
      console.log(`Status: ${response.status()}`);
      console.log(`Final URL: ${page.url()}`);
      
      if (page.url() !== 'https://blackboxai.partnerlinks.io/pcn4bo8ipzxv') {
        console.log('\n✅ SUCCESS: Redirect followed to final destination!');
        console.log('✅ Puppeteer + Luna proxy bypassed TLS fingerprinting!');
      } else {
        console.log('\n⚠️ Still on initial URL - redirect may not have happened');
      }
      
    } catch (navError) {
      console.error(`\n❌ Navigation failed: ${navError.message}`);
      
      if (navError.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
        console.log('\n💡 DIAGNOSIS: Proxy tunnel connection failed');
        console.log('Luna proxy rejected the CONNECT tunnel request');
        console.log('Possible reasons:');
        console.log('  1. TLS fingerprinting detected even through browser');
        console.log('  2. Luna proxy doesn\'t properly support CONNECT tunnels for this destination');
        console.log('  3. The target server blocks traffic from Luna\'s IP ranges');
      } else if (navError.message.includes('ECONNRESET')) {
        console.log('\n💡 DIAGNOSIS: Connection reset by proxy or server');
        console.log('The connection was established but then closed');
        console.log('Possible reasons:');
        console.log('  1. Server detected Luna proxy IP and blocked it');
        console.log('  2. TLS handshake succeeded but HTTP request was blocked');
        console.log('  3. Luna proxy has rate limits or restrictions on this domain');
      } else if (navError.message.includes('timeout')) {
        console.log('\n💡 DIAGNOSIS: Request timed out');
        console.log('Connection established but page didn\'t load in time');
      } else if (navError.message.includes('net::ERR_PROXY_CONNECTION_FAILED')) {
        console.log('\n💡 DIAGNOSIS: Cannot connect to proxy server');
        console.log('Luna proxy server might be down or unreachable');
      }
      
      throw navError;
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    
    console.log('\n📋 COMPARISON:');
    console.log('✅ Direct connection (no proxy): Works');
    console.log('❌ Luna + curl/axios: TLS fingerprinting error');
    console.log('❌ Luna + Puppeteer: Connection error');
    console.log('✅ BrightData Browser API: Works');
    
    console.log('\n🎯 CONCLUSION:');
    console.log('The BlackBox AI affiliate network is blocking Luna proxy IPs');
    console.log('OR Luna proxy doesn\'t properly support CONNECT tunnels for HTTPS');
    console.log('\n💡 SOLUTION: Use BrightData Browser API for this offer');
    
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testInteractiveWithLuna();
