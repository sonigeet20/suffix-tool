#!/bin/bash
# Quick Supabase Deployment Script
set -e

echo "🚀 Deploying to Supabase"
echo "========================"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Check if logged in
echo "📝 Checking Supabase login..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase. Please login:"
    supabase login
fi

echo ""
echo "📦 Deploying Edge Functions..."
echo ""

# Deploy trace-redirects
echo "1️⃣ Deploying trace-redirects..."
supabase functions deploy trace-redirects --no-verify-jwt
echo "✅ trace-redirects deployed"
echo ""

# Deploy get-suffix
echo "2️⃣ Deploying get-suffix..."
supabase functions deploy get-suffix --no-verify-jwt
echo "✅ get-suffix deployed"
echo ""

echo "🎉 Deployment Complete!"
echo ""
echo "Your functions are now live at:"
echo "  • trace-redirects: https://YOUR_PROJECT_REF.supabase.co/functions/v1/trace-redirects"
echo "  • get-suffix: https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-suffix"
echo ""
echo "To test:"
echo '  curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-suffix?offer_name=test" \'
echo '    -H "Authorization: Bearer YOUR_ANON_KEY"'
echo ""
