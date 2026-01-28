#!/bin/bash
# Auto-update MaxMind GeoIP databases from Supabase settings
# Runs weekly via cron job on dedicated GeoIP instance
# Reads MAXMIND_LICENSE_KEY from Supabase settings table

set -e

# Configuration
SUPABASE_URL="${SUPABASE_URL:-https://rfhuqenntxiqurplenjn.supabase.co}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmaHVxZW5udHhpcXVycGxlbmpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2MTA0OCwiZXhwIjoyMDgxNTM3MDQ4fQ.KibxJ0nG3jIp4wZLpUj8ZGs9xcP5t8l9XkO3XGTMJwE}"
GEOIP_DIR="${GEOIP_DIR:-/home/ec2-user/geoip-service/geoip}"
LOG_FILE="${LOG_FILE:-/var/log/maxmind-update.log}"
BACKUP_DIR="${GEOIP_DIR}/backups"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo "================================"
  echo "MaxMind GeoIP Database Update"
  echo "Started: $(date)"
  echo "================================"
  
  # Step 1: Query Supabase for MaxMind license key
  echo ""
  echo "📡 Querying Supabase settings table for MaxMind license key..."
  
  LICENSE_KEY=$(curl -s \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    "$SUPABASE_URL/rest/v1/settings?select=maxmind_license_key&maxmind_license_key=not.is.null&limit=1" \
    | jq -r '.[0].maxmind_license_key // empty' 2>/dev/null || echo "")
  
  if [ -z "$LICENSE_KEY" ]; then
    echo "❌ ERROR: Could not retrieve MAXMIND_LICENSE_KEY from Supabase settings table"
    echo "   Make sure to set maxmind_license_key in the settings table first"
    echo "   Query URL: $SUPABASE_URL/rest/v1/settings?select=maxmind_license_key&maxmind_license_key=not.is.null&limit=1"
    exit 1
  fi
  
  echo "✅ License key retrieved from Supabase (${#LICENSE_KEY} chars)"
  
  # Step 2: Navigate to GeoIP directory
  echo ""
  echo "📁 Changing to GeoIP directory: $GEOIP_DIR"
  if [ ! -d "$GEOIP_DIR" ]; then
    echo "❌ ERROR: GeoIP directory not found: $GEOIP_DIR"
    exit 1
  fi
  
  cd "$GEOIP_DIR"
  
  # Step 3: Create backup directory and backup current databases
  echo ""
  echo "💾 Backing up current databases..."
  mkdir -p "$BACKUP_DIR"
  
  if [ -f "GeoLite2-City.mmdb" ]; then
    BACKUP_FILE="$BACKUP_DIR/GeoLite2-City.mmdb.$(date +%Y%m%d_%H%M%S).bak"
    cp "GeoLite2-City.mmdb" "$BACKUP_FILE"
    echo "   ✅ Backed up GeoLite2-City.mmdb to $BACKUP_FILE"
  fi
  
  if [ -f "GeoLite2-ASN.mmdb" ]; then
    BACKUP_FILE="$BACKUP_DIR/GeoLite2-ASN.mmdb.$(date +%Y%m%d_%H%M%S).bak"
    cp "GeoLite2-ASN.mmdb" "$BACKUP_FILE"
    echo "   ✅ Backed up GeoLite2-ASN.mmdb to $BACKUP_FILE"
  fi
  
  # Step 4: Download new databases
  echo ""
  echo "📥 Downloading MaxMind databases..."
  
  echo "   • Downloading GeoLite2-City..."
  if curl -sL \
    "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=$LICENSE_KEY&suffix=tar.gz" \
    -o GeoLite2-City.tar.gz; then
    echo "   ✅ GeoLite2-City downloaded"
  else
    echo "   ❌ Failed to download GeoLite2-City"
    exit 1
  fi
  
  echo "   • Downloading GeoLite2-ASN..."
  if curl -sL \
    "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$LICENSE_KEY&suffix=tar.gz" \
    -o GeoLite2-ASN.tar.gz; then
    echo "   ✅ GeoLite2-ASN downloaded"
  else
    echo "   ❌ Failed to download GeoLite2-ASN"
    exit 1
  fi
  
  # Step 5: Validate and extract databases
  echo ""
  echo "📦 Validating and extracting archives..."
  
  # Check if archives exist and are valid gzip
  if ! file GeoLite2-City.tar.gz | grep -q gzip; then
    echo "❌ ERROR: GeoLite2-City.tar.gz is not a valid gzip archive"
    exit 1
  fi
  
  if ! file GeoLite2-ASN.tar.gz | grep -q gzip; then
    echo "❌ ERROR: GeoLite2-ASN.tar.gz is not a valid gzip archive"
    exit 1
  fi
  
  echo "   • Extracting GeoLite2-City..."
  if tar -xzf GeoLite2-City.tar.gz --strip-components=1 --wildcards '*.mmdb'; then
    echo "   ✅ GeoLite2-City extracted"
  else
    echo "   ❌ Failed to extract GeoLite2-City"
    exit 1
  fi
  
  echo "   • Extracting GeoLite2-ASN..."
  if tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 --wildcards '*.mmdb'; then
    echo "   ✅ GeoLite2-ASN extracted"
  else
    echo "   ❌ Failed to extract GeoLite2-ASN"
    exit 1
  fi
  
  # Step 6: Verify new databases exist
  echo ""
  echo "✓ Verifying new databases..."
  
  if [ ! -f "GeoLite2-City.mmdb" ]; then
    echo "❌ ERROR: GeoLite2-City.mmdb not found after extraction"
    exit 1
  fi
  
  if [ ! -f "GeoLite2-ASN.mmdb" ]; then
    echo "❌ ERROR: GeoLite2-ASN.mmdb not found after extraction"
    exit 1
  fi
  
  ls -lh *.mmdb
  
  # Step 7: Cleanup archives
  echo ""
  echo "🧹 Cleaning up archive files..."
  rm -f GeoLite2-City.tar.gz GeoLite2-ASN.tar.gz
  echo "   ✅ Archives removed"
  
  # Step 8: Verify geoip-service auto-reload (no restart needed)
  echo ""
  echo "✅ MaxMind databases updated successfully!"
  echo "   Note: geoip-service will automatically reload databases on next request"
  
  # Step 9: Clean up old backups (keep last 4)
  echo ""
  echo "🧹 Cleaning up old backups (keeping last 4)..."
  ls -t "$BACKUP_DIR"/*.bak 2>/dev/null | tail -n +5 | xargs -r rm
  echo "   ✅ Old backups cleaned"
  
  echo ""
  echo "================================"
  echo "✅ Update completed successfully"
  echo "Finished: $(date)"
  echo "================================"
  
} | tee -a "$LOG_FILE"

exit 0
