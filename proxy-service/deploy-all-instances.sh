#!/bin/bash
#
# Deploy SOCKS5 Update to All Proxy Instances
# Deploys sequentially with validation
#

set -e

KEY_FILE=~/Downloads/suffix-server.pem
SSH_USER=ec2-user
DEPLOY_SCRIPT="./deploy-socks5-update.sh"

# Get all running proxy instances
INSTANCES=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=url-tracker-proxy-instance" "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId,PublicIpAddress]' \
  --output text)

if [ -z "$INSTANCES" ]; then
  echo "❌ No running instances found"
  exit 1
fi

# Count instances
TOTAL=$(echo "$INSTANCES" | wc -l | tr -d ' ')
echo "🚀 Found $TOTAL instances to update"
echo "================================================"
echo ""

# Deploy to each instance
CURRENT=0
FAILED=()
SUCCEEDED=()

while read -r INSTANCE_ID IP; do
  CURRENT=$((CURRENT + 1))
  echo "[$CURRENT/$TOTAL] Deploying to $INSTANCE_ID ($IP)..."
  
  if $DEPLOY_SCRIPT "$IP" > "/tmp/deploy-${INSTANCE_ID}.log" 2>&1; then
    echo "  ✅ Success"
    SUCCEEDED+=("$INSTANCE_ID $IP")
  else
    echo "  ❌ Failed (see /tmp/deploy-${INSTANCE_ID}.log)"
    FAILED+=("$INSTANCE_ID $IP")
  fi
  
  echo ""
  sleep 2
done <<< "$INSTANCES"

# Summary
echo "================================================"
echo "📊 Deployment Summary"
echo "================================================"
echo "Total: $TOTAL"
echo "✅ Succeeded: ${#SUCCEEDED[@]}"
echo "❌ Failed: ${#FAILED[@]}"

if [ ${#SUCCEEDED[@]} -gt 0 ]; then
  echo ""
  echo "Successful deployments:"
  for item in "${SUCCEEDED[@]}"; do
    echo "  ✅ $item"
  done
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "Failed deployments:"
  for item in "${FAILED[@]}"; do
    echo "  ❌ $item"
  done
  exit 1
fi

echo ""
echo "✅ All instances updated successfully!"
