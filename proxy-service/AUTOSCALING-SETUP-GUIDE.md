# Auto-Scaling Setup Guide

## Current Instance Protection & Auto-Scaling Configuration

Your instance: **i-03ea38b1268e76630** (18.204.4.188) in **us-east-1**

⚠️ **IMPORTANT**: This instance is in AWS Account **179406869795**  
Your current AWS CLI is authenticated to account **079719770316**

**You must switch to the correct AWS account before proceeding!**

---

## 🔑 Step 0: Switch to Correct AWS Account

Your instance exists in AWS account `179406869795`, but your CLI is using `079719770316`.

### Option A: Use AWS Console (Recommended for this situation)
1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Make sure you're in account **179406869795**
3. Follow the manual steps below

### Option B: Configure AWS CLI for the correct account
```bash
# Check current account
aws sts get-caller-identity

# If wrong account, configure correct credentials
aws configure --profile url-tracker-prod
# Enter Access Key ID for account 179406869795
# Enter Secret Access Key
# Enter region: us-east-1

# Use this profile for all commands
export AWS_PROFILE=url-tracker-prod
```

---

## ⚡ Quick Setup (AWS Console Method)

If AWS CLI has permission issues, use the AWS Console:

### Step 1: Protect Current Instance (2 minutes)

1. Go to [EC2 Console → Instances](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Instances:)
2. Select instance `i-03ea38b1268e76630`
3. **Actions → Instance settings → Change termination protection → Enable**
4. ✅ Instance is now protected from accidental deletion

### Step 2: Create AMI from Current Instance (10 minutes)

1. Select instance `i-03ea38b1268e76630`
2. **Actions → Image and templates → Create image**
3. Settings:
   - **Image name**: `url-tracker-proxy-ami-v1`
   - **Description**: `Proxy service with Node.js, PM2, Chrome dependencies`
   - **No reboot**: ✅ (keep it checked to avoid downtime)
4. Click **Create image**
5. Note the **AMI ID** (e.g., `ami-xxxxx`) - you'll need this
6. Wait 5-10 minutes for AMI status to become **Available**
7. Check status: [EC2 Console → AMIs](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#Images:visibility=owned-by-me)

### Step 3: Create Launch Template (5 minutes)

1. Go to [EC2 Console → Launch Templates](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#LaunchTemplates:)
2. Click **Create launch template**
3. Configure:
   - **Name**: `url-tracker-proxy-template`
   - **AMI**: Select your AMI from Step 2 (search by ID or name)
   - **Instance type**: t2.micro (or match your current instance type)
   - **Key pair**: suffix-server (your existing key)
   - **Security group**: url-tracker-ec2-sg (your existing security group)
   - **Advanced details → User data** (paste this):
     ```bash
     #!/bin/bash
     cd /home/ec2-user/proxy-service
     sudo -u ec2-user pm2 start server.js --name proxy-server
     sudo -u ec2-user pm2 save
     sudo env PATH=$PATH:/home/ec2-user/.nvm/versions/node/v18.20.5/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
     ```
4. Click **Create launch template**

### Step 4: Create Target Group (3 minutes)

1. Go to [EC2 Console → Target Groups](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#TargetGroups:)
2. Click **Create target group**
3. Configure:
   - **Target type**: Instances
   - **Name**: `url-tracker-proxy-tg`
   - **Protocol**: HTTP
   - **Port**: 3000
   - **VPC**: (select the VPC your instance is in)
   - **Health check protocol**: HTTP
   - **Health check path**: `/health`
   - **Health check interval**: 30 seconds
   - **Healthy threshold**: 2
   - **Unhealthy threshold**: 3
4. Click **Next**
5. **Register targets**: Select `i-03ea38b1268e76630` and click "Include as pending below"
6. Click **Create target group**

### Step 5: Create Application Load Balancer (5 minutes)

1. Go to [EC2 Console → Load Balancers](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#LoadBalancers:)
2. Click **Create load balancer** → **Application Load Balancer**
3. Configure:
   - **Name**: `url-tracker-proxy-alb`
   - **Scheme**: Internet-facing
   - **IP address type**: IPv4
   - **Network mapping**: 
     - Select your VPC
     - Select **at least 2 availability zones** (required for ALB)
   - **Security groups**: url-tracker-ec2-sg (your existing security group)
   - **Listeners**: 
     - Protocol: HTTP
     - Port: 80
     - Default action: Forward to `url-tracker-proxy-tg`
4. Click **Create load balancer**
5. **IMPORTANT**: Note the **DNS name** (e.g., `url-tracker-proxy-alb-123456789.us-east-1.elb.amazonaws.com`)
6. Wait 2-3 minutes for it to become **Active**

### Step 6: Create Auto Scaling Group (5 minutes)

1. Go to [EC2 Console → Auto Scaling Groups](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#AutoScalingGroups:)
2. Click **Create Auto Scaling group**
3. Configure:
   - **Name**: `url-tracker-proxy-asg`
   - **Launch template**: Select `url-tracker-proxy-template`
   - Click **Next**
4. **Network**:
   - **VPC**: (same as your instance)
   - **Subnets**: Select same subnet as your instance (or multiple for HA)
   - Click **Next**
5. **Load balancing**:
   - ✅ Attach to an existing load balancer
   - **Choose from your load balancer target groups**: `url-tracker-proxy-tg`
   - **Health checks**: ✅ Turn on ELB health checks
   - **Health check grace period**: 300 seconds
   - Click **Next**
6. **Group size**:
   - **Desired capacity**: 2
   - **Minimum capacity**: 2
   - **Maximum capacity**: 5
   - Click **Next**
7. **Scaling policies**:
   - ✅ Target tracking scaling policy
   - **Metric type**: Average CPU utilization
   - **Target value**: 50
   - Click **Next**
8. Skip notifications, click **Next**
9. Add tags (optional), click **Next**
10. Review and click **Create Auto Scaling group**

### Step 7: Update Supabase Settings (2 minutes)

1. Get your Load Balancer DNS name from Step 5
2. Update Supabase settings table:
   ```sql
   UPDATE settings
   SET aws_proxy_url = 'http://url-tracker-proxy-alb-123456789.us-east-1.elb.amazonaws.com'
   WHERE user_id = 'f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b';
   ```
   
   Or use the CLI:
   ```bash
   npx supabase db execute "UPDATE settings SET aws_proxy_url = 'http://YOUR-ALB-DNS-HERE' WHERE user_id = 'f9a22630-9c70-4f4c-b3ac-421d1fd4ad2b';"
   ```

### Step 8: Verify Everything Works (5 minutes)

1. **Check Load Balancer health**:
   ```bash
   curl http://YOUR-ALB-DNS/health
   ```
   Should return: `{"status":"healthy",...}`

2. **Test trace endpoint**:
   ```bash
   curl -X POST http://YOUR-ALB-DNS/trace \
     -H "Content-Type: application/json" \
     -d '{"url": "https://httpbin.org/headers", "mode": "http_only"}'
   ```

3. **Check Auto Scaling Group**:
   - Go to [Auto Scaling Groups Console](https://console.aws.amazon.com/ec2/v2/home?region=us-east-1#AutoScalingGroups:)
   - You should see 2 instances running
   - Check "Activity" tab to see instance launches

4. **Check Target Group health**:
   - Go to your target group
   - "Targets" tab should show instances as **healthy**

---

## 🛡️ What This Setup Provides

✅ **High Availability**: Minimum 2 instances always running  
✅ **Auto Recovery**: Failed instances automatically replaced  
✅ **Auto Scaling**: Scales up when CPU > 50%, scales down when idle  
✅ **Load Distribution**: Traffic distributed across all healthy instances  
✅ **Zero Downtime**: Updates can be done by updating launch template  
✅ **Protected Origin**: Original instance (18.204.4.188) never deleted  
✅ **No Frontend Changes**: Single load balancer URL works forever  

---

## 📊 Monitoring & Management

### Check Auto Scaling Activity
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names url-tracker-proxy-asg \
  --region us-east-1
```

### Check Instance Health
```bash
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:us-east-1:ACCOUNT:targetgroup/url-tracker-proxy-tg/XXX \
  --region us-east-1
```

### View Load Balancer Metrics
- Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch)
- **All metrics → ApplicationELB**
- View request count, target response time, healthy host count

---

## 🚨 Troubleshooting

### New Instances Not Passing Health Checks

**Symptom**: Instances launch but show "unhealthy" in target group

**Fix**:
1. SSH to one of the new instances
2. Check PM2 status: `pm2 status`
3. Check logs: `pm2 logs proxy-server`
4. If server not running: `cd ~/proxy-service && pm2 start server.js --name proxy-server`
5. Check security group allows port 3000 from load balancer

### Load Balancer Returning 502/503 Errors

**Symptom**: `curl http://ALB-DNS/health` returns 502 or 503

**Fix**:
1. Check target group has healthy targets
2. Verify security group allows load balancer → instance communication
3. Check instance firewall: `sudo iptables -L`
4. Verify PM2 process running: `ssh` to instance and check `pm2 status`

### Auto Scaling Not Creating Instances

**Symptom**: ASG stuck at 0 or 1 instances

**Fix**:
1. Check ASG activity history for error messages
2. Verify launch template has correct AMI (not deleted/deregistered)
3. Check subnet has available IP addresses
4. Verify IAM permissions for ASG service role

---

## 💰 Cost Estimate

**Current Setup (1 instance)**:
- 1x t2.micro: ~$8.50/month
- Data transfer: ~$1-2/month
- **Total**: ~$10/month

**With Auto-Scaling (2-5 instances)**:
- 2x t2.micro (minimum): ~$17/month
- Load Balancer: ~$16/month
- Data transfer: ~$2-5/month
- **Total**: ~$35-60/month (depending on traffic)

**Optimization Tip**: Use reserved instances or savings plans for 40-60% discount on compute costs.

---

## 🔄 Updating the Application

### Option 1: Update via Launch Template (Zero Downtime)

1. SSH to any running instance
2. Update code: `cd ~/proxy-service && git pull`
3. Create new AMI from updated instance
4. Update launch template with new AMI version
5. Terminate old instances one by one (ASG will launch new ones with updated AMI)

### Option 2: Rolling Update via SSM

```bash
# Update all instances at once
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets "Key=tag:aws:autoscaling:groupName,Values=url-tracker-proxy-asg" \
  --parameters 'commands=["cd /home/ec2-user/proxy-service && git pull && pm2 restart proxy-server"]' \
  --region us-east-1
```

---

## 📝 Summary

After completing these steps:

1. ✅ Original instance (18.204.4.188) is **protected** from deletion
2. ✅ AMI captured with all dependencies (Node.js, PM2, Chrome libs, code)
3. ✅ Load Balancer provides single endpoint: `http://ALB-DNS`
4. ✅ Auto Scaling ensures minimum 2 instances always running
5. ✅ Frontend needs **ONE update**: Change URL to load balancer DNS
6. ✅ Future scaling automatic: 50% CPU threshold triggers new instances
7. ✅ Health checks ensure only working instances receive traffic

**Frontend Change Required**:
```javascript
// Old
const proxyUrl = "http://18.204.4.188:3000";

// New  
const proxyUrl = "http://url-tracker-proxy-alb-123456789.us-east-1.elb.amazonaws.com";
```

That's it! Your application is now production-ready with auto-scaling and high availability. 🚀
