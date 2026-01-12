#!/bin/bash

SSH_KEY="~/Downloads/suffix-server.pem"
SSH_USER="ec2-user"
INSTANCES=(
  "44.193.24.197"
  "3.215.185.91"
  "18.209.212.159"
)

echo "🚀 Deploying Trackier route files to EC2 instances..."

for IP in "${INSTANCES[@]}"; do
  echo ""
  echo "📡 Updating $IP..."
  
  # Upload trackier route files
  scp -i $SSH_KEY routes/trackier-trace.js $SSH_USER@$IP:/opt/url-tracker-proxy/routes/
  scp -i $SSH_KEY routes/trackier-polling.js $SSH_USER@$IP:/opt/url-tracker-proxy/routes/
  
  # Restart service
  ssh -i $SSH_KEY $SSH_USER@$IP "pm2 restart url-tracker-proxy"
  
  echo "✅ $IP updated"
done

echo ""
echo "🎉 All instances updated! Testing endpoint..."
sleep 3
curl -X POST http://url-tracker-proxy-alb-1426409269.us-east-1.elb.amazonaws.com/api/trackier-trace-once \
  -H "Content-Type: application/json" \
  -d '{"final_url":"https://www.elcorteingles.es/viajes/hoteles/","tracer_mode":"http_only","max_redirects":5,"timeout_ms":10000}' | head -100
