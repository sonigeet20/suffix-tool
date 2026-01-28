#!/bin/bash
# Deploy GeoIP2 databases using MaxMind license key from database

set -e

INSTANCES=(
  "ec2-user@13.222.100.70"
  "ec2-user@13.220.246.128"
  "ec2-user@52.54.72.188"
  "ec2-user@44.200.222.95"
  "ec2-user@100.53.41.66"
  "ec2-user@44.195.20.244"
)

PEM_KEY="$HOME/Downloads/suffix-server.pem"

# Try to get license key from environment variable first
LICENSE_KEY="${MAXMIND_LICENSE_KEY}"

# If not set, try to read from database
if [ -z "$LICENSE_KEY" ]; then
  echo "MAXMIND_LICENSE_KEY not in environment, reading from database..."
  # Note: This requires psql/supabase CLI to be configured
  # For now, show instructions to user
  echo ""
  echo "ERROR: License key not provided"
  echo ""
  echo "Option 1: Set environment variable:"
  echo "  export MAXMIND_LICENSE_KEY='your_key_here'"
  echo "  bash proxy-service/scripts/deploy-geoip-v2.sh"
  echo ""
  echo "Option 2: Add key in Settings view from frontend"
  echo "  Then re-run this script"
  echo ""
  echo "Get free key at: https://www.maxmind.com/en/geolite2/signup"
  exit 1
fi

echo "========================================="
echo "GeoIP2 Database Deployment"
echo "========================================="
echo ""

GEOIP_DIR="/tmp/geoip-setup"
mkdir -p "$GEOIP_DIR"
cd "$GEOIP_DIR"

echo "Downloading databases with license key..."

# Download directly with proper headers and follow redirects
wget -q --timeout=30 -O "GeoLite2-City.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz" || \
  curl -s -L -o "GeoLite2-City.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz"

wget -q --timeout=30 -O "GeoLite2-ASN.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz" || \
  curl -s -L -o "GeoLite2-ASN.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz"

# Check if downloads succeeded
if [ ! -s "GeoLite2-City.tar.gz" ] || [ ! -s "GeoLite2-ASN.tar.gz" ]; then
  echo "ERROR: Download failed. Files are empty."
  echo "Checking file sizes..."
  ls -lh *.tar.gz
  
  echo ""
  echo "Possible issues:"
  echo "1. License key invalid or expired"
  echo "2. Network connectivity issue"
  echo "3. MaxMind API temporarily unavailable"
  echo ""
  echo "Manual download: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data"
  exit 1
fi

echo "Downloaded:"
ls -lh *.tar.gz

echo ""
echo "Extracting databases..."
tar -xzf GeoLite2-City.tar.gz
tar -xzf GeoLite2-ASN.tar.gz

CITY_MMDB=$(find . -name "GeoLite2-City.mmdb" | head -n 1)
ASN_MMDB=$(find . -name "GeoLite2-ASN.mmdb" | head -n 1)

if [ -z "$CITY_MMDB" ] || [ -z "$ASN_MMDB" ]; then
  echo "ERROR: .mmdb files not found after extraction"
  exit 1
fi

echo "Found databases:"
echo "  - $CITY_MMDB"
echo "  - $ASN_MMDB"
echo ""

# Deploy to instances
for instance in "${INSTANCES[@]}"; do
  echo "========================================="
  echo "Deploying to: $instance"
  echo "========================================="
  
  ssh -i "$PEM_KEY" "$instance" "mkdir -p /home/ec2-user/proxy-service/geoip"
  
  scp -i "$PEM_KEY" "$CITY_MMDB" "$instance:/home/ec2-user/proxy-service/geoip/GeoLite2-City.mmdb"
  scp -i "$PEM_KEY" "$ASN_MMDB" "$instance:/home/ec2-user/proxy-service/geoip/GeoLite2-ASN.mmdb"
  
  ssh -i "$PEM_KEY" "$instance" "chmod 644 /home/ec2-user/proxy-service/geoip/*.mmdb"
  ssh -i "$PEM_KEY" "$instance" "ls -lh /home/ec2-user/proxy-service/geoip/"
  
  echo "✓ Deployed to $instance"
  echo ""
done

rm -rf "$GEOIP_DIR"

echo "========================================="
echo "✓ GeoIP2 Deployment Complete!"
echo "========================================="
echo ""
echo "Restart services to load databases:"
echo "  bash proxy-service/scripts/deploy-google-ads.sh"
echo ""
