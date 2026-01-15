import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('\n=== SETTINGS TABLE ===\n');
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*')
    .limit(5);
  
  if (settingsError) {
    console.log('Error:', settingsError);
  } else {
    console.log('Rows found:', settings.length);
    settings.forEach((row, i) => {
      console.log(`\nRow ${i + 1}:`, JSON.stringify(row, null, 2));
    });
  }

  console.log('\n=== PROXY_PROVIDERS TABLE ===\n');
  const { data: providers, error: providersError } = await supabase
    .from('proxy_providers')
    .select('*')
    .limit(5);
  
  if (providersError) {
    console.log('Error:', providersError);
  } else {
    console.log('Rows found:', providers.length);
    providers.forEach((row, i) => {
      console.log(`\nRow ${i + 1}:`, JSON.stringify(row, null, 2));
    });
    if (providers[0]) {
      console.log('\nColumn names:', Object.keys(providers[0]));
    }
  }
}

checkSchema();
