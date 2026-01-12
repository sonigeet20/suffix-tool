#!/bin/bash

# Quick Setup Script for BrightData Auto-Whitelist
# Run this on your local machine to prepare for deployment

echo "════════════════════════════════════════════════════════════"
echo "🔧 BrightData Auto-Whitelist - Quick Setup"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "📋 Step 1: Add columns to Supabase settings table"
echo "-----------------------------------------------------------"
echo "Run this SQL in Supabase SQL Editor:"
echo ""
cat << 'SQL'
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS brightdata_admin_api_token TEXT,
ADD COLUMN IF NOT EXISTS brightdata_customer_id TEXT,
ADD COLUMN IF NOT EXISTS brightdata_zone_name TEXT;
SQL
echo ""
echo "Press Enter when done..."
read

echo ""
echo "🔑 Step 2: Get your BrightData API token"
echo "-----------------------------------------------------------"
echo "1. Go to: https://brightdata.com/cp/api_tokens"
echo "2. Create new token with 'Zones' permissions"
echo "3. Copy the token"
echo ""
echo "Press Enter when you have the token..."
read

echo ""
echo "💾 Step 3: Update settings table with BrightData config"
echo "-----------------------------------------------------------"
echo "Run this SQL in Supabase SQL Editor:"
echo ""
cat << 'SQL'
UPDATE settings SET 
  brightdata_admin_api_token = 'a32a1380-c9f6-4d4c-85fe-b137b0116783',
  brightdata_customer_id = 'hl_a908b07a',
  brightdata_zone_name = 'testing_softality_1'
WHERE id = 1;
SQL
echo ""
echo "⚠️  Replace YOUR_API_TOKEN_HERE with your actual token!"
echo ""
echo "Press Enter when done..."
read

echo ""
echo "✅ Database configuration complete!"
echo ""
echo "📦 Next steps:"
echo "  1. Deploy auto-whitelist-brightdata.js to EC2 instances"
echo "  2. Add to PM2 ecosystem.config.js or systemd"
echo "  3. Test with: node auto-whitelist-brightdata.js"
echo ""
echo "For detailed instructions, see: BRIGHTDATA-AUTO-WHITELIST.md"
echo ""
