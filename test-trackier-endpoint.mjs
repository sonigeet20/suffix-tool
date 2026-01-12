import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEndpoint() {
  console.log('Fetching Trackier API key from settings...\n');
  
  const { data, error } = await supabase
    .from('settings')
    .select('trackier_api_key')
    .limit(1)
    .maybeSingle();
  
  if (error || !data?.trackier_api_key) {
    console.log('No API key found, using test key');
    return;
  }
  
  const apiKey = data.trackier_api_key;
  console.log(`Found API key: ${apiKey.substring(0, 10)}...`);
  console.log('\nTesting endpoint...\n');
  
  const response = await fetch('http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-validate-credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://suffix-tool.vercel.app'
    },
    body: JSON.stringify({
      apiKey: apiKey,
      apiBaseUrl: 'https://api.trackier.com'
    })
  });
  
  console.log('Status:', response.status);
  console.log('Headers:', Object.fromEntries(response.headers));
  
  const result = await response.json();
  console.log('\nResponse:', JSON.stringify(result, null, 2));
}

testEndpoint();
