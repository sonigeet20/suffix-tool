import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rfhuqenntxiqurplenjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjEwNDgsImV4cCI6MjA4MTUzNzA0OH0.pi_6p2H2nuPfJvdT3pHNGpk0BTI3WQKTSzsj8dxQBA8'
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('google_ads_click_events')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error('ERROR:', error);
  } else {
    console.log('Table columns:', Object.keys(data[0]));
  }
}

checkSchema();
