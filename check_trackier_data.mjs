import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envPath = '.env';
const env = fs.readFileSync(envPath, 'utf-8')
  .split('\n')
  .reduce((acc, line) => {
    const [key, value] = line.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Check mappings
const { data: mappings, error: mapErr } = await supabase
  .from('v5_campaign_offer_mapping')
  .select('*')
  .order('created_at', { ascending: false });

if (mapErr) {
  console.error('Error fetching mappings:', mapErr);
} else {
  console.log('\n=== Campaign Mappings ===');
  console.log(JSON.stringify(mappings, null, 2));
}

// Check Trackier campaigns
const { data: trackier, error: tErr } = await supabase
  .from('v5_trackier_campaigns')
  .select('*');

if (tErr) {
  console.error('Error fetching Trackier campaigns:', tErr);
} else {
  console.log('\n=== Trackier Campaigns ===');
  console.log(JSON.stringify(trackier, null, 2));
}
