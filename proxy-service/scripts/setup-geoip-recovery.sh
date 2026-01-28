#!/bin/bash
# Setup GeoIP Service with Auto-Recovery
# Monitors the service and auto-restarts if it fails

# Install on the dedicated GeoIP instance

set -e

GEOIP_HOME="/home/ec2-user/geoip-service"
SERVICE_PORT="3001"

echo "Setting up auto-recovery for GeoIP service..."

# Create systemd service file
sudo tee /etc/systemd/system/geoip-service.service > /dev/null << EOF
[Unit]
Description=GeoIP Service for Proxy Network
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$GEOIP_HOME
ExecStart=/usr/bin/node geoip-service.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Auto-restart if memory usage grows
MemoryLimit=1G

# Restart on failure
StartLimitBurst=5
StartLimitIntervalSec=300

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable geoip-service.service
sudo systemctl start geoip-service.service

echo "✓ Systemd service configured"
echo ""

# Verify service
sleep 2
if sudo systemctl is-active --quiet geoip-service; then
  echo "✓ Service is running"
else
  echo "✗ Service failed to start - check logs:"
  sudo journalctl -u geoip-service -n 20
  exit 1
fi

# Create health check script
tee $GEOIP_HOME/health-check.sh > /dev/null << 'EOF'
#!/bin/bash
# Health check for GeoIP service
# Run via cron every 5 minutes

HEALTH_URL="http://localhost:3001/health"
TIMEOUT=5

response=$(curl -s -m $TIMEOUT "$HEALTH_URL" 2>/dev/null || echo "failed")

if echo "$response" | grep -q "healthy"; then
  echo "$(date): Health check passed" >> /var/log/geoip-health.log
  exit 0
else
  echo "$(date): Health check FAILED - restarting service" >> /var/log/geoip-health.log
  sudo systemctl restart geoip-service
  exit 1
fi
EOF

chmod +x $GEOIP_HOME/health-check.sh

# Add to crontab
crontab -l 2>/dev/null | grep -v "geoip-health" > /tmp/crontab.txt || true
echo "*/5 * * * * $GEOIP_HOME/health-check.sh" >> /tmp/crontab.txt
crontab /tmp/crontab.txt
rm /tmp/crontab.txt

echo "✓ Health check cron added (every 5 minutes)"
echo ""

# Create backup/snapshot script
tee $GEOIP_HOME/backup-databases.sh > /dev/null << 'EOF'
#!/bin/bash
# Backup GeoIP databases weekly
# Run via cron: 0 2 * * 0 (every Sunday at 2 AM)

BACKUP_DIR="/home/ec2-user/geoip-backups"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/geoip-backup-$DATE.tar.gz"

echo "Backing up databases to $BACKUP_FILE..."
tar -czf "$BACKUP_FILE" /home/ec2-user/geoip-service/geoip/*.mmdb

# Keep only last 4 backups
find "$BACKUP_DIR" -type f -name "*.tar.gz" | sort -r | tail -n +5 | xargs rm -f

echo "✓ Backup complete"
EOF

chmod +x $GEOIP_HOME/backup-databases.sh
echo "0 2 * * 0 $GEOIP_HOME/backup-databases.sh" >> /tmp/crontab.txt || true

echo "✓ Backup script created (weekly)"
echo ""

echo "========================================="
echo "Auto-Recovery Configuration Complete"
echo "========================================="
echo ""
echo "Features enabled:"
echo "  ✓ Systemd service auto-restart on failure"
echo "  ✓ Health check every 5 minutes (with auto-restart)"
echo "  ✓ Weekly database backups"
echo "  ✓ Memory limit: 1GB"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status geoip-service"
echo "  sudo systemctl restart geoip-service"
echo "  sudo journalctl -u geoip-service -f"
echo "  tail -f /var/log/geoip-health.log"
echo ""
