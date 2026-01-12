#!/bin/bash

SSH_KEY="~/Downloads/suffix-server.pem"
SSH_USER="ec2-user"
INSTANCES=(
  "44.193.24.197"
  "3.215.185.91"
  "18.209.212.159"
)

for IP in "${INSTANCES[@]}"; do
  echo "Updating $IP..."
  
  # Backup
  ssh -i $SSH_KEY $SSH_USER@$IP "cp ~/server.js ~/server.js.backup"
  
  # Add the trackier-trace require line after trackier-webhook line
  # Using sed to insert a new line
  ssh -i $SSH_KEY $SSH_USER@$IP "sed -i \"/const trackierRoutes = require.*trackier-webhook/a const trackierTraceRoutes = require('./routes/trackier-trace');\" ~/server.js"
  
  # Add the trackier-trace route after the trackier-webhook route
  ssh -i $SSH_KEY $SSH_USER@$IP "sed -i \"/app.use.*trackierRoutes/a app.use('/api', trackierTraceRoutes);\" ~/server.js"
  
  # Verify the changes
  echo "Verification:"
  ssh -i $SSH_KEY $SSH_USER@$IP "grep -n 'trackier' ~/server.js | head -5"
  
  # Restart safely with pm2 restart all
  echo "Restarting service..."
  ssh -i $SSH_KEY $SSH_USER@$IP "pm2 restart all && sleep 3"
  
  # Check health
  echo "Health check:"
  ssh -i $SSH_KEY $SSH_USER@$IP "curl -s http://localhost:3000/health | jq .status"
  
  echo "✅ $IP done\n"
done

echo "🎉 All instances updated!"
