#!/bin/bash
# Monitor for orphaned Chrome browser processes

CHROME_COUNT=$(ps aux | grep 'chrome --allow-pre-commit' | grep -v grep | wc -l)
MEMORY_MB=$(free -m | awk '/^Mem:/{print $3}')

echo "====== Browser Leak Monitor ======"
echo "Time: $(date)"
echo "Active Chrome instances: $CHROME_COUNT"
echo "Memory usage: ${MEMORY_MB}MB"

if [ "$CHROME_COUNT" -gt 5 ]; then
  echo "⚠️  WARNING: Too many Chrome instances detected ($CHROME_COUNT)"
  echo "This indicates browser cleanup issue"
  echo ""
  echo "Oldest Chrome processes:"
  ps aux --sort=start_time | grep 'chrome --allow-pre-commit' | grep -v grep | head -5
  
  # Optional: Auto-cleanup orphaned browsers older than 2 minutes
  if [ "$1" = "--auto-cleanup" ]; then
    echo ""
    echo "Running auto-cleanup..."
    ps aux | grep 'chrome --allow-pre-commit' | grep -v grep | awk '{print $2}' | while read pid; do
      RUNTIME=$(ps -p $pid -o etimes= | tr -d ' ')
      if [ "$RUNTIME" -gt 120 ]; then
        echo "Killing orphaned Chrome PID $pid (running ${RUNTIME}s)"
        kill $pid
      fi
    done
  fi
fi

if [ "$MEMORY_MB" -gt 6000 ]; then
  echo "⚠️  WARNING: High memory usage (${MEMORY_MB}MB / 7600MB)"
fi

echo "=================================="
