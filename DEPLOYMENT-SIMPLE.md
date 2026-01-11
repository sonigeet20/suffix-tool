# DEPLOYMENT GUIDE - SIMPLE VERSION

## For All Instances (Current & Future)

### One-Time Setup (New Instance)
```bash
ssh -i ~/Downloads/suffix-server.pem ec2-user@<IP>
cd ~/proxy-service
bash scripts/init-pm2.sh
```

### Regular Deployment (Code Updates)
```bash
ssh -i ~/Downloads/suffix-server.pem ec2-user@<IP>
cd ~/proxy-service
git pull origin main
npm install
pm2 restart proxy-service
pm2 save
```

### Verify It's Working
```bash
pm2 status                                    # Should show 1 process: proxy-service
curl http://localhost:3000/api/trackier-status  # Should respond with JSON
```

## That's It!

**Key Points:**
- ✅ Always ONE process name: `proxy-service`
- ✅ Always ONE script: `server.js`
- ✅ No ecosystem config, no validation scripts, no complexity
- ✅ If something breaks, run `bash scripts/init-pm2.sh` to reset

## Incident Response (If CPU Spikes)

If something goes wrong:
```bash
bash scripts/init-pm2.sh          # Nuclear reset - cleans everything, starts fresh
pm2 status                        # Verify single process online
curl http://localhost:3000/api/trackier-status  # Test API
```

Done. Simple and reliable.
