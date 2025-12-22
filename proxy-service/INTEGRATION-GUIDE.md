# Integration Guide: Connect Supabase to AWS Proxy Service

## Step 1: Deploy AWS Proxy Service

Follow the AWS-DEPLOYMENT-GUIDE.md to deploy your proxy service. You'll get a URL like:
- EC2: `http://YOUR-EC2-IP:3000`
- ECS/ALB: `https://proxy.yourdomain.com`
- App Runner: `https://xxxxx.us-east-1.awsapprunner.com`

## Step 2: Test Your Proxy Service

```bash
# Test health endpoint
curl https://your-proxy-url.com/health

# Test IP endpoint (should show Luna proxy IP, not AWS IP)
curl https://your-proxy-url.com/ip

# Test trace endpoint
curl -X POST https://your-proxy-url.com/trace \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://bit.ly/example",
    "max_redirects": 20,
    "timeout_ms": 30000
  }'
```

## Step 3: Add AWS Proxy URL to Supabase Environment

You need to add the proxy URL as an environment variable in Supabase:

### Option A: Using Supabase Dashboard

1. Go to your Supabase project
2. Navigate to **Project Settings → Edge Functions**
3. Add environment variable:
   - Name: `AWS_PROXY_URL`
   - Value: `https://your-proxy-url.com`

### Option B: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Set secret
supabase secrets set AWS_PROXY_URL=https://your-proxy-url.com
```

## Step 4: Update trace-redirects Edge Function

The trace-redirects function needs to be updated to call your AWS proxy service instead of doing the tracing directly.

### Create new helper function

Create a new file `supabase/functions/_shared/aws-proxy.ts`:

```typescript
export async function fetchThroughAWSProxy(
  url: string,
  options: {
    max_redirects?: number;
    timeout_ms?: number;
    user_agent?: string;
  }
): Promise<any> {
  const AWS_PROXY_URL = Deno.env.get('AWS_PROXY_URL');

  if (!AWS_PROXY_URL) {
    throw new Error('AWS_PROXY_URL not configured');
  }

  const response = await fetch(`${AWS_PROXY_URL}/trace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      max_redirects: options.max_redirects || 20,
      timeout_ms: options.timeout_ms || 30000,
      user_agent: options.user_agent,
    }),
    signal: AbortSignal.timeout(options.timeout_ms || 30000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AWS Proxy error ${response.status}: ${errorText}`);
  }

  return await response.json();
}
```

### Update trace-redirects/index.ts

Replace the redirect tracing logic with AWS proxy calls:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchThroughAWSProxy } from '../_shared/aws-proxy.ts';

// ... (keep existing interfaces and CORS headers)

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { url, max_redirects = 20, timeout_ms = 30000, user_agent, user_id } = await req.json() as TraceRequest;

    if (!url) {
      throw new Error('URL is required');
    }

    console.log('📡 Calling AWS proxy service for:', url);

    // Call AWS proxy service
    const result = await fetchThroughAWSProxy(url, {
      max_redirects,
      timeout_ms,
      user_agent: user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    console.log('✅ AWS proxy returned:', result.total_steps, 'steps');

    // Get proxy IP info (optional - AWS service returns this)
    const proxyIp = result.proxy_ip || null;
    const geoData = result.geo_location || null;

    // Save trace to database if successful
    if (result.success && result.chain && result.chain.length > 0 && user_id) {
      await supabase.from('url_traces').insert({
        offer_id: user_id, // You'll need to pass offer_id from caller
        user_id: user_id,
        redirect_chain: result.chain,
        final_url: result.final_url,
        proxy_ip: proxyIp,
        geo_country: geoData?.country,
        geo_city: geoData?.city,
        geo_region: geoData?.region,
        geo_data: geoData,
        device_type: 'bot',
        user_agent: result.user_agent,
        visited_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        chain: result.chain,
        total_steps: result.total_steps,
        total_timing_ms: result.total_timing_ms,
        final_url: result.final_url,
        proxy_used: true,
        proxy_type: 'residential',
        proxy_ip: proxyIp,
        geo_location: geoData,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error: any) {
    console.error('❌ Trace error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to trace redirects',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
```

## Step 5: Deploy Updated Edge Functions

```bash
# From your project root
cd supabase

# Deploy the updated trace-redirects function
supabase functions deploy trace-redirects

# Or deploy all functions
supabase functions deploy
```

## Step 6: Update get-suffix Function

The get-suffix function also needs to use the new trace-redirects flow. The good news is it already calls trace-redirects, so no changes needed!

Just verify it's working:

```bash
# Test get-suffix endpoint
curl "https://your-project.supabase.co/functions/v1/get-suffix?offer_name=TEST"
```

## Step 7: Test End-to-End

1. **Create/update an offer** in your app with a tracking template
2. **Call get-suffix** endpoint
3. **Check logs** in your AWS proxy service:
   ```bash
   # EC2 with PM2
   pm2 logs proxy-service

   # Or check Supabase edge function logs
   supabase functions logs trace-redirects
   ```
4. **Verify in Analytics** that proxy IPs are showing up

## Step 8: Monitor Performance

### AWS CloudWatch (if using EC2/ECS)

1. Go to **CloudWatch → Dashboards → Create dashboard**
2. Add widgets for:
   - CPU utilization
   - Memory utilization
   - Network in/out
   - Request count
   - Response time

### Application Metrics

Add custom metrics to your proxy service:

```javascript
// In server.js, add metrics tracking
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

app.get('/metrics', (req, res) => {
  res.json({
    total_requests: totalRequests,
    successful_requests: successfulRequests,
    failed_requests: failedRequests,
    success_rate: totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(2) : 0,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});
```

## Troubleshooting

### Error: "AWS_PROXY_URL not configured"

Make sure you added the environment variable to Supabase:
```bash
supabase secrets set AWS_PROXY_URL=https://your-proxy-url.com
```

### Error: "Connection timeout"

1. Check AWS security group allows inbound traffic on port 3000 (or 80/443)
2. Verify proxy service is running:
   ```bash
   curl https://your-proxy-url.com/health
   ```
3. Check Supabase edge function logs for details

### Error: "Proxy connection failed"

1. Test proxy credentials directly:
   ```bash
   curl -x http://USERNAME:PASSWORD@PROXY_HOST:PORT https://api.ipify.org
   ```
2. Check AWS proxy service logs for Luna proxy errors
3. Verify Luna proxy credentials are correct in AWS

### Slow response times

1. **Check Luna proxy performance:**
   - Luna proxies can be slow for first request (cold start)
   - Consider using sticky sessions

2. **Increase AWS resources:**
   - Upgrade to larger instance type
   - Add more ECS tasks

3. **Optimize Puppeteer:**
   - Reuse browser instances (already implemented)
   - Reduce page load timeout
   - Block unnecessary resources (images, fonts)

## Cost Optimization

### Reduce Luna Proxy Costs

- Block images, fonts, stylesheets in Puppeteer (already implemented)
- Set shorter timeouts
- Use session persistence to reuse same proxy IP

### Reduce AWS Costs

- Use spot instances for EC2 (60-70% savings)
- Auto-scale based on demand
- Use AWS Savings Plans
- Monitor and optimize memory usage

## Security Best Practices

1. **API Key Authentication:**
   ```javascript
   // Add to server.js
   const API_KEY = process.env.API_KEY;

   app.use((req, res, next) => {
     if (req.path === '/health') return next();

     const apiKey = req.headers['x-api-key'];
     if (apiKey !== API_KEY) {
       return res.status(401).json({ error: 'Unauthorized' });
     }
     next();
   });
   ```

2. **Use AWS Secrets Manager:**
   - Store Luna credentials in Secrets Manager
   - Update proxy service to fetch from Secrets Manager
   - Rotate credentials regularly

3. **Enable HTTPS:**
   - Use AWS Certificate Manager (free SSL certs)
   - Configure ALB with HTTPS listener
   - Redirect HTTP to HTTPS

4. **Rate Limiting:**
   ```bash
   npm install express-rate-limit
   ```
   ```javascript
   const rateLimit = require('express-rate-limit');

   const limiter = rateLimit({
     windowMs: 1 * 60 * 1000, // 1 minute
     max: 60, // 60 requests per minute
   });

   app.use('/trace', limiter);
   ```

## Next Steps

1. Deploy AWS proxy service
2. Test endpoints thoroughly
3. Update Supabase edge functions
4. Monitor performance for 24 hours
5. Optimize based on metrics
6. Set up alerts and monitoring
7. Document any custom configurations

## Support

For issues:
1. Check AWS CloudWatch logs
2. Check Supabase edge function logs
3. Test each component independently
4. Review Luna proxy dashboard for usage/errors
