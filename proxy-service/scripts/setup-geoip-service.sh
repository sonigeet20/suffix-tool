#!/bin/bash
# Setup GeoIP Service instance
# Downloads MaxMind databases and starts the GeoIP service

set -e

echo "========================================="
echo "GeoIP Service Setup"
echo "========================================="
echo ""

# Check MaxMind license key
if [ -z "$MAXMIND_LICENSE_KEY" ]; then
  echo "ERROR: MAXMIND_LICENSE_KEY environment variable not set"
  exit 1
fi

# Create directories
mkdir -p /home/ec2-user/geoip-service/geoip

# Download databases
echo "Downloading GeoIP databases..."
cd /home/ec2-user/geoip-service/geoip

curl -L -o GeoLite2-City.tar.gz \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"

curl -L -o GeoLite2-ASN.tar.gz \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"

# Extract
echo "Extracting databases..."
tar -xzf GeoLite2-City.tar.gz
tar -xzf GeoLite2-ASN.tar.gz

# Find and move databases
CITY_MMDB=$(find . -name "GeoLite2-City.mmdb" -type f | head -1)
ASN_MMDB=$(find . -name "GeoLite2-ASN.mmdb" -type f | head -1)

if [ -z "$CITY_MMDB" ] || [ -z "$ASN_MMDB" ]; then
  echo "ERROR: Failed to extract databases"
  exit 1
fi

# Move to root of geoip directory
mv "$CITY_MMDB" ./GeoLite2-City.mmdb
mv "$ASN_MMDB" ./GeoLite2-ASN.mmdb

# Cleanup
rm -f *.tar.gz
rm -rf GeoLite2-*

echo "✓ Databases ready"
ls -lh *.mmdb

# Setup service files if not present
if [ ! -f /home/ec2-user/geoip-service/geoip-service.js ]; then
  echo ""
  echo "Please copy geoip-service.js to /home/ec2-user/geoip-service/"
fi

echo ""
echo "========================================="
echo "Setup complete!"
echo "========================================="
echo ""
echo "Start the service:"
echo "  cd /home/ec2-user/geoip-service"
echo "  node geoip-service.js"
echo ""
echo "Or use PM2:"
echo "  pm2 start geoip-service.js --name geoip"
echo "  pm2 save"
echo ""
