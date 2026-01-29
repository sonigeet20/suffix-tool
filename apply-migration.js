import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Read migration file
const migrationSQL = fs.readFileSync('./supabase/migrations/20260130_click_categorization.sql', 'utf8');

// Split into individual statements
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'))
  .map(s => s + ';');

console.log(`Found ${statements.length} SQL statements to execute\n`);

// Execute each statement
async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: 'rfhuqenntxiqurplenjn.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode, body });
        } else {
          resolve({ success: false, status: res.statusCode, body });
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(data);
    req.end();
  });
}

// Use Supabase client instead
async function applyMigration() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log('Applying migration using Supabase client...\n');

  // Execute the full SQL as one statement
  try {
    // Try executing via raw SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.log('RPC method not available, trying direct execution...');
      
      // Execute statements one by one
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt.includes('COMMENT ON')) continue; // Skip comments
        
        console.log(`[${i + 1}/${statements.length}] Executing statement...`);
        console.log(stmt.substring(0, 80) + '...\n');
        
        const result = await executeSQL(stmt);
        if (result.success) {
          console.log(`✅ Success (Status ${result.status})\n`);
        } else {
          console.log(`⚠️  Status ${result.status}: ${result.body}\n`);
        }
      }
    } else {
      console.log('✅ Migration applied successfully!');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

applyMigration();
