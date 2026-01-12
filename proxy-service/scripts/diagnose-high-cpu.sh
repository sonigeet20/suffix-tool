#!/usr/bin/env bash
set -euo pipefail

# Quick diagnostics for high CPU/memory/network usage on Node proxy hosts
# Usage: sudo bash diagnose-high-cpu.sh

log() { echo "[diagnose] $*"; }

log "Collecting system summary..."
uname -a || true
uptime || true

log "Top 10 CPU processes (1 sample)..."
ps -eo pid,ppid,%cpu,%mem,command --sort=-%cpu | head -n 20

log "Memory summary..."
free -m || vm_stat || true

log "Disk I/O..."
iostat -c 1 2 || true

df -h || true

log "Network sockets (Node + ESTABLISHED counts)..."
netstat -an | awk '/ESTABLISHED/ {++s[$4]} END {for (a in s) print s[a], a}' | sort -nr | head -n 20 || true

log "PM2 process list..."
which pm2 >/dev/null 2>&1 && pm2 status || echo "pm2 not found"

log "PM2 CPU/mem snapshot..."
which pm2 >/dev/null 2>&1 && pm2 prettylist || true

log "Node versions..."
which node >/dev/null 2>&1 && node -v || true
which npm >/dev/null 2>&1 && npm -v || true

log "Recent syslog/kernel warnings..."
sudo dmesg | tail -n 50 || true

log "Open file limits..."
ulimit -n || true

log "Connection counts per minute (ALB/NGINX if present)..."
# Common for ALB targets using Nginx
if [ -f /var/log/nginx/access.log ]; then
  tail -n 1000 /var/log/nginx/access.log | awk '{print $4}' | cut -d: -f1 | sort | uniq -c | tail -n 20
fi

log "Node GC/memory if heapdump endpoint available..."
curl -sS localhost:3000/health || true

log "Done. Consider capturing 'top -b -n 1' during spike as well."
