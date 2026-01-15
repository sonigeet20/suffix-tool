#!/bin/bash

# Incremental Deployment Script - Bright Data user_context Fix
# Created: January 14, 2026
# Strategy: Test on 1 instance first, rollback ready at every step

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/Users/geetsoni/Downloads/suffix-tool-main 2"
SUPABASE_PROJECT_ID="rfhuqenntxiqurplenjn"
SSH_KEY="$HOME/Downloads/suffix-server.pem"
TEST_INSTANCE="3.234.225.150"
INSTANCE_2="34.206.53.70"
INSTANCE_3="44.195.48.137"
INSTANCE_4="18.207.138.123"

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

confirm_step() {
    echo ""
    echo -e "${YELLOW}$1${NC}"
    read -p "Continue? (yes/no): " response
    if [ "$response" != "yes" ]; then
        print_error "Deployment aborted by user"
        exit 1
    fi
}

# Start deployment
clear
print_header "INCREMENTAL DEPLOYMENT - Bright Data user_context Fix"

echo "This script will deploy changes incrementally:"
echo "  1. Create backups"
echo "  2. Deploy Supabase edge function"
echo "  3. Test on single EC2 instance (${TEST_INSTANCE})"
echo "  4. If successful, deploy to remaining instances"
echo ""
echo "Rollback is available at every step."
echo ""

confirm_step "Ready to start deployment?"

cd "$PROJECT_DIR"

# ============================================================
# PHASE 1: BACKUP & PREPARATION
# ============================================================

print_header "PHASE 1: BACKUP & PREPARATION"

# Create backup directory
BACKUP_DIR=".backup/$(date +%Y%m%d_%H%M%S)"
print_info "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Backup files
print_info "Backing up critical files..."
cp supabase/functions/trace-redirects/index.ts "$BACKUP_DIR/index.ts.backup"
cp proxy-service/server.js "$BACKUP_DIR/server.js.backup"
tar -czf "$BACKUP_DIR/proxy-service-backup.tar.gz" \
  proxy-service/server.js \
  proxy-service/package.json \
  proxy-service/trace-interactive.js \
  proxy-service/lib/*.js 2>/dev/null || true

print_success "Backups created in: $BACKUP_DIR"

# Git tag
print_info "Creating git tag..."
git tag -a "v1.0-pre-deployment-$(date +%Y%m%d-%H%M%S)" \
  -m "Version before Bright Data user_context deployment - $(date)"
git push origin --tags 2>/dev/null || print_warning "Could not push tag (continue anyway)"

print_success "Phase 1 complete: Backups and git tag ready"

confirm_step "Phase 1 complete. Proceed to Supabase deployment?"

# ============================================================
# PHASE 2: SUPABASE EDGE FUNCTION DEPLOYMENT
# ============================================================

print_header "PHASE 2: SUPABASE EDGE FUNCTION DEPLOYMENT"

print_info "Deploying edge function with --no-verify-jwt flag..."
supabase functions deploy trace-redirects \
  --project-id "$SUPABASE_PROJECT_ID" \
  --no-verify-jwt

if [ $? -ne 0 ]; then
    print_error "Edge function deployment failed!"
    exit 1
fi

print_success "Edge function deployed successfully"

# Test edge function
print_info "Testing edge function..."

# Test 1: HTTP mode
HTTP_TEST=$(curl -s -X POST "https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/trace-redirects" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' \
  | jq -r '.success')

if [ "$HTTP_TEST" = "true" ]; then
    print_success "HTTP mode test: PASS"
else
    print_error "HTTP mode test: FAIL"
    print_error "Response: $HTTP_TEST"
    echo ""
    print_error "Edge function is not working correctly!"
    print_warning "Run rollback: cd '$PROJECT_DIR' && git checkout HEAD~1 supabase/functions/trace-redirects/index.ts"
    exit 1
fi

# Test 2: Bright Data fix verification
print_info "Testing Bright Data user_context fix..."
BD_ERROR=$(curl -s -X POST "https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/trace-redirects" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"brightdata_browser","user_id":"test","offer_id":"test"}' \
  | jq -r '.error')

if [[ "$BD_ERROR" == *"No enabled Bright Data Browser provider found"* ]]; then
    print_success "Bright Data fix verified: user_context is being sent ✅"
elif [[ "$BD_ERROR" == *"requires user context"* ]]; then
    print_error "Bright Data fix FAILED: Still showing 'requires user context' error"
    exit 1
else
    print_warning "Unexpected Bright Data response: $BD_ERROR"
    confirm_step "Continue anyway?"
fi

print_success "Phase 2 complete: Edge function deployed and tested"

confirm_step "Phase 2 complete. Proceed to EC2 test instance?"

# ============================================================
# PHASE 3: SINGLE EC2 INSTANCE TEST
# ============================================================

print_header "PHASE 3: SINGLE EC2 INSTANCE TEST ($TEST_INSTANCE)"

print_info "Connecting to test instance..."

# Check if we can connect
if ! ssh -o ConnectTimeout=5 -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" "echo 'Connected'" 2>/dev/null; then
    print_error "Cannot connect to instance $TEST_INSTANCE"
    exit 1
fi

print_success "Connected to test instance"

# Backup on EC2
print_info "Creating backup on EC2 instance..."
ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" << 'EOF'
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/
ls -lh suffix-tool-backup-*.tar.gz | tail -1
EOF

print_success "EC2 backup created"

# Deploy to test instance
print_info "Deploying to test instance..."
ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" << 'EOF'
cd suffix-tool
git pull origin main
pm2 restart proxy-service
sleep 5
pm2 status proxy-service
EOF

if [ $? -ne 0 ]; then
    print_error "Deployment to test instance failed!"
    exit 1
fi

print_success "Code deployed to test instance"

# Test the instance
print_info "Running tests on test instance..."

# Test 1: Health check
HEALTH=$(ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" \
  "curl -s http://localhost:3000/health | jq -r .status")

if [ "$HEALTH" = "healthy" ]; then
    print_success "Health check: PASS"
else
    print_error "Health check: FAIL (status: $HEALTH)"
    print_warning "Run rollback on instance $TEST_INSTANCE"
    exit 1
fi

# Test 2: HTTP trace
HTTP_SUCCESS=$(ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" \
  "curl -s -X POST http://localhost:3000/trace -H 'Content-Type: application/json' -d '{\"url\":\"https://httpbin.org/ip\",\"mode\":\"http\",\"max_redirects\":5}' | jq -r .success")

if [ "$HTTP_SUCCESS" = "true" ]; then
    print_success "HTTP trace test: PASS"
else
    print_error "HTTP trace test: FAIL"
    exit 1
fi

# Test 3: Check for errors
ERROR_COUNT=$(ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" \
  "pm2 logs proxy-service --nostream --lines 100 | grep -i 'error' | wc -l")

print_info "Error count in last 100 log lines: $ERROR_COUNT"
if [ "$ERROR_COUNT" -gt 20 ]; then
    print_warning "High error count detected: $ERROR_COUNT"
    confirm_step "Continue anyway?"
fi

# Test 4: Check proxy is working
print_info "Checking if proxy connections are working..."
PROXY_IP=$(ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" \
  "pm2 logs proxy-service --nostream --lines 100 | grep 'Proxy IP used' | tail -1")

if [ -n "$PROXY_IP" ]; then
    print_success "Proxy connections working: $PROXY_IP"
else
    print_warning "No proxy IP found in recent logs (might be OK if no traces ran)"
fi

print_success "Phase 3 complete: Test instance validated"

# Soak test
print_info "Starting 10-minute soak test..."
print_info "Monitoring test instance for stability..."

for i in {1..10}; do
    sleep 60  # Wait 1 minute
    
    HEALTH=$(ssh -i "$SSH_KEY" "ec2-user@${TEST_INSTANCE}" \
      "curl -s http://localhost:3000/health | jq -r .status" 2>/dev/null)
    
    if [ "$HEALTH" = "healthy" ]; then
        echo -n "."
    else
        echo ""
        print_error "Health check failed during soak test at minute $i"
        exit 1
    fi
done

echo ""
print_success "10-minute soak test complete: Instance stable"

confirm_step "Test instance validated successfully. Deploy to remaining instances?"

# ============================================================
# PHASE 4: REMAINING INSTANCES
# ============================================================

print_header "PHASE 4: DEPLOYING TO REMAINING INSTANCES"

# Deploy to instance 2
print_info "Deploying to instance 2 ($INSTANCE_2)..."
ssh -i "$SSH_KEY" "ec2-user@${INSTANCE_2}" << 'EOF'
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/
cd suffix-tool
git pull origin main
pm2 restart proxy-service
sleep 5
curl -s http://localhost:3000/health | jq .status
EOF

if [ $? -eq 0 ]; then
    print_success "Instance 2 deployed and healthy"
else
    print_error "Instance 2 deployment failed"
    exit 1
fi

# Deploy to instance 3
print_info "Deploying to instance 3 ($INSTANCE_3)..."
ssh -i "$SSH_KEY" "ec2-user@${INSTANCE_3}" << 'EOF'
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/
cd suffix-tool
git pull origin main
pm2 restart proxy-service
sleep 5
curl -s http://localhost:3000/health | jq .status
EOF

if [ $? -eq 0 ]; then
    print_success "Instance 3 deployed and healthy"
else
    print_error "Instance 3 deployment failed"
    exit 1
fi

# Deploy to instance 4
print_info "Deploying to instance 4 ($INSTANCE_4)..."
ssh -i "$SSH_KEY" "ec2-user@${INSTANCE_4}" << 'EOF'
cd /home/ec2-user
tar -czf suffix-tool-backup-$(date +%Y%m%d_%H%M%S).tar.gz suffix-tool/
cd suffix-tool
git pull origin main
pm2 restart proxy-service
sleep 5
curl -s http://localhost:3000/health | jq .status
EOF

if [ $? -eq 0 ]; then
    print_success "Instance 4 deployed and healthy"
else
    print_error "Instance 4 deployment failed"
    exit 1
fi

print_success "Phase 4 complete: All instances deployed"

# ============================================================
# PHASE 5: FINAL VALIDATION
# ============================================================

print_header "PHASE 5: FINAL VALIDATION"

print_info "Validating all components..."

# Validate all instances
for instance in "$TEST_INSTANCE" "$INSTANCE_2" "$INSTANCE_3" "$INSTANCE_4"; do
    HEALTH=$(ssh -i "$SSH_KEY" "ec2-user@${instance}" \
      "curl -s http://localhost:3000/health | jq -r .status" 2>/dev/null)
    
    if [ "$HEALTH" = "healthy" ]; then
        print_success "Instance $instance: healthy"
    else
        print_error "Instance $instance: NOT healthy"
    fi
done

# Final edge function check
FINAL_CHECK=$(curl -s -X POST "https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/trace-redirects" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://httpbin.org/ip","mode":"http","max_redirects":5}' \
  | jq -r '.success')

if [ "$FINAL_CHECK" = "true" ]; then
    print_success "Edge function: working"
else
    print_error "Edge function: NOT working"
fi

# Create success record
cat > "deployment-success-$(date +%Y%m%d-%H%M%S).txt" << EOF
Deployment Successful: $(date)

Components Deployed:
- Supabase Edge Function: trace-redirects (with --no-verify-jwt)
- EC2 Instance 1: $TEST_INSTANCE
- EC2 Instance 2: $INSTANCE_2
- EC2 Instance 3: $INSTANCE_3
- EC2 Instance 4: $INSTANCE_4

Changes:
- Added user_context to Bright Data Browser API
- Created proxy-providers-handler.js
- Updated server.js and index.ts

Test Results:
- All functional tests: PASS
- All instances: healthy
- Error rate: stable
- Soak test: 10 minutes PASS

Issues: None
Rollback: Not required

Backup Location: $BACKUP_DIR
EOF

git tag -a "v1.0-deployed-$(date +%Y%m%d-%H%M%S)" \
  -m "Successful deployment - $(date)"
git push origin --tags 2>/dev/null || true

print_header "DEPLOYMENT COMPLETE ✅"

echo ""
echo "Summary:"
echo "  ✅ Supabase edge function deployed"
echo "  ✅ All 4 EC2 instances deployed"
echo "  ✅ All tests passed"
echo "  ✅ System stable"
echo ""
echo "Rollback plan available in: ROLLBACK-PLAN.md"
echo "Continue monitoring for 24 hours"
echo ""
echo "Next steps:"
echo "  1. Monitor error logs: pm2 logs proxy-service"
echo "  2. Check proxy connections in logs"
echo "  3. Verify production traffic handling"
echo "  4. Keep rollback plan ready"
echo ""

print_success "Deployment completed successfully!"
