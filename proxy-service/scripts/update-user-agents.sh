#!/bin/bash

# Weekly User-Agent Package Update Script
# Updates the user-agents npm package and restarts PM2

LOG_FILE="/home/ec2-user/proxy-service/logs/user-agent-updates.log"
SCRIPT_DIR="/home/ec2-user/proxy-service"

echo "=================================================" >> "$LOG_FILE"
echo "User-Agent Update Started: $(date)" >> "$LOG_FILE"
echo "=================================================" >> "$LOG_FILE"

cd "$SCRIPT_DIR" || exit 1

# Update user-agents package
echo "Updating user-agents package..." >> "$LOG_FILE"
npm update user-agents >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ user-agents package updated successfully" >> "$LOG_FILE"
    
    # Show new version
    NEW_VERSION=$(npm list user-agents --depth=0 | grep user-agents | awk '{print $2}')
    echo "New version: $NEW_VERSION" >> "$LOG_FILE"
    
    # Restart PM2
    echo "Restarting PM2 process..." >> "$LOG_FILE"
    pm2 restart proxy-server >> "$LOG_FILE" 2>&1
    
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
