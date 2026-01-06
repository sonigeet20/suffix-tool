const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateProxyUrl() {
  const newUrl = 'http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com';
  
  console.log('🔄 Updating aws_proxy_url in settings table...');
  console.log(`New URL: ${newUrl}`);
  
  const { data, error } = await supabase
    .from('settings')
    .update({ aws_proxy_url: newUrl })
    .eq('user_id', 'f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b')
    .select();
  
  if (error) {
    console.error('❌ Error updating settings:', error);
    process.exit(1);
  }
  
  console.log('✅ Settings updated successfully!');
  console.log('Updated record:', data);
  
  // Verify the update
  const { data: verify, error: verifyError } = await supabase
    .from('settings')
    .select('aws_proxy_url')
    .eq('user_id', 'f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b')
    .single();
  
  if (verifyError) {
    console.error('❌ Error verifying update:', verifyError);
    process.exit(1);
  }
  
  console.log('\n📋 Verification:');
  console.log(`Current aws_proxy_url: ${verify.aws_proxy_url}`);
}

updateProxyUrl().catch(console.error);
