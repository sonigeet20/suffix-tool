#!/bin/bash

# Setup Edge Function Secrets for Google Ads Click Tracker
# Run this script to configure the AWS proxy URL for edge functions

echo "🔐 Setting up Edge Function Secrets..."
echo ""

# Get the AWS proxy IPs (using the ones we deployed to)
AWS_PROXIES="44.213.112.175:3000,13.222.100.70:3000,13.220.246.128:3000,52.54.72.188:3000,3.238.101.170:3000,44.200.222.95:3000,100.53.41.66:3000"

echo "Setting AWS_PROXY_URL for edge functions..."
echo "Proxies: $AWS_PROXIES"
echo ""

# Set the secret (requires Supabase CLI to be logged in)
npx supabase secrets set AWS_PROXY_URL="http://$AWS_PROXIES"

echo ""
echo "✅ Edge function secrets configured!"
echo ""
echo "The following edge functions will now use AWS proxy servers for tracing:"
echo "  - trace-redirects"
echo "  - get-suffix-geo"
echo "  - fill-geo-buckets"
echo ""
echo "Test with:"
echo "  curl https://rfhuqenntxiqurplenjn.supabase.co/functions/v1/get-suffix-geo \\"
echo "    -H \"Authorization: Bearer \$SUPABASE_ANON_KEY\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"offer_name\":\"YOUR_OFFER\",\"target_country\":\"US\",\"count\":1}'"
