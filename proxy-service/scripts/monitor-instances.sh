#!/bin/bash

# INSTANCE HEALTH MONITOR
# Purpose: Check all instances for issues, generate report, alert on problems
# Run periodically via cron: 0 * * * * bash /path/to/monitor-instances.sh

LOG_FILE="/tmp/instance-monitor-$(date +%Y%m%d-%H%M%S).log"
ALERT_THRESHOLD_RESTART=5
ALERT_THRESHOLD_MEMORY=300
ALERT_THRESHOLD_CPU=50

IPS=("44.204.210.2" "52.3.233.20" "3.231.164.129" "44.203.236.99" "100.52.208.162" "98.81.72.140")
SSH_KEY="~/Downloads/suffix-server.pem"
SSH_USER="ec2-user"

echo "📊 INSTANCE HEALTH MONITOR - $(date)" | tee -a $LOG_FILE
echo "================================================" | tee -a $LOG_FILE

ALERTS=0

for ip in "${IPS[@]}"; do
  echo "" | tee -a $LOG_FILE
  echo "🔍 Checking $ip..." | tee -a $LOG_FILE
  
  # Get PM2 status
  status=$(ssh -i $SSH_KEY $SSH_USER@$ip "pm2 status 2>/dev/null" 2>&1)
  
  # Check process count
  process_count=$(echo "$status" | grep "proxy-service" | wc -l)
  if [ "$process_count" -ne 1 ]; then
    echo "   ❌ ALERT: Expected 1 process, found $process_count" | tee -a $LOG_FILE
    ALERTS=$((ALERTS+1))
  else
    echo "   ✅ Process count: OK (1 process)" | tee -a $LOG_FILE
  fi
  
  # Check restart count
  restart_count=$(echo "$status" | grep "proxy-service" | awk '{print $8}' | tr -d '↺' | head -1)
  if [ ! -z "$restart_count" ] && [ "$restart_count" -gt "$ALERT_THRESHOLD_RESTART" ]; then
    echo "   ❌ ALERT: Restart count ($restart_count) exceeds threshold ($ALERT_THRESHOLD_RESTART)" | tee -a $LOG_FILE
    ALERTS=$((ALERTS+1))
  else
    echo "   ✅ Restart count: $restart_count" | tee -a $LOG_FILE
  fi
  
  # Check process status
  if echo "$status" | grep -q "proxy-service.*online"; then
    echo "   ✅ Status: online" | tee -a $LOG_FILE
  else
    echo "   ❌ ALERT: Process not online" | tee -a $LOG_FILE
    ALERTS=$((ALERTS+1))
  fi
  
  # Check memory usage
  memory=$(echo "$status" | grep "proxy-service" | awk '{print $(NF-2)}' | sed 's/mb//' | head -1)
  if [ ! -z "$memory" ]; then
    if (( $(echo "$memory > $ALERT_THRESHOLD_MEMORY" | bc -l) )); then
      echo "   ❌ ALERT: Memory ($memory MB) exceeds threshold ($ALERT_THRESHOLD_MEMORY MB)" | tee -a $LOG_FILE
      ALERTS=$((ALERTS+1))
    else
      echo "   ✅ Memory: ${memory}MB" | tee -a $LOG_FILE
    fi
  fi
  
  # Check CPU usage
  cpu=$(echo "$status" | grep "proxy-service" | awk '{print $(NF-3)}' | sed 's/%//' | head -1)
  if [ ! -z "$cpu" ]; then
    if (( $(echo "$cpu > $ALERT_THRESHOLD_CPU" | bc -l) )); then
      echo "   ❌ ALERT: CPU ($cpu%) exceeds threshold ($ALERT_THRESHOLD_CPU%)" | tee -a $LOG_FILE
      ALERTS=$((ALERTS+1))
    else
      echo "   ✅ CPU: ${cpu}%" | tee -a $LOG_FILE
    fi
  fi
  
  # Check API response
  api_status=$(ssh -i $SSH_KEY $SSH_USER@$ip "curl -s http://localhost:3000/api/trackier-status 2>/dev/null | jq .enabled 2>/dev/null" 2>&1)
  if [ ! -z "$api_status" ]; then
    echo "   ✅ API: responding" | tee -a $LOG_FILE
  else
    echo "   ❌ ALERT: API not responding" | tee -a $LOG_FILE
    ALERTS=$((ALERTS+1))
  fi
done

echo "" | tee -a $LOG_FILE
echo "================================================" | tee -a $LOG_FILE
echo "📋 SUMMARY" | tee -a $LOG_FILE
echo "   Total instances checked: ${#IPS[@]}" | tee -a $LOG_FILE
echo "   Total alerts: $ALERTS" | tee -a $LOG_FILE

if [ $ALERTS -eq 0 ]; then
  echo "   Status: ✅ ALL HEALTHY" | tee -a $LOG_FILE
  exit 0
else
  echo "   Status: ⚠️ ISSUES DETECTED - See details above" | tee -a $LOG_FILE
  exit 1
fi
