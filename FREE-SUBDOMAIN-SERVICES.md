# Free Subdomain & Dynamic DNS Services

All 541 tracker domains checked are already registered. Here are **FREE** alternatives that allow you to create subdomains and point them to your IP address:

## 🌟 Top Recommended Services

### 1. **FreeDNS (afraid.org)** ⭐ BEST OPTION
- **Website**: https://freedns.afraid.org/
- **Subdomains**: Unlimited free subdomains
- **Features**:
  - Over 50,000+ shared domain names to choose from
  - Static DNS hosting
  - Dynamic DNS (auto-update IP)
  - API for automated updates
  - IPv6 support
- **Popular domains available**:
  - mooo.com
  - freeddns.org
  - chickenkiller.com
  - crabdance.com
  - strangled.net
  - And 50,000+ more!
- **How to use**:
  1. Create free account at https://freedns.afraid.org/signup/
  2. Browse available domains: https://freedns.afraid.org/domain/registry/
  3. Create subdomain: `yourname.mooo.com` → Point to your IP
  4. Update via API: `curl https://sync.afraid.org/u/YOUR_KEY/`

### 2. **DuckDNS** ⭐ EASIEST
- **Website**: https://www.duckdns.org/
- **Subdomains**: Free .duckdns.org subdomains
- **Features**:
  - Super simple - no account needed (login with Google/GitHub/Twitter)
  - Up to 5 subdomains
  - Automatic IP updates
  - Well documented API
  - Hosted on AWS (reliable)
- **Example**: `yourtracker.duckdns.org`
- **How to use**:
  1. Login with Google/GitHub
  2. Create subdomain: `yourtracker.duckdns.org`
  3. Point to your IP: 34.226.99.187
  4. Update via: `curl "https://www.duckdns.org/update?domains=yourtracker&token=YOUR_TOKEN&ip=34.226.99.187"`

### 3. **No-IP**
- **Website**: https://www.noip.com/
- **Subdomains**: Free hostname with 30+ domains
- **Features**:
  - 3 free hostnames
  - 30+ domain choices (noip.me, ddns.net, etc.)
  - Dynamic DNS clients for all platforms
  - Must confirm hostname every 30 days (free tier)
- **Example**: `yourtracker.ddns.net`
- **Domains**: ddns.net, hopto.org, zapto.org, myftp.org, etc.

### 4. **Dynu**
- **Website**: https://www.dynu.com/
- **Subdomains**: 4 free hostnames
- **Features**:
  - Multiple domain options
  - No forced renewal
  - DDNS and static IP support
  - SSL certificate support
- **Domains**: dynu.net, dynu.com, ddnsfree.com, etc.

### 5. **ChangeIP**
- **Website**: https://www.changeip.com/
- **Subdomains**: 1 free hostname
- **Features**:
  - Dynamic DNS
  - 15+ domain choices
  - Email support
- **Domains**: changeip.com, changeip.org, etc.

---

## 🚀 Quick Setup Instructions

### Option A: FreeDNS (Most Domain Choices)
```bash
# 1. Sign up
https://freedns.afraid.org/signup/

# 2. Browse domains
https://freedns.afraid.org/domain/registry/

# 3. Create subdomain (example: track.mooo.com)
# Point A record to: 34.226.99.187

# 4. Get your update key from:
https://freedns.afraid.org/dynamic/

# 5. Update IP automatically
curl "https://sync.afraid.org/u/YOUR_KEY_HERE/"
```

### Option B: DuckDNS (Easiest Setup)
```bash
# 1. Login with Google/GitHub at https://www.duckdns.org/

# 2. Create subdomain: mytracker.duckdns.org
# Enter IP: 34.226.99.187

# 3. Copy your token from dashboard

# 4. Update IP via API
curl "https://www.duckdns.org/update?domains=mytracker&token=YOUR_TOKEN&ip=34.226.99.187"

# Or auto-update (detects current IP)
curl "https://www.duckdns.org/update?domains=mytracker&token=YOUR_TOKEN"
```

---

## 🎯 Best Choices for Tracker Domains

### For Google Ads Tracking:
1. **FreeDNS** with `mooo.com` → `adtrack.mooo.com`
2. **FreeDNS** with `chickenkiller.com` → `track.chickenkiller.com`
3. **DuckDNS** → `myadstrack.duckdns.org`

### Why These Work:
- ✅ Free forever
- ✅ No renewal required
- ✅ API for automation
- ✅ Support A records (point to IP)
- ✅ Fast DNS propagation
- ✅ Reliable uptime

---

## 🔧 Integration with Your NLB

Once you create a subdomain (e.g., `track.mooo.com`):

1. **Point A record to NLB IP**: `34.226.99.187`
2. **Configure Cloudflare** (optional but recommended):
   - Add domain to Cloudflare
   - Enable "Flexible SSL" (HTTPS client → CF, HTTP CF → NLB)
   - Enable DDoS protection

3. **Test**:
```bash
# Test DNS resolution
dig track.mooo.com +short
# Should return: 34.226.99.187

# Test HTTP
curl -I http://track.mooo.com/click/health

# Test HTTPS (if using Cloudflare)
curl -I https://track.mooo.com/click/health
```

---

## 📊 Comparison Table

| Service | Subdomains | Domains Available | API | Renewal | Best For |
|---------|------------|-------------------|-----|---------|----------|
| **FreeDNS** | Unlimited | 50,000+ | ✅ | None | Most options |
| **DuckDNS** | 5 | 1 (.duckdns.org) | ✅ | None | Simplicity |
| **No-IP** | 3 | 30+ | ✅ | 30 days | Variety |
| **Dynu** | 4 | 10+ | ✅ | None | Reliability |
| **ChangeIP** | 1 | 15+ | ✅ | None | Minimal |

---

## 🎉 Recommended Next Steps

1. **Create 3-5 subdomains on FreeDNS**:
   - `track1.mooo.com`
   - `track2.strangled.net`
   - `ads.chickenkiller.com`
   - `click.crabdance.com`
   - `pixel.freeddns.org`

2. **Create 5 on DuckDNS**:
   - `adtrack1.duckdns.org`
   - `adtrack2.duckdns.org`
   - `adtrack3.duckdns.org`
   - `adtrack4.duckdns.org`
   - `adtrack5.duckdns.org`

3. **Point all to your NLB**: `34.226.99.187`

4. **Test each subdomain**:
```bash
curl http://track1.mooo.com/click/health
curl http://adtrack1.duckdns.org/click/health
```

5. **Use in Google Ads** as click trackers!

---

## 💡 Pro Tips

- Use **FreeDNS** for maximum domain variety
- Use **DuckDNS** for quick testing and simple setup
- Rotate between multiple subdomains to avoid rate limits
- Set up automatic IP updates with cron jobs
- Consider using **Cloudflare** in front for SSL and DDoS protection

---

**All services are FREE and require no payment information!** 🎊
