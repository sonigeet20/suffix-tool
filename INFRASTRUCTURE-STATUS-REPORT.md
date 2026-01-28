# Google Ads Infrastructure Status Report

## Question 1: MaxMind GeoIP Auto-Update

### Current Status: ❌ **NOT DEPLOYED**

The MaxMind GeoIP database auto-update mechanism is **NOT currently set up** on the dedicated GeoIP instance.

### What Exists:
- **GeoIP Service Instance**: `i-08ac8dc9194356f09` (3.215.176.40)
- **Service**: Running on port 3000 with MaxMind GeoLite2 databases
- **Databases**: City and ASN databases loaded and functional
- **Queries**: Responding to geoip requests from all 6 proxy instances

### What's Missing:
- ❌ No cron job for auto-updating MaxMind databases
- ❌ No automated download schedule (monthly for free tier)
- ❌ No database version checking
- ❌ No notification/alert system for outdated databases

### The Problem:
MaxMind GeoLite2 databases are released monthly. Currently, they must be manually updated, which means:
1. Databases can become stale
2. New datacenter/VPN providers aren't detected
3. Manual intervention required every month

### Recommended Solution:

Create a cron job on the GeoIP instance to auto-update databases monthly:

```bash
#!/bin/bash
# /etc/cron.d/maxmind-geoip-update
# Run at 2 AM UTC on the 1st of each month

0 2 1 * * root /opt/maxmind/update-geoip.sh >> /var/log/maxmind-update.log 2>&1
```

Update script location: `/opt/maxmind/update-geoip.sh`:
```bash
#!/bin/bash

LOG_FILE="/var/log/maxmind-update.log"
DB_PATH="/home/ec2-user/proxy-service/geoip"
LICENSE_KEY="${MAXMIND_LICENSE_KEY}"  # Set via environment variable

echo "[$(date)] Starting MaxMind GeoIP database update" >> "$LOG_FILE"

# Download latest databases
cd "$DB_PATH" || exit 1

# City database
wget -q "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz" -O GeoLite2-City.tar.gz
if [ $? -eq 0 ]; then
    tar -xzf GeoLite2-City.tar.gz --strip-components=1 && rm GeoLite2-City.tar.gz
    echo "[$(date)] ✓ City database updated" >> "$LOG_FILE"
else
    echo "[$(date)] ✗ Failed to download City database" >> "$LOG_FILE"
fi

# ASN database
wget -q "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz" -O GeoLite2-ASN.tar.gz
if [ $? -eq 0 ]; then
    tar -xzf GeoLite2-ASN.tar.gz --strip-components=1 && rm GeoLite2-ASN.tar.gz
    echo "[$(date)] ✓ ASN database updated" >> "$LOG_FILE"
else
    echo "[$(date)] ✗ Failed to download ASN database" >> "$LOG_FILE"
fi

# No restart needed - geoip-service reloads databases on each request
echo "[$(date)] Update complete" >> "$LOG_FILE"
```

---

## Question 2: HTTPS Configuration on Subdomain

### Current Status: ❌ **NOT CONFIGURED**

HTTPS is **NOT currently configured** for the ads.day24.online subdomain or the NLB.

### Current Infrastructure:
- **NLB**: `url-tracker-proxy-nlb` (34.226.99.187)
  - Scheme: Internet-facing
  - Protocol: TCP (port 80 only)
  - No HTTPS listener
  - Forwards to ALB at port 80

- **ALB**: `url-tracker-proxy-alb`
  - Scheme: Internet-facing
  - Protocol: HTTP (port 80 only)
  - No HTTPS listener
  - No SSL certificate configured

- **DNS**: `ads.day24.online`
  - Status: NOT YET CONFIGURED
  - No Route53 record pointing to NLB
  - No Route53 hosted zone found for day24.online

### What's Missing:
1. ❌ SSL/TLS certificate for ads.day24.online
2. ❌ HTTPS listener on NLB (port 443)
3. ❌ HTTPS listener on ALB (port 443)
4. ❌ DNS record (A record pointing 34.226.99.187)
5. ❌ Route53 hosted zone for day24.online
6. ❌ HTTP → HTTPS redirect (optional but recommended)

### Setup Steps Required:

#### Step 1: Create/Find Route53 Hosted Zone
```bash
# Create hosted zone for day24.online
aws route53 create-hosted-zone \
  --name day24.online \
  --caller-reference "$(date +%s)"

# Get Zone ID
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --query 'HostedZones[?Name==`day24.online.`].Id' \
  --output text | cut -d'/' -f3)

echo "Zone ID: $ZONE_ID"
```

#### Step 2: Create A Record for ads.day24.online
```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"CREATE\",
      \"ResourceRecordSet\": {
        \"Name\": \"ads.day24.online\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"Z35SXDOTRQ7X7K\",
          \"DNSName\": \"34.226.99.187\",
          \"EvaluateTargetHealth\": false
        }
      }
    }]
  }"
```

#### Step 3: Request SSL Certificate from AWS Certificate Manager
```bash
aws acm request-certificate \
  --domain-name ads.day24.online \
  --subject-alternative-names www.ads.day24.online \
  --validation-method DNS \
  --region us-east-1
```

#### Step 4: Validate Certificate (DNS Validation)
```bash
# Get certificate details
CERT_ARN=$(aws acm list-certificates \
  --query 'CertificateSummaryList[?DomainName==`ads.day24.online`].CertificateArn' \
  --output text)

# Describe certificate to get DNS validation records
aws acm describe-certificate --certificate-arn "$CERT_ARN" --region us-east-1 | \
  jq '.Certificate.DomainValidationOptions'

# Add the validation DNS records to Route53
# (Follow the AWS console instructions or automate with DNS API)
```

#### Step 5: Add HTTPS Listener to ALB
```bash
aws elbv2 create-listener \
  --load-balancer-arn "arn:aws:elasticloadbalancing:us-east-1:179406869795:loadbalancer/app/url-tracker-proxy-alb/ffa90c859dfe9143" \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn="$CERT_ARN" \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:179406869795:targetgroup/nlb-to-alb-tg/d17e34ddd8fd1ece
```

#### Step 6: Add HTTP → HTTPS Redirect to ALB (Optional)
```bash
# Modify HTTP listener to redirect to HTTPS
aws elbv2 modify-listener \
  --listener-arn "arn:aws:elasticloadbalancing:us-east-1:179406869795:listener/app/url-tracker-proxy-alb/ffa90c859dfe9143/50dc6f58590721d0" \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

#### Step 7: Add HTTPS Listener to NLB
```bash
# Note: NLB typically uses TLS for TCP passthrough, but you can add TLS termination
aws elbv2 create-listener \
  --load-balancer-arn "arn:aws:elasticloadbalancing:us-east-1:179406869795:loadbalancer/net/url-tracker-proxy-nlb/e4d7be99ea54b148" \
  --protocol TLS \
  --port 443 \
  --certificates CertificateArn="$CERT_ARN" \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:us-east-1:179406869795:targetgroup/nlb-to-alb-tg/d17e34ddd8fd1ece
```

### Testing HTTPS:
```bash
# Once configured, test:
curl -I https://ads.day24.online/click/health
curl -I http://ads.day24.online/click/health  # Should redirect to HTTPS
```

---

## Summary Table

| Component | Status | Issue | Priority |
|-----------|--------|-------|----------|
| MaxMind Auto-Update | ❌ Not Deployed | Manual monthly updates required | HIGH |
| DNS (ads.day24.online) | ❌ Not Configured | No hosted zone/records | HIGH |
| SSL Certificate | ❌ Not Obtained | ACM certificate not requested | HIGH |
| NLB HTTPS Listener | ❌ Not Configured | Only HTTP/port 80 | HIGH |
| ALB HTTPS Listener | ❌ Not Configured | Only HTTP/port 80 | HIGH |
| HTTP→HTTPS Redirect | ❌ Not Set | Users must use HTTPS manually | MEDIUM |

---

## Estimated Time to Complete

- **MaxMind Auto-Update**: 30 minutes (create cron job script + test)
- **HTTPS Setup**: 1-2 hours (certificate validation takes time due to DNS validation)
- **DNS Configuration**: 15 minutes (once hosted zone exists)
- **Total**: 2-3 hours

---

## Next Steps (Priority Order)

1. **Set up MaxMind auto-update** (HIGH - database staleness risk)
2. **Request SSL certificate** (HIGH - HTTPS required for security)
3. **Create Route53 hosted zone** (HIGH - DNS required)
4. **Add HTTPS listeners to ALB/NLB** (HIGH - complete HTTPS)
5. **Set up HTTP redirect** (MEDIUM - user experience)

---

## Security Notes

⚠️ **Current Status**: All traffic is unencrypted HTTP
- Sensitive data (click data, filter configs) transmitted in plain text
- Vulnerable to man-in-the-middle attacks
- Google Ads may require HTTPS for final URLs

✅ **After HTTPS**: Full encryption in transit
- Traffic encrypted end-to-end
- Certificate validation ensures server authenticity
- Compliant with modern security standards

