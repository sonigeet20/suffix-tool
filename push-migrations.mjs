import pg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) process.env[key.trim()] = value.trim();
});

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

console.log('📦 Reading database credentials from Supabase...');
console.log(`   Project: ${projectRef}`);
console.log('');

// Prompt for database password
console.log('⚠️  Database password required for direct connection.');
console.log('   Find it in: Supabase Dashboard > Project Settings > Database > Connection String');
console.log('');
console.log('Or use SQL Editor in dashboard and paste migration SQL directly:');
console.log(`   https://app.supabase.com/project/${projectRef}/editor`);
console.log('');

// Show migration files
console.log('📄 Pending migrations:');
console.log('   1. supabase/migrations/20260110020000_trackier_integration_complete.sql');
console.log('   2. supabase/migrations/20260110040000_add_trackier_api_key_to_settings.sql');
console.log('');
console.log('✨ To apply migrations manually:');
console.log('   1. Go to Supabase SQL Editor');
console.log('   2. Copy each file content');
console.log('   3. Execute in order');
