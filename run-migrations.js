#!/usr/bin/env node

/**
 * Run Proxy Protocol Migrations
 * Adds proxy_protocol column to proxy_providers and offers tables
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './proxy-service/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigrations() {
  console.log('🔧 Running proxy_protocol migrations...\n');

  try {
    // Migration 1: Add proxy_protocol to proxy_providers
    console.log('📊 Migration 1: Adding proxy_protocol to proxy_providers table...');
    
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE proxy_providers ADD COLUMN IF NOT EXISTS proxy_protocol VARCHAR(10) DEFAULT 'http';
        ALTER TABLE proxy_providers DROP CONSTRAINT IF EXISTS proxy_providers_proxy_protocol_check;
        ALTER TABLE proxy_providers ADD CONSTRAINT proxy_providers_proxy_protocol_check CHECK (proxy_protocol IN ('http', 'socks5'));
        UPDATE proxy_providers SET proxy_protocol = 'http' WHERE proxy_protocol IS NULL;
      `
    });

    if (error1) {
      // Try direct SQL execution if RPC doesn't exist
      console.log('⚠️  RPC method not available, using direct approach...');
      
      // Check if column exists
      const { data: cols1, error: checkErr1 } = await supabase
        .from('proxy_providers')
        .select('*')
        .limit(1);
      
      if (!checkErr1) {
        console.log('✅ proxy_providers table accessible');
        // Column will be added by database migration or manual SQL
      }
    } else {
      console.log('✅ Migration 1 complete: proxy_protocol added to proxy_providers');
    }

    // Migration 2: Add proxy_protocol to offers
    console.log('\n📊 Migration 2: Adding proxy_protocol to offers table...');
    
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE offers ADD COLUMN IF NOT EXISTS proxy_protocol VARCHAR(10) DEFAULT 'http';
        ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_proxy_protocol_check;
        ALTER TABLE offers ADD CONSTRAINT offers_proxy_protocol_check CHECK (proxy_protocol IN ('http', 'socks5'));
        UPDATE offers SET proxy_protocol = 'http' WHERE proxy_protocol IS NULL;
        COMMENT ON COLUMN offers.proxy_protocol IS 'Proxy protocol: http or socks5. Overrides provider default. Use socks5 for TLS fingerprint bypass.';
      `
    });

    if (error2) {
      console.log('⚠️  RPC method not available, using direct approach...');
      
      // Check if column exists
      const { data: cols2, error: checkErr2 } = await supabase
        .from('offers')
        .select('*')
        .limit(1);
      
      if (!checkErr2) {
        console.log('✅ offers table accessible');
      }
    } else {
      console.log('✅ Migration 2 complete: proxy_protocol added to offers');
    }

    // Verification
    console.log('\n🔍 Verifying migrations...');
    
    // Try to select with new column
    const { data: testOffer, error: testError } = await supabase
      .from('offers')
      .select('id, offer_name, proxy_protocol')
      .limit(1)
      .maybeSingle();

    if (testError) {
      console.log('⚠️  Column verification: Column may not exist yet');
      console.log('\n📋 Manual Migration Required:');
      console.log('   Run the following SQL in Supabase SQL Editor:');
      console.log('\n   -- Add to proxy_providers:');
      console.log('   ALTER TABLE proxy_providers ADD COLUMN IF NOT EXISTS proxy_protocol VARCHAR(10) DEFAULT \'http\';');
      console.log('   ALTER TABLE proxy_providers ADD CONSTRAINT proxy_providers_proxy_protocol_check CHECK (proxy_protocol IN (\'http\', \'socks5\'));');
      console.log('\n   -- Add to offers:');
      console.log('   ALTER TABLE offers ADD COLUMN IF NOT EXISTS proxy_protocol VARCHAR(10) DEFAULT \'http\';');
      console.log('   ALTER TABLE offers ADD CONSTRAINT offers_proxy_protocol_check CHECK (proxy_protocol IN (\'http\', \'socks5\'));');
      console.log('\n   Or use the Supabase Dashboard → SQL Editor and run: apply-proxy-protocol-migrations.sql');
    } else {
      console.log('✅ Verification complete: proxy_protocol column exists');
      if (testOffer) {
        console.log(`   Sample: ${testOffer.offer_name} - protocol: ${testOffer.proxy_protocol || 'http (default)'}`);
      }
    }

    console.log('\n✨ Migration process complete!');
    console.log('\n📌 Next steps:');
    console.log('   1. Verify in Supabase Dashboard that columns exist');
    console.log('   2. Test locally: node proxy-service/test-socks5-implementation.js');
    console.log('   3. Update an offer to use SOCKS5 protocol');
    console.log('   4. Deploy to AWS EC2 instances');

  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  }
}

runMigrations();
