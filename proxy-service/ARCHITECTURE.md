# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Request                            │
│                    (Google Ads Click)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase Edge Function                        │
│                     (get-suffix)                                │
│  • Receives offer_name from Google Ads                         │
│  • Looks up offer in database                                  │
│  • Calls trace-redirects if tracking_template exists           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Supabase Edge Function                        │
│                    (trace-redirects)                            │
│  • Receives URL to trace                                       │
│  • Calls AWS Proxy Service                                     │
│  • Returns redirect chain                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Proxy Service                           │
│                  (EC2/ECS/App Runner)                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Node.js + Express + Puppeteer                            │ │
│  │  • Launches headless Chrome                               │ │
│  │  • Configures Luna Residential Proxy                      │ │
│  │  • Rotates realistic user agents                          │ │
│  │  • Traces all redirect types:                             │ │
│  │    - HTTP 301/302/307/308                                 │ │
│  │    - Meta refresh                                         │ │
│  │    - JavaScript redirects                                 │ │
│  │  • Extracts URL parameters at each step                   │ │
│  └───────────────────────┬───────────────────────────────────┘ │
└──────────────────────────┼─────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Luna Residential Proxy                        │
│                 (Rotating Proxy Network)                        │
│  • Real residential IPs                                        │
│  • Geographic distribution                                     │
│  • Automatic rotation                                          │
│  • Looks like real users to target sites                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Target URLs                                │
│              (Affiliate Networks, Offers)                       │
│  • bit.ly redirects                                            │
│  • Tracking pixels                                             │
│  • Affiliate network redirects                                 │
│  • Final destination with parameters                           │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Suffix Request Flow

```
Google Ads Click
    ↓
get-suffix?offer_name=OFFER
    ↓
Database Query (offers table)
    ↓
If tracking_template exists:
    ↓
Call trace-redirects
    ↓
AWS Proxy Service → Luna Proxy → Target URL(s)
    ↓
Extract parameters from redirect chain
    ↓
Return suffix with extracted params
    ↓
Save to suffix_requests table with proxy_ip
    ↓
Return to Google Ads
```

### 2. Trace Flow (Detailed)

```
trace-redirects receives URL
    ↓
Calls AWS Proxy Service /trace endpoint
    ↓
AWS Proxy Service:
    1. Initialize Puppeteer browser (with proxy)
    2. Authenticate with Luna credentials
    3. Set random realistic user agent
    4. Navigate to URL with redirect interception
    5. Capture each redirect step:
       ├─ HTTP redirects (301/302/307/308)
       ├─ Meta refresh tags
       └─ JavaScript redirects (window.location, etc.)
    6. Extract URL parameters at each step
    7. Record timing, headers, status codes
    8. Return complete redirect chain
    ↓
Parse redirect chain
    ↓
Extract params from configured step (redirect_chain_step)
    ↓
Save trace to url_traces table
    ↓
Return chain to caller
```

## Component Details

### AWS Proxy Service Components

**Server (server.js):**
- Express.js HTTP server
- Request routing
- Error handling
- Logging with Winston
- Health checks

**Puppeteer Manager:**
- Browser instance pooling
- Page lifecycle management
- Request interception
- Resource blocking (images, fonts)
- Redirect detection

**Proxy Integration:**
- Luna authentication
- Proxy configuration
- IP rotation
- Session management

**User Agent Rotation:**
- Pool of 7 realistic user agents
- Chrome, Firefox, Safari, Edge
- Windows, macOS, Linux
- Random selection per request

### Supabase Integration

**Edge Functions:**
- `get-suffix`: Entry point from Google Ads
- `trace-redirects`: Orchestrates tracing via AWS
- `track-hit`: Records tracking pixel hits
- `get-geolocation`: Gets proxy location info

**Database Tables:**
- `offers`: Offer configuration
- `suffix_requests`: All suffix requests with proxy IPs
- `url_traces`: Complete redirect chains
- `settings`: User proxy credentials

## Deployment Architecture

### EC2 Deployment
```
Internet → EC2 Security Group (Port 3000) → EC2 Instance
                                              ├─ Node.js
                                              ├─ PM2
                                              ├─ Puppeteer
                                              └─ Chrome
```

### ECS/Fargate Deployment
```
Internet → Application Load Balancer (HTTPS)
             ├─ Target Group (Health: /health)
             └─ ECS Service
                 ├─ Task 1 (Container)
                 ├─ Task 2 (Container)
                 └─ Auto Scaling
```

### App Runner Deployment
```
Internet → App Runner Service (HTTPS)
             ├─ Auto-deploy from GitHub
             ├─ Auto-scaling
             └─ Managed load balancing
```

## Security Architecture

### Network Security
```
┌────────────────────────────────────────────┐
│  Internet (HTTPS Only)                     │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  AWS WAF (Optional)                        │
│  • Rate limiting                           │
│  • SQL injection protection                │
│  • XSS protection                          │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Load Balancer / API Gateway               │
│  • SSL/TLS termination                     │
│  • Health checks                           │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Security Group                            │
│  • Inbound: HTTPS (443)                    │
│  • Outbound: Luna Proxy, Internet          │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Proxy Service                             │
│  • API key authentication                  │
│  • Request validation                      │
│  • Rate limiting                           │
└────────────────────────────────────────────┘
```

### Data Security
```
Luna Credentials
    ↓
AWS Secrets Manager
    ↓
IAM Role with least privilege
    ↓
ECS Task / EC2 Instance
    ↓
Environment variables (runtime only)
    ↓
Proxy Service (memory only, never logged)
```

## Monitoring Architecture

### Metrics Collection
```
Proxy Service
    ├─ Application Metrics
    │   ├─ Request count
    │   ├─ Response times
    │   ├─ Error rates
    │   └─ Success rates
    │
    ├─ System Metrics
    │   ├─ CPU usage
    │   ├─ Memory usage
    │   ├─ Network I/O
    │   └─ Disk I/O
    │
    └─ Business Metrics
        ├─ Luna proxy usage
        ├─ Cost per trace
        └─ Redirect chain lengths
            ↓
        CloudWatch
            ↓
        Dashboards & Alarms
            ↓
        SNS Notifications
```

### Logging Flow
```
Proxy Service Logs
    ↓
Winston Logger
    ├─ Console (stdout/stderr)
    ├─ File (combined.log, error.log)
    └─ CloudWatch Logs Agent
        ↓
    CloudWatch Logs
        ├─ Log Groups
        ├─ Log Streams
        └─ Log Insights (queries)
        ↓
    Alarms & Alerts
```

## Scaling Strategy

### Horizontal Scaling (ECS)
```
Traffic Increase
    ↓
CloudWatch Alarm (CPU > 70%)
    ↓
ECS Service Auto Scaling
    ↓
Add Task(s)
    ↓
ALB distributes load
```

### Vertical Scaling (EC2)
```
Consistent High Load
    ↓
Stop instance
    ↓
Change instance type
    ↓
Start instance
    ↓
Update DNS (if not using ALB)
```

## Disaster Recovery

### Backup Strategy
```
Daily:
├─ ECS Task Definition snapshots
├─ EC2 AMI snapshots
└─ Configuration backups

Weekly:
└─ Full system backup

Monthly:
└─ Disaster recovery test
```

### Recovery Procedure
```
Service Failure
    ↓
Detect via health check
    ↓
Automatic restart (PM2/ECS)
    ↓
If restart fails:
    ├─ EC2: Launch from AMI
    ├─ ECS: Redeploy task
    └─ App Runner: Rollback
    ↓
Restore configuration
    ↓
Verify health
    ↓
Resume traffic
```

## Cost Breakdown

### AWS Infrastructure
- **Compute:** $25-50/month (varies by size)
- **Load Balancer:** $16/month (ECS only)
- **Data Transfer:** $5-15/month
- **CloudWatch:** $3-5/month

### Luna Proxy
- **Per GB:** $0.50-2.00 (varies by plan)
- **Estimated:** 10-20GB/month = $10-40
- **Session fees:** Varies

### Total Monthly Cost: $50-130

### Cost Optimization
- Use spot instances (EC2): 60% savings
- Right-size instances: Monitor and adjust
- Block unnecessary resources: Reduce bandwidth
- Optimize Puppeteer: Faster = cheaper

## Performance Characteristics

### Latency Breakdown
```
Total Response Time: 2-5 seconds
├─ Supabase Edge Function: 50-100ms
├─ AWS Network: 10-20ms
├─ Puppeteer startup: 200-500ms
├─ Luna proxy connection: 100-300ms
├─ Target site(s): 1000-3000ms
└─ Response processing: 50-100ms
```

### Throughput
- **Single instance:** 5-10 requests/second
- **With auto-scaling:** 50-100 requests/second
- **Burst capacity:** 200+ requests/second

### Resource Usage
- **CPU:** 30-60% average per trace
- **Memory:** 200-400MB per concurrent trace
- **Network:** 0.5-2MB per trace
- **Disk:** Minimal (logs only)

## Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Automation:** Puppeteer 21+
- **Logging:** Winston
- **Process Management:** PM2 (EC2)

### Infrastructure
- **Cloud:** AWS (EC2/ECS/App Runner)
- **Containers:** Docker
- **Load Balancing:** ALB
- **CDN:** CloudFront (optional)

### Proxy
- **Provider:** Luna Proxy
- **Type:** Residential
- **Protocol:** HTTP/HTTPS
- **Authentication:** Username/Password

### Database
- **Primary:** Supabase (PostgreSQL)
- **Caching:** None (stateless service)

## Compliance & Privacy

### Data Handling
- No PII stored in proxy service
- Logs rotated every 30 days
- Credentials encrypted at rest
- HTTPS for all communications

### Regional Considerations
- Deploy in same region as Supabase
- Luna proxy can target specific geos
- GDPR compliance via data minimization
