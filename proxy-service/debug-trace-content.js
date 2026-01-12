const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testTrace() {
  // Load BrightData creds
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: settings } = await supabase
    .from('settings')
    .select('bright_data_proxy_host, bright_data_proxy_port, bright_data_proxy_username, bright_data_proxy_password')
    .maybeSingle();

  const response = await axios.post('http://localhost:3000/trace', {
    url: 'https://ipapi.co/json/',
    max_redirects: 0,
    timeout_ms: 15000,
    mode: 'http_only',
    target_country: 'us',
    proxy_host: settings.bright_data_proxy_host,
    proxy_provider_port: settings.bright_data_proxy_port,
    proxy_provider_username: settings.bright_data_proxy_username,
    proxy_provider_password: settings.bright_data_proxy_password,
  });
  
  console.log('Response keys:', Object.keys(response.data));
  console.log('Chain length:', response.data.chain?.length);
  
  if (response.data.chain && response.data.chain[0]) {
    const step = response.data.chain[0];
    console.log('\nFirst step keys:', Object.keys(step));
    console.log('Status:', step.status);
    console.log('URL:', step.url);
    console.log('Has page_content:', !!step.page_content);
    console.log('Content length:', step.page_content?.length || 0);
    
    if (step.page_content) {
      console.log('\nContent preview:');
      console.log(step.page_content.substring(0, 800));
      
      try {
        const ipInfo = JSON.parse(step.page_content);
        console.log('\n✅ Parsed IP Info:');
        console.log('  IP:', ipInfo.ip);
        console.log('  Country:', ipInfo.country_name, `(${ipInfo.country})`);
        console.log('  City:', ipInfo.city);
        console.log('  Region:', ipInfo.region);
      } catch (e) {
        console.log('\n❌ Could not parse as JSON');
      }
    } else {
      console.log('\n❌ No page_content in response');
    }
  }
}

testTrace().catch(console.error);
