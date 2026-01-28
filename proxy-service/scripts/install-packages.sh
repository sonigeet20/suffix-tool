#!/bin/bash
# Install new npm packages on all EC2 instances

set -e

INSTANCES=(
  "ec2-user@13.222.100.70"
  "ec2-user@13.220.246.128"
  "ec2-user@52.54.72.188"
  "ec2-user@44.200.222.95"
  "ec2-user@100.53.41.66"
  "ec2-user@44.195.20.244"
)

PEM_KEY="$HOME/Downloads/suffix-server.pem"

echo "========================================="
echo "Installing npm packages on EC2 instances"
echo "========================================="
echo ""

for instance in "${INSTANCES[@]}"; do
  echo "========================================="
  echo "Installing on: $instance"
  echo "========================================="
  
  # Copy updated package.json
  echo "Copying package.json..."
  scp -i "$PEM_KEY" proxy-service/package.json "$instance:/home/ec2-user/proxy-service/" || {
    echo "ERROR: Failed to copy package.json to $instance"
    continue
  }
  
  # Install packages
  echo "Running npm install..."
  ssh -i "$PEM_KEY" "$instance" "cd /home/ec2-user/proxy-service && npm install" || {
    echo "ERROR: Failed to install packages on $instance"
    continue
  }
  
  echo "✓ Packages installed on $instance"
  echo ""
done

echo "========================================="
echo "Package Installation Complete!"
echo "========================================="
echo ""
echo "Installed packages:"
echo "  - isbot@5.1.0 (900+ bot detection patterns)"
echo "  - maxmind@4.3.22 (GeoIP2 database reader)"
echo ""
echo "Next step: Deploy GeoIP databases"
echo "  bash proxy-service/scripts/setup-geoip.sh"
echo ""
