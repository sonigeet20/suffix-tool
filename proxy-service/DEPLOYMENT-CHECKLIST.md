# AWS Proxy Service Deployment Checklist

## Pre-Deployment

### 1. Luna Proxy Setup
- [ ] Sign up for Luna Proxy account
- [ ] Purchase residential proxy plan
- [ ] Get proxy credentials:
  - [ ] Proxy host (e.g., `customer-USERNAME.proxy.lunaproxy.com`)
  - [ ] Proxy port (e.g., `12233`)
  - [ ] Username
  - [ ] Password
- [ ] Test credentials with curl:
  ```bash
  curl -x http://USERNAME:PASSWORD@PROXY_HOST:PORT https://api.ipify.org
  ```

### 2. AWS Account Setup
- [ ] Create AWS account (if not already)
- [ ] Set up billing alerts
- [ ] Create IAM user for deployment
- [ ] Install AWS CLI: `aws configure`
- [ ] Choose deployment method: ☐ EC2  ☐ ECS  ☐ App Runner

### 3. Local Testing
- [ ] Clone/download proxy-service folder
- [ ] Copy `.env.example` to `.env`
- [ ] Fill in Luna credentials in `.env`
- [ ] Install dependencies: `npm install`
- [ ] Start server: `npm start`
- [ ] Run tests: `./test-local.sh`
- [ ] Verify proxy IP is different from local IP
- [ ] Test with real redirect URL

## Deployment

### Option A: EC2 Deployment

#### EC2 Instance Setup
- [ ] Launch EC2 instance (t3.medium minimum)
- [ ] Choose Ubuntu 22.04 LTS AMI
- [ ] Configure security group (ports 22, 3000, 80, 443)
- [ ] Create/download key pair
- [ ] Launch instance
- [ ] Note down public IP address

#### Server Configuration
- [ ] SSH into instance
- [ ] Update system: `sudo apt update && sudo apt upgrade -y`
- [ ] Install Node.js 18
- [ ] Install Chrome dependencies
- [ ] Install PM2: `sudo npm install -g pm2`

#### Application Deployment
- [ ] Upload files via SCP or Git clone
- [ ] Create `.env` file with Luna credentials
- [ ] Install dependencies: `npm install`
- [ ] Start with PM2: `pm2 start server.js --name proxy-service`
- [ ] Configure PM2 startup: `pm2 startup && pm2 save`

#### Testing
- [ ] Test health: `curl http://YOUR-EC2-IP:3000/health`
- [ ] Test IP: `curl http://YOUR-EC2-IP:3000/ip`
- [ ] Test trace with real URL
- [ ] Check PM2 logs: `pm2 logs proxy-service`

#### Optional: HTTPS Setup
- [ ] Purchase domain name
- [ ] Point A record to EC2 IP
- [ ] Install Nginx
- [ ] Configure Nginx reverse proxy
- [ ] Get SSL cert with Certbot
- [ ] Test HTTPS: `curl https://your-domain.com/health`

### Option B: ECS/Fargate Deployment

#### Container Registry
- [ ] Create ECR repository: `luna-proxy-service`
- [ ] Build Docker image locally
- [ ] Push to ECR

#### ECS Setup
- [ ] Create ECS cluster
- [ ] Create task definition (0.5 vCPU, 1GB RAM)
- [ ] Add Luna credentials as environment variables
- [ ] Create Application Load Balancer
- [ ] Create target group (port 3000, /health)
- [ ] Create ECS service (2 tasks minimum)
- [ ] Configure auto-scaling

#### DNS & SSL
- [ ] Get ALB DNS name
- [ ] Create CNAME record
- [ ] Add HTTPS listener with ACM certificate

#### Testing
- [ ] Test ALB health endpoint
- [ ] Test trace endpoint
- [ ] Check CloudWatch logs
- [ ] Monitor for 1 hour

### Option C: App Runner Deployment

#### GitHub Setup
- [ ] Create GitHub repository
- [ ] Push proxy-service code
- [ ] Create `apprunner.yaml` in root

#### App Runner
- [ ] Go to AWS App Runner
- [ ] Create service from GitHub repo
- [ ] Configure build settings
- [ ] Add Luna credentials as secrets
- [ ] Deploy

#### Testing
- [ ] Get App Runner URL
- [ ] Test all endpoints
- [ ] Check logs

## Post-Deployment

### Supabase Integration
- [ ] Get proxy service URL (EC2 IP, ALB DNS, or App Runner URL)
- [ ] Add to Supabase: `supabase secrets set AWS_PROXY_URL=https://...`
- [ ] Update trace-redirects edge function (see INTEGRATION-GUIDE.md)
- [ ] Deploy edge function: `supabase functions deploy trace-redirects`

### Testing End-to-End
- [ ] Create test offer with tracking template
- [ ] Call get-suffix endpoint
- [ ] Verify proxy IP appears in suffix_requests table
- [ ] Check Analytics page shows proxy details
- [ ] Test with 5-10 different offers

### Monitoring Setup
- [ ] Configure CloudWatch dashboard
- [ ] Set up CPU/memory alarms
- [ ] Set up error rate alarm
- [ ] Configure log retention (30 days)
- [ ] Set up SNS notifications for alerts

### Security Hardening
- [ ] Move Luna credentials to AWS Secrets Manager
- [ ] Implement API key authentication
- [ ] Enable HTTPS only
- [ ] Configure security groups (least privilege)
- [ ] Enable VPC flow logs
- [ ] Set up AWS WAF (optional)

### Performance Optimization
- [ ] Monitor response times for 24 hours
- [ ] Adjust instance size if needed
- [ ] Configure ECS auto-scaling rules
- [ ] Optimize Puppeteer settings
- [ ] Set up caching if beneficial

### Backup & Recovery
- [ ] Document all AWS resources created
- [ ] Create AMI snapshot (EC2 only)
- [ ] Export configuration
- [ ] Test disaster recovery procedure
- [ ] Document rollback procedure

## Maintenance Schedule

### Daily
- [ ] Check CloudWatch metrics
- [ ] Review error logs
- [ ] Monitor Luna proxy usage

### Weekly
- [ ] Review cost report
- [ ] Check for security updates
- [ ] Analyze performance trends
- [ ] Review and clean logs

### Monthly
- [ ] Update Node.js dependencies
- [ ] Update Puppeteer/Chrome
- [ ] Review and optimize costs
- [ ] Test backup/restore procedure
- [ ] Review security group rules

## Troubleshooting Quick Reference

### Service Not Starting
```bash
# EC2
pm2 logs proxy-service --lines 100
pm2 restart proxy-service

# Docker
docker logs container-id
docker restart container-id
```

### High Memory Usage
```bash
# Check memory
free -h

# Add swap (EC2)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Proxy Connection Issues
```bash
# Test proxy directly
curl -x http://USERNAME:PASSWORD@HOST:PORT https://api.ipify.org

# Check Luna dashboard for usage/errors
# Verify credentials in .env or AWS Secrets Manager
```

### Puppeteer Errors
```bash
# Check Chrome installation
google-chrome --version

# Reinstall
npm rebuild puppeteer
npx puppeteer browsers install chrome
```

## Cost Tracking

### Expected Monthly Costs

**EC2 (t3.medium):**
- Compute: $30
- Storage: $2
- Data transfer: $10
- **Total: ~$42/month**

**ECS Fargate:**
- Compute: $25
- ALB: $16
- Data transfer: $10
- **Total: ~$51/month**

**App Runner:**
- Compute: $25
- Data transfer: $10
- **Total: ~$35/month**

**Luna Proxy:**
- Residential: ~$0.50-2.00/GB
- Estimate: 10GB/month = $5-20
- **Total Luna: ~$20/month** (varies by usage)

### Cost Optimization Tips
- Use spot instances (EC2) for 60% savings
- Schedule auto-scaling based on traffic patterns
- Block unnecessary resources in Puppeteer
- Monitor and set billing alerts
- Review Luna usage weekly

## Success Criteria

Deployment is successful when:
- [x] Health endpoint returns 200
- [x] IP endpoint shows Luna proxy IP (not AWS IP)
- [x] Trace endpoint successfully follows redirects
- [x] Supabase edge functions can call AWS proxy
- [x] Analytics page shows proxy IPs in suffix requests
- [x] Average response time < 5 seconds
- [x] Error rate < 5%
- [x] Service has been stable for 24+ hours

## Support & Resources

- **Luna Proxy Support:** https://www.lunaproxy.com/support
- **AWS Documentation:** https://docs.aws.amazon.com
- **Puppeteer Docs:** https://pptr.dev
- **Supabase Docs:** https://supabase.com/docs

## Emergency Contacts

Document your team's contacts:
- DevOps Lead: __________
- Luna Account Manager: __________
- AWS Support: __________

## Rollback Plan

If deployment fails:
1. Stop the new service
2. Revert Supabase edge function: `supabase functions deploy trace-redirects --version PREVIOUS`
3. Remove AWS_PROXY_URL: `supabase secrets unset AWS_PROXY_URL`
4. Document failure reason
5. Fix issues and redeploy

---

**Last Updated:** 2025-12-18
**Deployed By:** __________
**Deployment Date:** __________
**Production URL:** __________
