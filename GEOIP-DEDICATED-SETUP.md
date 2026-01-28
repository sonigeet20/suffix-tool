# Deploy Dedicated GeoIP Service Instance

## Quick Setup Guide

### Step 1: Launch EC2 Instance (AWS Console or CLI)

**Option A: AWS Console**
1. Go to EC2 → Launch Instance
2. **Name:** `geoip-service-dedicated`
3. **AMI:** Amazon Linux 2023
4. **Instance Type:** t3.small (2 vCPU, 2GB RAM)
5. **Key Pair:** Use existing `suffix-server.pem`
6. **Network Settings:**
   - VPC: Same as proxy instances
   - Subnet: Any subnet (preferably same AZ)
   - **Security Group:** Use existing proxy security group (or create new with same rules)
     - Allow SSH (22) from your IP
     - Allow TCP 3000 from VPC CIDR (10.0.0.0/16 or your VPC range)
7. **Storage:** 8GB gp3 (default)
8. **Advanced Details:**
   - IAM Role: None needed
   - Monitoring: Enable detailed monitoring (optional)
9. Click **Launch Instance**

**Option B: AWS CLI**
```bash
aws ec2 run-instances \
  --image-id ami-0c94855ba95c574c8 \
  --instance-type t3.small \
  --key-name suffix-server \
  --security-group-ids sg-XXXXX \
  --subnet-id subnet-XXXXX \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=geoip-service-dedicated},{Key=Role,Value=geoip}]' \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=8,VolumeType=gp3}' \
  --region us-east-1
```

### Step 2: Get Instance IP

```bash
# Get the public IP of your new instance
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=geoip-service-dedicated" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text
```

### Step 3: Deploy GeoIP Service

```bash
# Set environment variables
export GEOIP_INSTANCE="<public-ip-from-step-2>"
export MAXMIND_LICENSE_KEY="<your-maxmind-key>"

# Get MaxMind key from: https://www.maxmind.com/en/geolite2/signup

# Run deployment script
cd /Users/geetsoni/Downloads/suffix-tool-main\ 2
bash proxy-service/scripts/deploy-geoip-dedicated.sh
```

**What this does:**
- ✅ Creates `/home/ec2-user/geoip-service/` directory
- ✅ Uploads `geoip-service.js`
- ✅ Installs `express` and `maxmind` packages
- ✅ Downloads GeoLite2-City and GeoLite2-ASN databases
- ✅ Creates systemd service (auto-restart on failure/reboot)
- ✅ Starts service on port 3000
- ✅ Verifies health check

### Step 4: Update All Proxy Instances

```bash
# Set GeoIP service URL
export GEOIP_SERVICE_URL="http://<geoip-instance-ip>:3000"

# Update all proxy instances
bash proxy-service/scripts/update-geoip-url.sh
```

**What this does:**
- ✅ Adds `GEOIP_SERVICE_URL` to `.env` on all 6 proxy instances
- ✅ Restarts PM2 to pick up new environment variable
- ✅ Proxy instances now query centralized GeoIP service

---

## Verification

### Test GeoIP Service Directly

```bash
GEOIP_IP="<your-geoip-instance-ip>"

# Health check
curl "http://$GEOIP_IP:3000/health"
# Expected: {"status":"healthy","databases":"ready"}

# Test IP lookup (Google DNS)
curl "http://$GEOIP_IP:3000/geoip/8.8.8.8" | jq '.'
# Expected: Shows US, Google, not datacenter

# Test datacenter IP (AWS)
curl "http://$GEOIP_IP:3000/geoip/52.54.72.188" | jq '.'
# Expected: Shows "is_datacenter": true

# Test batch lookup
curl -X POST "http://$GEOIP_IP:3000/geoip/batch" \
  -H "Content-Type: application/json" \
  -d '{"ips": ["8.8.8.8", "1.1.1.1"]}' | jq '.'
```

### Test from Proxy Instances

```bash
# Test that proxy instances can reach GeoIP service
ssh -i ~/Downloads/suffix-server.pem ec2-user@13.222.100.70 \
  "curl -s http://<geoip-ip>:3000/health"
```

### Test Google Ads Click with Datacenter Detection

```bash
# Test click from a datacenter IP (should be blocked if filtering enabled)
curl -H "X-Forwarded-For: 52.54.72.188" \
  "http://13.222.100.70:3000/click?offer_name=ECOFLOW_US_SHEET_MOB&url=https://example.com&force_transparent=false"
```

---

## Monitoring

### Check Service Status

```bash
ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE \
  "sudo systemctl status geoip"
```

### View Logs

```bash
# Real-time logs
ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE \
  "sudo journalctl -u geoip -f"

# Last 100 lines
ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE \
  "sudo journalctl -u geoip -n 100"
```

### Restart Service

```bash
ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE \
  "sudo systemctl restart geoip"
```

---

## Security Group Configuration

The GeoIP instance needs these inbound rules:

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | Your IP | Admin access |
| Custom TCP | TCP | 3000 | VPC CIDR (10.0.0.0/16) | GeoIP queries from proxy instances |

**Note:** Port 3000 should **NOT** be open to 0.0.0.0/0 (internet). Only allow from your VPC.

---

## Cost Estimate

**Instance Cost:**
- t3.small: ~$0.0208/hour = ~$15/month
- 8GB gp3 storage: ~$0.80/month
- **Total: ~$16/month**

**Why separate instance?**
- ✅ MaxMind databases (~400MB) not needed on every proxy instance
- ✅ Single source of truth for IP data
- ✅ Easy to update databases (just restart one service)
- ✅ Can scale proxy instances without worrying about GeoIP setup
- ✅ Auto-recovery via systemd (restarts if crashes)

---

## Troubleshooting

### Service won't start
```bash
# Check logs
ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE \
  "sudo journalctl -u geoip -n 50"

# Check if databases exist
ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE \
  "ls -lh /home/ec2-user/geoip-service/geoip/*.mmdb"
```

### Proxy instances can't reach GeoIP
```bash
# Test connectivity from proxy instance
ssh -i ~/Downloads/suffix-server.pem ec2-user@13.222.100.70 \
  "curl -v http://<geoip-ip>:3000/health"

# Check security group allows port 3000 from proxy IPs
```

### Update MaxMind Databases (Monthly)
```bash
export GEOIP_INSTANCE="<ip>"
export MAXMIND_LICENSE_KEY="<key>"

ssh -i ~/Downloads/suffix-server.pem ec2-user@$GEOIP_INSTANCE << EOF
cd /home/ec2-user/geoip-service/geoip
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz" -o GeoLite2-City.tar.gz
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz" -o GeoLite2-ASN.tar.gz
tar -xzf GeoLite2-City.tar.gz --strip-components=1 --wildcards '*.mmdb'
tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 --wildcards '*.mmdb'
rm -f *.tar.gz
sudo systemctl restart geoip
EOF
```

---

## Next Steps

After deployment is complete:
1. ✅ GeoIP service running on dedicated instance (port 3000)
2. ✅ All proxy instances configured to use it
3. ✅ Test datacenter detection is working
4. 🔄 Monitor logs for a few hours
5. 🔄 Set up monthly cron job to update databases
