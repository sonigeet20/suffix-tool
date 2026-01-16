#!/bin/bash

# Test Trackier's cache behavior by tracing from different IPs
# This will help determine if Trackier returns cached responses or generates unique parameters per IP

TRACKIER_URL="https://nebula.gotrackier.com/click?campaign_id=408&pub_id=2&force_transparent=true&url=https%3A%2F%2Fnebula.gotrackier.com%2Fclick%3Fcampaign_id%3D407%26pub_id%3D2%26force_transparency%3Dtrue%26url%3Dhttps%253A%252F%252Fwww.ultrahuman.com%252F%253Fgclid%253D%257Bp1%257D%2526fbclid%253D%257Bp2%257D%2526msclkid%253D%257Bp3%257D%2526ttclid%253D%257Bp4%257D%2526clickid%253D%257Bp5%257D%2526utm_source%253D%257Bp6%257D%2526utm_medium%253D%257Bp7%257D%2526utm_campaign%253D%257Bp8%257D%2526custom1%253D%257Bp9%257D%2526custom2%253D%257Bp10%257D"

PROXY_SERVICE="http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com"
NUM_TRACES=8
DELAY_SECONDS=10

# Different geos to test from different IPs
GEOS=("US" "GB" "CA" "DE" "AU" "FR" "IT" "ES")

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         TRACKIER CACHE BEHAVIOR TEST                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 Target URL: Campaign 408 → 407 → ultrahuman.com"
echo "🔢 Number of traces: $NUM_TRACES"
echo "⏱️  Delay between traces: ${DELAY_SECONDS}s"
echo "🌍 Testing from different geos to get different IPs"
echo ""

# Store results
declare -a RESULTS
declare -a PROXY_IPS
declare -a FINAL_URLS

for i in $(seq 1 $NUM_TRACES); do
  GEO="${GEOS[$((i-1))]}"
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚀 TRACE #$i of $NUM_TRACES - Geo: $GEO - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Make the trace request
  RESULT=$(curl -s -X POST "${PROXY_SERVICE}/trace" \
    -H "Content-Type: application/json" \
    -d "{
      \"url\": \"$TRACKIER_URL\",
      \"mode\": \"browser\",
      \"target_country\": \"$GEO\",
      \"max_redirects\": 20,
      \"timeout_ms\": 60000
    }")
  
  # Extract key information
  PROXY_IP=$(echo "$RESULT" | jq -r '.proxy_ip // "N/A"')
  PROXY_LOCATION=$(echo "$RESULT" | jq -r '(.geo_location.city // "N/A") + ", " + (.geo_location.country // "N/A")')
  FINAL_URL=$(echo "$RESULT" | jq -r '.final_url // "N/A"')
  STEPS=$(echo "$RESULT" | jq -r '.total_steps // "N/A"')
  DURATION=$(echo "$RESULT" | jq -r '.total_timing_ms // "N/A"')
  
  # Store for later analysis
  PROXY_IPS+=("$PROXY_IP")
  FINAL_URLS+=("$FINAL_URL")
  
  echo "📊 Trace Stats:"
  echo "   • Proxy IP: $PROXY_IP"
  echo "   • Location: $PROXY_LOCATION"
  echo "   • Steps: $STEPS"
  echo "   • Duration: ${DURATION}ms"
  echo ""
  
  echo "🎯 Final URL:"
  echo "   $FINAL_URL"
  echo ""
  
  # Extract and show parameters
  echo "📋 Parameters extracted:"
  if [[ -n "$FINAL_URL" && "$FINAL_URL" != "N/A" && "$FINAL_URL" != "null" ]]; then
    # Check if parameters are filled (not {p1}, {p2}, etc.)
    GCLID=$(echo "$FINAL_URL" | grep -oP 'gclid=([^&]+)' | sed 's/gclid=//')
    FBCLID=$(echo "$FINAL_URL" | grep -oP 'fbclid=([^&]+)' | sed 's/fbclid=//')
    CLICKID=$(echo "$FINAL_URL" | grep -oP 'clickid=([^&]+)' | sed 's/clickid=//')
    UTM_SOURCE=$(echo "$FINAL_URL" | grep -oP 'utm_source=([^&]+)' | sed 's/utm_source=//')
    
    echo "   • gclid: ${GCLID:-NOT_FOUND}"
    echo "   • fbclid: ${FBCLID:-NOT_FOUND}"
    echo "   • clickid: ${CLICKID:-NOT_FOUND}"
    echo "   • utm_source: ${UTM_SOURCE:-NOT_FOUND}"
    
    # Check if parameters are filled or still placeholders
    if [[ "$GCLID" == *"{p1}"* ]] || [[ "$GCLID" == "%7Bp1%7D" ]]; then
      echo "   ⚠️  Parameters are PLACEHOLDERS (not filled)"
    elif [[ -n "$GCLID" && "$GCLID" != "NOT_FOUND" ]]; then
      echo "   ✅ Parameters are FILLED with actual values"
    else
      echo "   ❌ Parameters are MISSING"
    fi
  else
    echo "   ❌ Could not extract final URL"
  fi
  
  echo ""
  
  # Wait before next trace (except for last one)
  if [ $i -lt $NUM_TRACES ]; then
    echo "⏳ Waiting ${DELAY_SECONDS} seconds before next trace..."
    sleep $DELAY_SECONDS
    echo ""
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 ANALYSIS SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Analyze unique IPs
UNIQUE_IPS=$(printf '%s\n' "${PROXY_IPS[@]}" | sort -u | wc -l)
echo "🌐 Unique Proxy IPs used: $UNIQUE_IPS out of $NUM_TRACES traces"
printf '%s\n' "${PROXY_IPS[@]}" | sort -u | sed 's/^/   • /'
echo ""

# Analyze unique final URLs
UNIQUE_URLS=$(printf '%s\n' "${FINAL_URLS[@]}" | sort -u | wc -l)
echo "🔗 Unique Final URLs: $UNIQUE_URLS out of $NUM_TRACES traces"
echo ""

if [ "$UNIQUE_URLS" -eq 1 ]; then
  echo "⚠️  WARNING: All traces resulted in IDENTICAL final URLs"
  echo "   This suggests Trackier might be:"
  echo "   • Caching responses based on URL"
  echo "   • Not filling parameters dynamically"
  echo "   • Using the same sub_id for all requests"
elif [ "$UNIQUE_URLS" -eq "$NUM_TRACES" ]; then
  echo "✅ SUCCESS: All traces resulted in UNIQUE final URLs"
  echo "   This indicates Trackier is:"
  echo "   • Generating unique sub_id values per request"
  echo "   • Not caching responses"
  echo "   • Properly filling parameters dynamically"
else
  echo "🔸 MIXED: Got $UNIQUE_URLS unique URLs from $NUM_TRACES traces"
  echo "   Some URLs are duplicated, analyzing pattern..."
  echo ""
  echo "   URL frequency:"
  printf '%s\n' "${FINAL_URLS[@]}" | sort | uniq -c | sed 's/^/   /'
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
