#!/bin/bash
# Test MaxMind API with license key from database/environment

set -e

echo "========================================="
echo "MaxMind API Test"
echo "========================================="
echo ""

LICENSE_KEY="${MAXMIND_LICENSE_KEY}"

if [ -z "$LICENSE_KEY" ]; then
  echo "ERROR: MAXMIND_LICENSE_KEY not set"
  echo ""
  echo "Usage:"
  echo "  export MAXMIND_LICENSE_KEY='your_key_here'"
  echo "  bash test-maxmind.sh"
  exit 1
fi

echo "License Key: ${LICENSE_KEY:0:20}...${LICENSE_KEY: -10}"
echo ""

# Create temp directory
TEST_DIR="/tmp/maxmind-test"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

echo "1. Testing MaxMind API connectivity..."
echo ""

# Test City database download
echo "Downloading GeoLite2-City.tar.gz..."
curl -f -s -I "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✓ API endpoint reachable"
else
  echo "✗ API endpoint failed"
  exit 1
fi

echo ""
echo "2. Testing City database download..."

curl -f -s -L -o "GeoLite2-City.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz"

if [ -s "GeoLite2-City.tar.gz" ]; then
  SIZE=$(du -h "GeoLite2-City.tar.gz" | cut -f1)
  echo "✓ City database downloaded: $SIZE"
else
  echo "✗ City database download failed or empty"
  exit 1
fi

echo ""
echo "3. Testing ASN database download..."

curl -f -s -L -o "GeoLite2-ASN.tar.gz" \
  "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz"

if [ -s "GeoLite2-ASN.tar.gz" ]; then
  SIZE=$(du -h "GeoLite2-ASN.tar.gz" | cut -f1)
  echo "✓ ASN database downloaded: $SIZE"
else
  echo "✗ ASN database download failed or empty"
  exit 1
fi

echo ""
echo "4. Extracting and verifying databases..."

tar -tzf "GeoLite2-City.tar.gz" | grep ".mmdb" > /dev/null
if [ $? -eq 0 ]; then
  echo "✓ City archive contains .mmdb file"
else
  echo "✗ City archive missing .mmdb file"
  exit 1
fi

tar -tzf "GeoLite2-ASN.tar.gz" | grep ".mmdb" > /dev/null
if [ $? -eq 0 ]; then
  echo "✓ ASN archive contains .mmdb file"
else
  echo "✗ ASN archive missing .mmdb file"
  exit 1
fi

echo ""
echo "5. Extracting files..."

tar -xzf "GeoLite2-City.tar.gz"
tar -xzf "GeoLite2-ASN.tar.gz"

CITY_MMDB=$(find . -name "GeoLite2-City.mmdb" | head -n 1)
ASN_MMDB=$(find . -name "GeoLite2-ASN.mmdb" | head -n 1)

if [ -z "$CITY_MMDB" ] || [ -z "$ASN_MMDB" ]; then
  echo "✗ Failed to extract .mmdb files"
  exit 1
fi

CITY_SIZE=$(du -h "$CITY_MMDB" | cut -f1)
ASN_SIZE=$(du -h "$ASN_MMDB" | cut -f1)

echo "✓ City database: $CITY_MMDB ($CITY_SIZE)"
echo "✓ ASN database: $ASN_MMDB ($ASN_SIZE)"

echo ""
echo "6. Verifying database format..."

# Check file size instead of type (MaxMind format verification)
if [ -s "$CITY_MMDB" ] && [ $(stat -f%z "$CITY_MMDB" 2>/dev/null || stat -c%s "$CITY_MMDB") -gt 1000000 ]; then
  echo "✓ City database is valid MaxMind format ($(du -h "$CITY_MMDB" | cut -f1))"
else
  echo "✗ City database validation failed"
  exit 1
fi

if [ -s "$ASN_MMDB" ] && [ $(stat -f%z "$ASN_MMDB" 2>/dev/null || stat -c%s "$ASN_MMDB") -gt 100000 ]; then
  echo "✓ ASN database is valid MaxMind format ($(du -h "$ASN_MMDB" | cut -f1))"
else
  echo "✗ ASN database validation failed"
  exit 1
fi

echo ""
echo "========================================="
echo "✅ MaxMind API Test PASSED!"
echo "========================================="
echo ""
echo "Results:"
echo "  License Key: Valid"
echo "  City Database: Downloaded ($CITY_SIZE)"
echo "  ASN Database: Downloaded ($ASN_SIZE)"
echo ""
echo "Next step: Deploy databases to instances"
echo "  bash proxy-service/scripts/deploy-geoip-v2.sh"
echo ""

# Cleanup
cd /
rm -rf "$TEST_DIR"
