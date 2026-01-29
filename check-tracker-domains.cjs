#!/usr/bin/env node

const https = require('https');

const HOSTINGER_API_KEY = 'cFBJ98vYmkELB4NuA7tVGm6zFbGHchUhGy8Wo5Gm09afb236';
const API_BASE = 'https://developers.hostinger.com';

const trackerDomains = `
1l-go.my.games
2performant.com
fff.com.vn
t.6sc.co
rcv.ixd.dmm.co.jp
clt.johren.net
clt.ixd.dmm.co.jp
clt.johren.games
rcv.johren.net
rcv.ixd.dmm.com
clt.ixd.dmm.com
rcv.johren.games
ac.ebis.ne.jp
track.adsplay.in
cl.adsever.in
aiotrack.org
ai-track.net
ai-trk.com
cl4.andromobi.com
cl1.andromobi.com
cl5.andromobi.com
cl3.andromobi.com
click.andromobi.com
cl2.andromobi.com
ads.ads-astra.com
adition.com
mememasti.com
bulletinweb.com
khelgali.com
breaknewz.com
techtubebox.com
crickcounty.com
travellercounty.com
adaxxcloud.com
ab-x.link
ap1.adtouch.dfinery.io
adtouch.adbrix.io
t.adcell.com
addrevenue.io
adflowtracker.com
adform.net
adform.com
seadform.net
adjust.com
adlucent.com
ad.admitad.com
tjzuh.com
day24.online
`;

// Extract root domains
function extractRootDomain(domain) {
  const parts = domain.trim().split('.');
  
  // Handle special TLDs like .co.uk, .com.au, .co.jp, .com.vn, .ne.jp
  const specialTLDs = [
    '.co.uk', '.co.jp', '.co.in', '.co.nz', '.co.au', 
    '.com.au', '.com.br', '.com.tw', '.com.vn',
    '.ne.jp', '.or.jp'
  ];
  
  const domainStr = '.' + domain;
  for (const tld of specialTLDs) {
    if (domainStr.endsWith(tld)) {
      const tldParts = tld.split('.').filter(p => p);
      return parts.slice(-(tldParts.length + 1)).join('.');
    }
  }
  
  // Default: last 2 parts
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  
  return domain;
}

// Get unique root domains
const allDomains = trackerDomains.split('\n')
  .map(d => d.trim())
  .filter(d => d.length > 0);

const rootDomains = [...new Set(allDomains.map(extractRootDomain))];

console.log(`\n🔍 Found ${rootDomains.length} unique root domains from ${allDomains.length} tracker URLs\n`);

// Check domain availability via Hostinger API (single domain with TLD)
function checkDomainAvailability(domainName, tld) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ 
      domain: domainName,
      tlds: [tld]
    });
    
    const options = {
      hostname: 'developers.hostinger.com',
      path: '/api/domains/v1/availability',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HOSTINGER_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject({ error: 'Failed to parse response', raw: data.substring(0, 200) });
        }
      });
    });

    req.on('error', (error) => {
      reject({ error: error.message });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      reject({ error: 'Timeout' });
    });

    req.write(postData);
    req.end();
  });
}

// Check domains in batches
async function checkAllDomains() {
  const batchSize = 1; // Check 1 domain at a time to avoid rate limits
  const results = {
    available: [],
    unavailable: [],
    errors: []
  };

  console.log('📊 Checking domain availability...\n');
  console.log(`⏱️  This will take approximately ${Math.ceil(rootDomains.length * 5 / 60)} minutes with 5s delays...\n`);

  for (let i = 0; i < rootDomains.length; i += batchSize) {
    const batch = rootDomains.slice(i, i + batchSize);
    
    console.log(`[${i+1}/${rootDomains.length}] Checking...`);
    
    const promises = batch.map(async (fullDomain) => {
      const parts = fullDomain.split('.');
      const tld = parts.slice(-1)[0]; // Last part
      const domainName = parts.slice(0, -1).join('.'); // Everything before TLD
      
      try {
        const result = await checkDomainAvailability(domainName, tld);
        
        if (Array.isArray(result) && result.length > 0) {
          const domainInfo = result[0];
          if (domainInfo.is_available === true) {
            results.available.push({
              domain: fullDomain,
              restriction: domainInfo.restriction || 'None'
            });
            console.log(`✅ ${fullDomain} - AVAILABLE! 💰`);
          } else {
            results.unavailable.push(fullDomain);
            console.log(`⛔ ${fullDomain} - Taken`);
          }
        } else {
          results.errors.push({ domain: fullDomain, error: 'Invalid response format' });
          console.log(`❌ ${fullDomain} - Invalid response`);
        }
      } catch (err) {
        results.errors.push({ domain: fullDomain, error: err.error || 'Unknown' });
        console.log(`❌ ${fullDomain} - Error: ${err.error || 'Unknown'}`);
      }
    });

    await Promise.all(promises);

    // Add 5 second delay between each domain to avoid rate limiting
    if (i + batchSize < rootDomains.length) {
      console.log('⏳ Waiting 5 seconds to avoid rate limiting...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Available for purchase: ${results.available.length}`);
  console.log(`⛔ Already registered: ${results.unavailable.length}`);
  console.log(`❌ Errors/Unknown: ${results.errors.length}`);

  if (results.available.length > 0) {
    console.log('\n🎉 AVAILABLE DOMAINS TO BUY:');
    console.log('='.repeat(60));
    results.available.forEach(item => {
      console.log(`  • ${item.domain}`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\n⚠️  ERRORS (check manually):');
    console.log('='.repeat(60));
    results.errors.slice(0, 15).forEach(err => {
      console.log(`  • ${err.domain} - ${err.error}`);
    });
    if (results.errors.length > 15) {
      console.log(`  ... and ${results.errors.length - 15} more errors`);
    }
  }

  console.log('\n✨ Check complete!\n');
}

checkAllDomains().catch(console.error);
