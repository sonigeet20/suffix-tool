#!/bin/bash
# Setup GeoIP2 databases on EC2 instances
# Downloads GeoLite2-City and GeoLite2-ASN databases from MaxMind

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

echo "========================================="
echo "GeoIP2 Database Setup for EC2 Instances"
echo "========================================="
echo ""

# Check if MaxMind account key is provided
if [ -z "$MAXMIND_LICENSE_KEY" ]; then
  echo "ERROR: MAXMIND_LICENSE_KEY environment variable not set"
  echo ""
  echo "To get a license key:"
  echo "1. Sign up at https://www.maxmind.com/en/geolite2/signup"
  echo "2. Generate a license key"
  echo "3. Export it: export MAXMIND_LICENSE_KEY='your_key_here'"
  echo ""
  echo "Alternatively, download databases manually from:"
  echo "https://dev.maxmind.com/geoip/geolite2-free-geolocation-data"
  exit 1
fi

echo "Downloading GeoLite2 databases..."
GEOIP_DIR="/tmp/geoip-setup"
mkdir -p "$GEOIP_DIR"

# Download City database
echo "Downloading GeoLite2-City..."
curl -o "$GEOIP_DIR/GeoLite2-City.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz"

# Download ASN database
echo "Downloading GeoLite2-ASN..."
curl -o "$GEOIP_DIR/GeoLite2-ASN.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz"

# Extract databases
echo "Extracting databases..."
cd "$GEOIP_DIR"
tar -xzf GeoLite2-City.tar.gz
tar -xzf GeoLite2-ASN.tar.gz

# Find the .mmdb files
CITY_MMDB=$(find . -name "GeoLite2-City.mmdb" | head -n 1)
ASN_MMDB=$(find . -name "GeoLite2-ASN.mmdb" | head -n 1)

if [ -z "$CITY_MMDB" ] || [ -z "$ASN_MMDB" ]; then
  echo "ERROR: Failed to find .mmdb files after extraction"
  exit 1
fi

echo "Found databases:"
echo "  - $CITY_MMDB"
echo "  - $ASN_MMDB"
echo ""

# Deploy to each instance
for instance in "${INSTANCES[@]}"; do
  echo "========================================="
  echo "Deploying to: $instance"
  echo "========================================="
  
  # Create geoip directory
  ssh -i "$PEM_KEY" "$instance" "mkdir -p /home/ec2-user/proxy-service/geoip" || {
    echo "ERROR: Failed to create geoip directory on $instance"
    continue
  }
  
  # Copy City database
  echo "Copying GeoLite2-City.mmdb..."
  scp -i "$PEM_KEY" "$CITY_MMDB" "$instance:/home/ec2-user/proxy-service/geoip/GeoLite2-City.mmdb" || {
    echo "ERROR: Failed to copy City database to $instance"
    continue
  }
  
  # Copy ASN database
  echo "Copying GeoLite2-ASN.mmdb..."
  scp -i "$PEM_KEY" "$ASN_MMDB" "$instance:/home/ec2-user/proxy-service/geoip/GeoLite2-ASN.mmdb" || {
    echo "ERROR: Failed to copy ASN database to $instance"
    continue
  }
  
  # Set permissions
  ssh -i "$PEM_KEY" "$instance" "chmod 644 /home/ec2-user/proxy-service/geoip/*.mmdb" || {
    echo "WARNING: Failed to set permissions on $instance"
  }
  
  # Verify files
  ssh -i "$PEM_KEY" "$instance" "ls -lh /home/ec2-user/proxy-service/geoip/" || {
    echo "WARNING: Failed to verify files on $instance"
  }
  
  echo "✓ GeoIP databases deployed to $instance"
  echo ""
done

# Cleanup
echo "Cleaning up temporary files..."
rm -rf "$GEOIP_DIR"

echo "========================================="
echo "GeoIP2 Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Install npm packages on all instances:"
echo "   bash proxy-service/scripts/install-packages.sh"
echo ""
echo "2. Deploy updated google-ads-click.js:"
echo "   bash proxy-service/scripts/deploy-google-ads.sh"
echo ""
echo "3. Restart PM2 on all instances to load new libraries"
echo ""
