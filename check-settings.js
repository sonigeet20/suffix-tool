import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzgzNDc5NywiZXhwIjoyMDQ5NDEwNzk3fQ.kGetsmGuFZ91wpCZ7b_i3HZJhRryvSW00LCnLhHiAE8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSettings() {
  console.log('Checking settings table...\n');
  
  const { data, error } = await supabase
    .from('settings')
    .select('id, user_id, aws_proxy_url')
    .limit(5);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('❌ No settings found in table!');
    return;
  }
  
  console.log(`Found ${data.length} settings record(s):\n`);
  data.forEach(row => {
    console.log(`User ID: ${row.user_id}`);
    console.log(`AWS Proxy URL: ${row.aws_proxy_url || '(NULL)'}`);
    console.log('---');
  });
}

checkSettings();
