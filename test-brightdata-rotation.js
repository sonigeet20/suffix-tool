// Test BrightData Browser API with geo and UA rotation
const SUPABASE_URL = 'https://rfhuqenntxiqurplenjn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

async function testRotation(offerName, numTests = 5) {
  console.log(`\n🧪 Testing ${offerName} rotation (${numTests} calls)...\n`);
  
  const results = {
    countries: {},
    devices: {},
    userAgents: new Set(),
  };

  for (let i = 1; i <= numTests; i++) {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-suffix?offer_name=${offerName}`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`\n📍 Test ${i}/${numTests}:`);
        console.log(`   Suffix: ${data.suffix}`);
        console.log(`   Final URL: ${data.final_url?.substring(0, 80)}...`);
        console.log(`   Proxy Used: ${data.proxy_used || 'N/A'}`);
        console.log(`   Proxy IP: ${data.proxy_ip || 'N/A'}`);
        
        // Track geo location
        if (data.geo_location) {
          const country = data.geo_location.country || 'unknown';
          results.countries[country] = (results.countries[country] || 0) + 1;
          console.log(`   📍 Country: ${country} (${data.geo_location.city || 'N/A'})`);
        }
        
        // Track user agent
        if (data.user_agent) {
          results.userAgents.add(data.user_agent);
          const deviceType = data.user_agent.includes('Mobile') ? 'Mobile' : 'Desktop';
          results.devices[deviceType] = (results.devices[deviceType] || 0) + 1;
          console.log(`   📱 Device: ${deviceType}`);
          console.log(`   🔧 UA: ${data.user_agent.substring(0, 100)}...`);
        }
      } else {
        console.error(`   ❌ Test ${i} failed:`, data.error);
      }
      
      // Wait 2 seconds between calls
      if (i < numTests) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`   ❌ Test ${i} error:`, error.message);
    }
  }

  // Summary
  console.log(`\n\n📊 ROTATION SUMMARY for ${offerName}:`);
  console.log(`\n🌍 Country Distribution:`);
  for (const [country, count] of Object.entries(results.countries)) {
    console.log(`   ${country}: ${count}/${numTests} (${(count/numTests*100).toFixed(1)}%)`);
  }
  
  console.log(`\n📱 Device Distribution:`);
  for (const [device, count] of Object.entries(results.devices)) {
    console.log(`   ${device}: ${count}/${numTests} (${(count/numTests*100).toFixed(1)}%)`);
  }
  
  console.log(`\n🔧 Unique User Agents: ${results.userAgents.size}`);
  
  return results;
}

// Run test
(async () => {
  // Test with an offer that has geo_pool and device_distribution configured
  await testRotation('LIQUIDWEB', 10);
})();
