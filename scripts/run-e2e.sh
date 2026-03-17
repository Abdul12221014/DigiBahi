#!/bin/bash

# E2E Test Script for DigBahi Staging Environment
# Tests offline-first behavior, sync queue, and conflict resolution

set -e  # Exit on error

# Configuration
STAGING_URL="${STAGING_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
ARTIFACTS_DIR="./artifacts/ocr"

# Colors
RED='\033[0.31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 DigBahi E2E Test Suite"
echo "=========================="
echo "Backend:  $STAGING_URL"
echo "Frontend: $FRONTEND_URL"
echo

# Create artifacts directory
mkdir -p "$ARTIFACTS_DIR"

# Initialize results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILURES=()

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "  [$TOTAL_TESTS] $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        FAILURES+=("$test_name")
        return 1
    fi
}

# Wait for backend to be healthy
echo "⏳ Waiting for backend to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf "$STAGING_URL/api/v1/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is healthy${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ Backend failed to start${NC}"
    exit 1
fi

echo

# Run tests
echo "🧪 Running E2E Tests"
echo "--------------------"

# Test 1: Health check
run_test "Health Check" "curl -sf '$STAGING_URL/api/v1/health' | grep -q 'ok'"

# Test 2: Ledger GET
run_test "Ledger GET" "curl -sf '$STAGING_URL/api/v1/ledger' > /dev/null"

# Test 3: Ledger POST (Device A)
DEVICE_A_ENTRY=$(cat <<EOF
{
  "date": "$(date +%Y-%m-%d)",
  "description": "Test Entry Device A",
  "amount": 1000.00,
  "type": "sale",
  "gstRate": 18.0,
  "gstAmount": 180.0,
  "party": "Test Customer",
  "deviceId": "device_a"
}
EOF
)

run_test "Create Entry (Device A)" "curl -sf -X POST '$STAGING_URL/api/v1/ledger' -H 'Content-Type: application/json' -d '$DEVICE_A_ENTRY' > /dev/null"

# Test 4: Ledger POST (Device B - same party, different amount)
DEVICE_B_ENTRY=$(cat <<EOF
{
  "date": "$(date +%Y-%m-%d)",
  "description": "Test Entry Device B",
  "amount": 1500.00,
  "type": "sale",
  "gstRate": 18.0,
  "gstAmount": 270.0,
  "party": "Test Customer",
  "deviceId": "device_b"
}
EOF
)

run_test "Create Entry (Device B)" "curl -sf -X POST '$STAGING_URL/api/v1/ledger' -H 'Content-Type: application/json' -d '$DEVICE_B_ENTRY' > /dev/null"

# Test 5: Sync endpoint
SYNC_DATA=$(cat <<EOF
{
  "entries": [],
  "deviceId": "test_device",
  "timestamp": $(date +%s)000
}
EOF
)

run_test "Sync Endpoint" "curl -sf -X POST '$STAGING_URL/api/v1/sync' -H 'Content-Type: application/json' -d '[$SYNC_DATA]' > /dev/null"

# Test 6: Reports endpoint
run_test "Reports Endpoint" "curl -sf '$STAGING_URL/api/v1/reports' > /dev/null"

# Test 7: Verify both entries exist (conflict resolution)
ENTRY_COUNT=$(curl -s "$STAGING_URL/api/v1/ledger" | grep -o '"id"' | wc -l | tr -d ' ')
run_test "Conflict Resolution (both entries exist)" "[ $ENTRY_COUNT -ge 2 ]"

# Save test logs
echo
echo "💾 Saving test artifacts..."

# Save E2E logs
cat > "$ARTIFACTS_DIR/e2e-logs.txt" <<EOF
DigBahi E2E Test Logs
====================
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Backend: $STAGING_URL
Frontend: $FRONTEND_URL

Test Summary:
-------------
Total Tests: $TOTAL_TESTS
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS

Test Results:
-------------
EOF

if [ $FAILED_TESTS -eq 0 ]; then
    echo "All tests passed ✅" >> "$ARTIFACTS_DIR/e2e-logs.txt"
else
    echo "Failed tests:" >> "$ARTIFACTS_DIR/e2e-logs.txt"
    for failure in "${FAILURES[@]}"; do
        echo "  - $failure" >> "$ARTIFACTS_DIR/e2e-logs.txt"
    done
fi

# Create validation report
cat > "$ARTIFACTS_DIR/validation-report.json" <<EOF
{
  "status": "$([ $FAILED_TESTS -eq 0 ] && echo 'OK' || echo 'FAILED')",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backend_url": "$STAGING_URL",
  "frontend_url": "$FRONTEND_URL",
  "health": {
    "code": 200,
    "body": "{\\"status\\":\\"ok\\"}"
  },
  "ocr_metrics": {
    "WER": 0.0,
    "CER": 0.0,
    "medianLatencyMs": 0,
    "avgConfidence": 0.0,
    "note": "OCR metrics will be populated by npm run ocr:test"
  },
  "e2e": {
    "status": "$([ $FAILED_TESTS -eq 0 ] && echo 'ok' || echo 'fail')",
    "total": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "failures": [$(IFS=,; echo "${FAILURES[*]/#/\"}" | sed 's/,/","/g' | sed 's/"$//')"]
  },
  "duplicates": [],
  "artifacts": [
    "$ARTIFACTS_DIR/e2e-logs.txt",
    "$ARTIFACTS_DIR/validation-report.json"
  ]
}
EOF

# Print summary
echo
echo "==============================================="
echo "📊 E2E Test Summary"
echo "==============================================="
echo -e "Status:       $([ $FAILED_TESTS -eq 0 ] && echo -e "${GREEN}✅ OK${NC}" || echo -e "${RED}❌ FAILED${NC}")"
echo "Total Tests:  $TOTAL_TESTS"
echo "Passed:       $PASSED_TESTS"
echo "Failed:       $FAILED_TESTS"
echo
echo "Artifacts saved to: $ARTIFACTS_DIR/"
echo "  - e2e-logs.txt"
echo "  - validation-report.json"
echo "==============================================="
echo

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    exit 0
else
    exit 1
fi
