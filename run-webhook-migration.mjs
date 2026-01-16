#!/usr/bin/env node

/**
 * Run webhook suffix system database migration
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://rfhuqenntxiqurplenjn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🚀 Running webhook suffix system migration...\n');

  try {
    // Read migration file
    const sql = fs.readFileSync('supabase/migrations/webhook_suffix_system.sql', 'utf8');
    
    // Split by semicolons and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements\n`);
    
    let successCount = 0;
    let skipCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip comments
      if (statement.startsWith('COMMENT ON')) {
        console.log(`⏭️  Skipping comment ${i + 1}/${statements.length}`);
        skipCount++;
        continue;
      }
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          // Check if it's "already exists" error - that's OK
          if (error.message && error.message.includes('already exists')) {
            console.log(`✓ Statement ${i + 1}/${statements.length} - already exists (OK)`);
            successCount++;
          } else {
            console.log(`✗ Statement ${i + 1}/${statements.length} - ${error.message}`);
          }
        } else {
          console.log(`✓ Statement ${i + 1}/${statements.length} - success`);
          successCount++;
        }
      } catch (err) {
        console.log(`✗ Statement ${i + 1}/${statements.length} - ${err.message}`);
      }
    }
    
    console.log(`\n✅ Migration complete: ${successCount}/${statements.length} successful, ${skipCount} skipped\n`);
    
    // Verify tables exist
    console.log('Verifying tables...');
    
    const tables = [
      'webhook_campaign_mappings',
      'webhook_suffix_bucket',
      'webhook_suffix_update_queue',
      'webhook_suffix_usage_log'
    ];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(0);
      
      if (error) {
        console.log(`❌ ${table} - ${error.message}`);
      } else {
        console.log(`✅ ${table}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
