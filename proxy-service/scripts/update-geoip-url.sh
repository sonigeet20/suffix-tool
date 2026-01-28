#!/bin/bash
# Update all proxy instances to use dedicated GeoIP service

set -e

PEM_KEY="${PEM_KEY:-$HOME/Downloads/suffix-server.pem}"
GEOIP_SERVICE_URL="${GEOIP_SERVICE_URL}"

if [ -z "$GEOIP_SERVICE_URL" ]; then
  echo "ERROR: GEOIP_SERVICE_URL not set"
  echo "Usage: export GEOIP_SERVICE_URL=http://<geoip-instance-ip>:3000"
  echo "       bash $0"
  exit 1
fi

# List of proxy instances
PROXY_INSTANCES=(
  "13.222.100.70"
  "44.215.112.238"
  "100.29.190.60"
  "44.200.222.95"
  "100.53.41.66"
  "3.239.71.2"
)

echo "========================================"
echo "Updating Proxy Instances"
echo "GeoIP Service: $GEOIP_SERVICE_URL"
echo "========================================"

for ip in "${PROXY_INSTANCES[@]}"; do
  echo ""
  echo "Updating $ip..."
  
  # Update .env file
  ssh -i "$PEM_KEY" ec2-user@$ip << EOF
    cd /home/ec2-user/proxy-service
    
    # Add or update GEOIP_SERVICE_URL in .env
    if grep -q "GEOIP_SERVICE_URL" .env 2>/dev/null; then
      sed -i "s|GEOIP_SERVICE_URL=.*|GEOIP_SERVICE_URL=$GEOIP_SERVICE_URL|" .env
    else
      echo "GEOIP_SERVICE_URL=$GEOIP_SERVICE_URL" >> .env
    fi
    
    # Restart PM2 to pick up new env var
    pm2 restart all
    
    echo "✓ Updated and restarted"
EOF

  if [ $? -eq 0 ]; then
    echo "✅ $ip updated successfully"
  else
    echo "❌ $ip update failed"
  fi
done

echo ""
echo "========================================"
echo "✓ All Instances Updated"
echo "========================================"
echo ""
echo "Verify with:"
echo "  for ip in ${PROXY_INSTANCES[@]}; do"
echo "    echo \"Testing \$ip...\""
echo "    curl -s \"http://\$ip:3000/click/health\" | jq '.'"
echo "  done"
echo ""
