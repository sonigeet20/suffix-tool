#!/bin/bash
# Auto Scaling Launch Template User Data
# Starts proxy service and installs weekly user-agent update timer

# Wait for system to be ready
sleep 10

# Ensure directories exist
mkdir -p /home/ec2-user/proxy-service/logs
mkdir -p /home/ec2-user/proxy-service/scripts

# Create update script
cat > /home/ec2-user/proxy-service/scripts/update-user-agents.sh << 'SCRIPT_EOF'
#!/bin/bash

LOG_FILE="/home/ec2-user/proxy-service/logs/user-agent-updates.log"
SCRIPT_DIR="/home/ec2-user/proxy-service"

echo "=================================================" >> "$LOG_FILE"
echo "User-Agent Update Started: $(date)" >> "$LOG_FILE"
echo "=================================================" >> "$LOG_FILE"

cd "$SCRIPT_DIR" || exit 1

echo "Updating user-agents package..." >> "$LOG_FILE"
npm update user-agents >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ user-agents package updated successfully" >> "$LOG_FILE"
    NEW_VERSION=$(npm list user-agents --depth=0 | grep user-agents | awk '{print $2}')
    echo "New version: $NEW_VERSION" >> "$LOG_FILE"
    
    echo "Restarting PM2 process..." >> "$LOG_FILE"
    sudo -u ec2-user pm2 restart proxy-server >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ PM2 restarted successfully" >> "$LOG_FILE"
    else
        echo "❌ Failed to restart PM2" >> "$LOG_FILE"
    fi
else
    echo "❌ Failed to update user-agents package" >> "$LOG_FILE"
fi

echo "Update completed: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
SCRIPT_EOF

chmod +x /home/ec2-user/proxy-service/scripts/update-user-agents.sh

# Create systemd service
cat > /etc/systemd/system/user-agent-update.service << 'SERVICE_EOF'
[Unit]
Description=Weekly User-Agent Package Update
After=network.target

[Service]
Type=oneshot
User=ec2-user
WorkingDirectory=/home/ec2-user/proxy-service
ExecStart=/home/ec2-user/proxy-service/scripts/update-user-agents.sh
StandardOutput=append:/home/ec2-user/proxy-service/logs/user-agent-updates.log
StandardError=append:/home/ec2-user/proxy-service/logs/user-agent-updates.log
SERVICE_EOF

# Create systemd timer
cat > /etc/systemd/system/user-agent-update.timer << 'TIMER_EOF'
[Unit]
Description=Weekly User-Agent Package Update Timer
Requires=user-agent-update.service

[Timer]
OnCalendar=Sun *-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
TIMER_EOF

# Enable and start timer
systemctl daemon-reload
systemctl enable user-agent-update.timer
systemctl start user-agent-update.timer

# Start PM2 proxy service
cd /home/ec2-user/proxy-service
sudo -u ec2-user pm2 start server.js --name proxy-server
sudo -u ec2-user pm2 save
sudo env PATH=$PATH:/home/ec2-user/.nvm/versions/node/v18.20.5/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Log completion
echo "Instance startup completed at $(date)" >> /home/ec2-user/proxy-service/logs/startup.log
