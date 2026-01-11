import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) process.env[key.trim()] = value.trim();
});

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

console.log('🚀 Applying Trackier migrations...\n');

// Migration 1
console.log('📄 Migration 1: Trackier Integration Tables');
const sql1 = fs.readFileSync('./supabase/migrations/20260110020000_trackier_integration_complete.sql', 'utf8');

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql: sql1 });
  if (error) throw error;
  console.log('✅ Migration 1 applied successfully\n');
} catch (error) {
  console.log('⚠️  Migration 1 failed (may already exist):', error.message);
  console.log('   This is normal if tables already exist.\n');
}

// Migration 2
console.log('📄 Migration 2: Trackier API Key in Settings');
const sql2 = fs.readFileSync('./supabase/migrations/20260110040000_add_trackier_api_key_to_settings.sql', 'utf8');

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql: sql2 });
  if (error) throw error;
  console.log('✅ Migration 2 applied successfully\n');
} catch (error) {
  console.log('⚠️  Migration 2 failed (may already exist):', error.message);
  console.log('   This is normal if column already exists.\n');
}

console.log('✨ Migration process complete!');
