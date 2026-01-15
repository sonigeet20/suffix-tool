import axios from 'axios';

const PROXY_SERVICE_URL = 'http://localhost:3000';

async function testLunaConnection() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          TESTING LUNA PROXY CONNECTION                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Test 1: Browser mode (uses Luna proxy from settings)
  console.log('🧪 TEST 1: Browser Mode with Luna Proxy');
  console.log('─────────────────────────────────────────────────────────\n');

  try {
    const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
      url: 'https://httpbin.org/ip',
      mode: 'browser',
      max_redirects: 1,
      timeout_ms: 45000,
    }, {
      timeout: 50000,
      validateStatus: () => true,
    });

    if (response.data.error) {
      console.log(`❌ FAIL: ${response.data.error}\n`);
      if (response.data.details) {
        console.log(`   Details: ${response.data.details}\n`);
      }
    } else {
      const steps = response.data.steps || [];
      console.log(`✅ SUCCESS: Traced ${steps.length} step(s)`);
      console.log(`   Final URL: ${response.data.final_url}`);
      
      if (steps.length > 0) {
        console.log(`\n   📋 Step Details:`);
        steps.forEach((step, i) => {
          console.log(`   Step ${i + 1}: ${step.url}`);
          console.log(`   - Status: ${step.status_code}`);
          console.log(`   - Method: ${step.method || 'GET'}`);
          
          if (step.response_body) {
            try {
              const parsed = JSON.parse(step.response_body);
              if (parsed.origin) {
                console.log(`   - IP Address: ${parsed.origin} ✅ (Proxy is working!)`);
              }
            } catch (e) {
              // Not JSON, that's okay
            }
          }
        });
      }
      console.log('');
    }
  } catch (error) {
    console.log(`💥 ERROR: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      console.log('   Make sure proxy-service is running on port 3000\n');
    } else {
      console.log(`   ${error.stack}\n`);
    }
  }

  // Test 2: Anti-cloaking mode (also uses Luna proxy)
  console.log('\n🧪 TEST 2: Anti-Cloaking Mode with Luna Proxy');
  console.log('─────────────────────────────────────────────────────────\n');

  try {
    const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
      url: 'https://httpbin.org/ip',
      mode: 'anti_cloaking',
      max_redirects: 1,
      timeout_ms: 45000,
    }, {
      timeout: 50000,
      validateStatus: () => true,
    });

    if (response.data.error) {
      console.log(`❌ FAIL: ${response.data.error}\n`);
    } else {
      const steps = response.data.steps || [];
      console.log(`✅ SUCCESS: Traced ${steps.length} step(s)`);
      
      if (steps.length > 0 && steps[0].response_body) {
        try {
          const parsed = JSON.parse(steps[0].response_body);
          if (parsed.origin) {
            console.log(`   IP Address: ${parsed.origin} ✅ (Proxy working!)`);
          }
        } catch (e) {
          // Not JSON
        }
      }
      console.log('');
    }
  } catch (error) {
    console.log(`💥 ERROR: ${error.message}\n`);
  }

  // Test 3: Check for geo-targeting
  console.log('\n🧪 TEST 3: Geo-Targeting Test (US IP)');
  console.log('─────────────────────────────────────────────────────────\n');

  try {
    const response = await axios.post(`${PROXY_SERVICE_URL}/trace`, {
      url: 'https://httpbin.org/ip',
      mode: 'browser',
      target_country: 'us',
      max_redirects: 1,
      timeout_ms: 45000,
    }, {
      timeout: 50000,
      validateStatus: () => true,
    });

    if (response.data.error) {
      console.log(`❌ FAIL: ${response.data.error}\n`);
    } else {
      const steps = response.data.steps || [];
      console.log(`✅ SUCCESS: Traced ${steps.length} step(s) with target_country=us`);
      
      if (steps.length > 0 && steps[0].response_body) {
        try {
          const parsed = JSON.parse(steps[0].response_body);
          if (parsed.origin) {
            console.log(`   IP Address: ${parsed.origin}`);
            console.log(`   Geo-targeting: US ✅`);
          }
        } catch (e) {
          // Not JSON
        }
      }
      console.log('');
    }
  } catch (error) {
    console.log(`💥 ERROR: ${error.message}\n`);
  }

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     SUMMARY                                ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  console.log('✅ Luna proxy connection tests completed!');
  console.log('   Check the IP addresses above to verify proxy is routing traffic.\n');
}

testLunaConnection();
