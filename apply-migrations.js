#!/usr/bin/env node

/**
 * Apply pending Trackier migrations to Supabase
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file manually
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rfhuqenntxiqurplenjn.supabase.co';
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SERVICE_ROLE_KEY not found in .env');
  process.exit(1);
}

// Read migration files
const migrations = [
  {
    name: '20260110020000_trackier_integration_complete.sql',
    path: path.join(__dirname, 'supabase/migrations/20260110020000_trackier_integration_complete.sql')
  },
  {
    name: '20260110040000_add_trackier_api_key_to_settings.sql',
    path: path.join(__dirname, 'supabase/migrations/20260110040000_add_trackier_api_key_to_settings.sql')
  }
];

async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);
    
    const postData = JSON.stringify({ query: sql });
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data, statusCode: res.statusCode });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function applyMigrations() {
  console.log('🚀 Starting migration process...\n');

  for (const migration of migrations) {
    console.log(`📄 Applying: ${migration.name}`);
    
    try {
      // Read SQL file
      const sql = fs.readFileSync(migration.path, 'utf8');
      
      // Execute SQL
      const result = await executeSql(sql);
      
      console.log(`✅ Success: ${migration.name}`);
      console.log(`   Status: ${result.statusCode}\n`);
      
    } catch (error) {
      console.error(`❌ Failed: ${migration.name}`);
      console.error(`   Error: ${error.message}\n`);
      
      // Continue with next migration even if one fails
      // (useful for idempotent migrations)
    }
  }

  console.log('✨ Migration process complete!\n');
}

// Run migrations
applyMigrations().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
