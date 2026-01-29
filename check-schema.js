import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  try {
    // Get one row to see columns
    const { data, error } = await supabase
      .from('google_ads_click_events')
      .select('*')
      .eq('offer_name', 'SURFSHARK_US_WW_SHEET_SMB')
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      console.log('Available columns:');
      console.log(Object.keys(data[0]).sort());
      console.log('\nSample row:');
      console.log(JSON.stringify(data[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkSchema();
