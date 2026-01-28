#!/bin/bash
# Deploy GeoIP Service to dedicated instance

set -e

GEOIP_INSTANCE="${GEOIP_INSTANCE_IP:-35.168.58.71}"  # Dedicated GeoIP instance
PEM_KEY="$HOME/Downloads/suffix-server.pem"

if [ -z "$MAXMIND_LICENSE_KEY" ]; then
  echo "ERROR: MAXMIND_LICENSE_KEY environment variable not set"
  exit 1
fi

echo "========================================="
echo "Deploying GeoIP Service"
echo "========================================="
echo "Instance: $GEOIP_INSTANCE"
echo ""

# Copy service file
echo "Uploading geoip-service.js..."
ssh -i "$PEM_KEY" "ec2-user@$GEOIP_INSTANCE" "mkdir -p /home/ec2-user/geoip-service"
scp -i "$PEM_KEY" geoip-service.js "ec2-user@$GEOIP_INSTANCE:/home/ec2-user/geoip-service/"

# Copy setup script
echo "Uploading setup script..."
scp -i "$PEM_KEY" scripts/setup-geoip-service.sh "ec2-user@$GEOIP_INSTANCE:/home/ec2-user/geoip-service/"

# Run setup
echo "Downloading MaxMind databases (this may take a few minutes)..."
ssh -i "$PEM_KEY" -e "ec2-user@$GEOIP_INSTANCE" \
  "export MAXMIND_LICENSE_KEY='$MAXMIND_LICENSE_KEY' && bash /home/ec2-user/geoip-service/setup-geoip-service.sh"

# Start service
echo ""
echo "Starting GeoIP service..."
ssh -i "$PEM_KEY" "ec2-user@$GEOIP_INSTANCE" \
  "cd /home/ec2-user/geoip-service && npm install 2>/dev/null; pm2 start geoip-service.js --name geoip; pm2 save"

sleep 2

# Health check
echo ""
echo "Health check..."
HEALTH=$(ssh -i "$PEM_KEY" "ec2-user@$GEOIP_INSTANCE" \
  "curl -s http://localhost:3001/health" || echo "failed")

if echo "$HEALTH" | grep -q "healthy"; then
  echo "✓ GeoIP service is healthy"
else
  echo "✗ Health check failed: $HEALTH"
fi

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "GeoIP Service Details:"
echo "  Instance: $GEOIP_INSTANCE"
echo "  Port: 3001"
echo "  API: http://$GEOIP_INSTANCE:3001"
echo ""
echo "Endpoints:"
echo "  GET  /health          - Health check"
echo "  GET  /geoip/:ip       - Query single IP"
echo "  POST /geoip/batch     - Query multiple IPs"
echo ""
echo "Test:"
echo "  curl http://$GEOIP_INSTANCE:3001/geoip/8.8.8.8"
echo ""
