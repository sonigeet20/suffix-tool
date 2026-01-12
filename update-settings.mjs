import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSettings() {
  const loadBalancerUrl = 'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com';
  
  console.log('Updating aws_proxy_url in settings table...\n');
  
  // Update all settings records
  const { data, error } = await supabase
    .from('settings')
    .update({ aws_proxy_url: loadBalancerUrl })
    .select();
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`✅ Updated ${data?.length || 0} record(s)`);
  console.log(`\nNew aws_proxy_url: ${loadBalancerUrl}`);
}

updateSettings();
