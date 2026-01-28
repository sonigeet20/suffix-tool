#!/bin/bash
# Deploy GeoIP Service to Dedicated EC2 Instance (Port 3000)
# Outside ASG, same security group

set -e

# Configuration
PEM_KEY="${PEM_KEY:-$HOME/Downloads/suffix-server.pem}"
MAXMIND_LICENSE_KEY="${MAXMIND_LICENSE_KEY}"
GEOIP_INSTANCE="${GEOIP_INSTANCE}"

if [ -z "$GEOIP_INSTANCE" ]; then
  echo "ERROR: GEOIP_INSTANCE not set"
  echo "Usage: export GEOIP_INSTANCE=<ip_address>"
  echo "       export MAXMIND_LICENSE_KEY=<your_key>"
  echo "       bash $0"
  exit 1
fi

if [ -z "$MAXMIND_LICENSE_KEY" ]; then
  echo "ERROR: MAXMIND_LICENSE_KEY not set"
  echo "Get key from: https://www.maxmind.com/en/geolite2/signup"
  exit 1
fi

echo "========================================"
echo "Deploying GeoIP Service (Dedicated)"
echo "Instance: $GEOIP_INSTANCE"
echo "Port: 3000"
echo "========================================"

# Step 1: Create directory structure
echo "1. Creating directory structure..."
ssh -i "$PEM_KEY" ec2-user@$GEOIP_INSTANCE "mkdir -p /home/ec2-user/geoip-service/geoip"

# Step 2: Upload geoip-service.js
echo "2. Uploading geoip-service.js..."
scp -i "$PEM_KEY" proxy-service/geoip-service.js ec2-user@$GEOIP_INSTANCE:/home/ec2-user/geoip-service/

# Step 3: Install dependencies
echo "3. Installing npm packages..."
ssh -i "$PEM_KEY" ec2-user@$GEOIP_INSTANCE << 'EOF'
cd /home/ec2-user/geoip-service
npm init -y 2>/dev/null || true
npm install express maxmind --save 2>/dev/null
echo "✓ Dependencies installed"
EOF

# Step 4: Download MaxMind databases
echo "4. Downloading MaxMind GeoLite2 databases..."
ssh -i "$PEM_KEY" ec2-user@$GEOIP_INSTANCE << EOF
cd /home/ec2-user/geoip-service/geoip

# Download GeoLite2-City
echo "  Downloading GeoLite2-City..."
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz" -o GeoLite2-City.tar.gz

# Download GeoLite2-ASN
echo "  Downloading GeoLite2-ASN..."
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz" -o GeoLite2-ASN.tar.gz

# Extract databases
echo "  Extracting databases..."
tar -xzf GeoLite2-City.tar.gz --strip-components=1 --wildcards '*.mmdb'
tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 --wildcards '*.mmdb'

# Cleanup
rm -f *.tar.gz

# Verify
if [ -f GeoLite2-City.mmdb ] && [ -f GeoLite2-ASN.mmdb ]; then
  echo "✓ Databases downloaded and extracted"
  ls -lh *.mmdb
else
  echo "✗ Database download failed"
  exit 1
fi
EOF

# Step 5: Create systemd service for auto-recovery
echo "5. Setting up systemd service..."
ssh -i "$PEM_KEY" ec2-user@$GEOIP_INSTANCE << 'EOF'
sudo tee /etc/systemd/system/geoip.service > /dev/null << 'SERVICE'
[Unit]
Description=GeoIP Service for Proxy Network
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=ec2-user
WorkingDirectory=/home/ec2-user/geoip-service
Environment="GEOIP_PORT=3000"
ExecStart=/usr/bin/node geoip-service.js
StandardOutput=journal
StandardError=journal
SyslogIdentifier=geoip

[Install]
WantedBy=multi-user.target
SERVICE

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable geoip.service
sudo systemctl restart geoip.service

echo "✓ Systemd service created and started"
EOF

# Step 6: Verify service is running
echo "6. Verifying service..."
sleep 3

HEALTH_CHECK=$(ssh -i "$PEM_KEY" ec2-user@$GEOIP_INSTANCE "curl -s http://localhost:3000/health || echo 'FAILED'")

if echo "$HEALTH_CHECK" | grep -q '"status":"healthy"'; then
  echo "✓ GeoIP service is healthy"
else
  echo "✗ Health check failed"
  echo "Response: $HEALTH_CHECK"
  echo ""
  echo "Check logs with:"
  echo "  ssh -i $PEM_KEY ec2-user@$GEOIP_INSTANCE 'sudo journalctl -u geoip -n 50'"
  exit 1
fi

# Step 7: Test IP lookup
echo "7. Testing IP lookup..."
TEST_RESULT=$(ssh -i "$PEM_KEY" ec2-user@$GEOIP_INSTANCE "curl -s http://localhost:3000/geoip/8.8.8.8")
echo "$TEST_RESULT" | jq '.'

echo ""
echo "========================================"
echo "✓ GeoIP Service Deployed Successfully!"
echo "========================================"
echo ""
echo "Service Details:"
echo "  Instance: $GEOIP_INSTANCE"
echo "  Port: 3000"
echo "  URL: http://$GEOIP_INSTANCE:3000"
echo ""
echo "Test it:"
echo "  curl http://$GEOIP_INSTANCE:3000/health"
echo "  curl http://$GEOIP_INSTANCE:3000/geoip/8.8.8.8"
echo ""
echo "Check status:"
echo "  ssh -i $PEM_KEY ec2-user@$GEOIP_INSTANCE 'sudo systemctl status geoip'"
echo ""
echo "View logs:"
echo "  ssh -i $PEM_KEY ec2-user@$GEOIP_INSTANCE 'sudo journalctl -u geoip -f'"
echo ""
echo "NEXT STEP: Update all proxy instances with:"
echo "  export GEOIP_SERVICE_URL=\"http://$GEOIP_INSTANCE:3000\""
echo ""
