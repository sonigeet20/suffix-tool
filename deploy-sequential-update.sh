#!/bin/bash

# Database Migration - Sequential Suffix Update System
# Run this to deploy the new database functions to Supabase

echo "🚀 Deploying Sequential Suffix Update database functions..."
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Install PostgreSQL client or run via Supabase dashboard."
    echo ""
    echo "Alternative: Copy webhook_suffix_system.sql to Supabase SQL Editor and run manually."
    exit 1
fi

# Supabase connection details (update these)
SUPABASE_URL="https://rfhuqenntxiqurplenjn.supabase.co"
SUPABASE_DB_HOST="db.rfhuqenntxiqurplenjn.supabase.co"
SUPABASE_DB_PORT="5432"
SUPABASE_DB_NAME="postgres"
SUPABASE_DB_USER="postgres"

# Read password securely
echo "Enter Supabase database password:"
read -s SUPABASE_DB_PASSWORD
echo ""

# SQL file path
SQL_FILE="supabase/migrations/webhook_suffix_system.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ SQL file not found: $SQL_FILE"
    exit 1
fi

echo "📝 Executing migration..."
echo ""

# Execute SQL file
PGPASSWORD=$SUPABASE_DB_PASSWORD psql \
    -h $SUPABASE_DB_HOST \
    -p $SUPABASE_DB_PORT \
    -U $SUPABASE_DB_USER \
    -d $SUPABASE_DB_NAME \
    -f $SQL_FILE

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "New functions available:"
    echo "  - get_next_suffix_from_bucket(p_mapping_id) - Get next unused suffix (sequential)"
    echo "  - mark_suffix_used(p_suffix_id) - Mark suffix as used"
    echo "  - clean_old_used_suffixes(p_mapping_id) - Delete old/used suffixes"
    echo "  - delete_suffix_from_bucket(p_suffix_id) - Delete specific suffix"
    echo ""
    echo "Ready to deploy Google Ads script!"
else
    echo ""
    echo "❌ Migration failed. Check errors above."
    exit 1
fi
