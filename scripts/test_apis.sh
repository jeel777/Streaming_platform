#!/bin/bash
# =============================================================
# API Test Script — Tests all transcription + core endpoints
# =============================================================
BASE_URL="http://localhost:8000/api/v1"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

test_api() {
    local name="$1"
    local expected_status="$2"
    local response="$3"
    local actual_status
    actual_status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$actual_status" == "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} | ${name} (HTTP ${actual_status})"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}❌ FAIL${NC} | ${name} (Expected: ${expected_status}, Got: ${actual_status})"
        echo -e "   ${YELLOW}Response:${NC} $(echo "$body" | head -c 200)"
        FAIL=$((FAIL + 1))
    fi
}

echo -e "\n${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  🧪 Streaming Platform API Test Suite${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}\n"

# -----------------------------------------------------------
# 1. REGISTER USER
# -----------------------------------------------------------
echo -e "${YELLOW}── User Registration & Auth ──${NC}"

REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/users/register" \
  -F "fullname=Transcript Tester" \
  -F "email=transcript_tester_$(date +%s)@test.com" \
  -F "username=transcripttester$(date +%s)" \
  -F "password=Test@12345" \
  -F "avatar=@$(find ./public -name "*.png" -o -name "*.jpg" 2>/dev/null | head -1 || echo '/dev/null')")

REGISTER_STATUS=$(echo "$REGISTER_RESPONSE" | tail -1)

# If registration needs avatar file, let's try a simpler approach
if [ "$REGISTER_STATUS" != "201" ] && [ "$REGISTER_STATUS" != "200" ]; then
    # Create a tiny test image for avatar
    mkdir -p ./public/temp
    echo -e "\x89PNG\r\n\x1a\n" > ./public/temp/test_avatar.png
    
    USERNAME="transcripttester$(date +%s)"
    EMAIL="transcript_tester_$(date +%s)@test.com"
    
    REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/users/register" \
      -F "fullname=Transcript Tester" \
      -F "email=$EMAIL" \
      -F "username=$USERNAME" \
      -F "password=Test@12345" \
      -F "avatar=@./public/temp/test_avatar.png")
    REGISTER_STATUS=$(echo "$REGISTER_RESPONSE" | tail -1)
fi

test_api "Register User" "201" "$REGISTER_RESPONSE"

# -----------------------------------------------------------
# 2. LOGIN
# -----------------------------------------------------------
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Test@12345\"}")

test_api "Login User" "200" "$LOGIN_RESPONSE"

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | sed '$d' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data',{}).get('accessToken',''))
except: pass
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}⚠️  Could not extract token. Trying to login with existing user...${NC}"
    
    # Try with a known existing user if any
    LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/users/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"transcript_tester@test.com","password":"Test@12345"}')
    
    TOKEN=$(echo "$LOGIN_RESPONSE" | sed '$d' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('data',{}).get('accessToken',''))
except: pass
" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Cannot continue without auth token. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}🔑 Token acquired: ${TOKEN:0:20}...${NC}\n"

# -----------------------------------------------------------
# 3. TRANSCRIPTION API TESTS
# -----------------------------------------------------------
echo -e "${YELLOW}── Transcription APIs ──${NC}"

# Test: Get transcript for non-existent video (should 400 or 404)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/000000000000000000000000" \
  -H "Authorization: Bearer $TOKEN")
test_api "Get Transcript (no video)" "404" "$RESPONSE"

# Test: Search with no query (should 400)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/search" \
  -H "Authorization: Bearer $TOKEN")
test_api "Search without query (should 400)" "400" "$RESPONSE"

# Test: Search with empty query (should 400)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/search?q=" \
  -H "Authorization: Bearer $TOKEN")
test_api "Search with empty query (should 400)" "400" "$RESPONSE"

# Test: Search with valid query (should 200, even if no results)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/search?q=hello" \
  -H "Authorization: Bearer $TOKEN")
test_api "Search transcripts (q=hello)" "200" "$RESPONSE"

# Test: Invalid video ID
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/invalid-id" \
  -H "Authorization: Bearer $TOKEN")
test_api "Get Transcript (invalid ID)" "400" "$RESPONSE"

# Test: Transcribe with invalid video ID
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/ai/transcripts/invalid-id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"base"}')
test_api "Transcribe (invalid ID)" "400" "$RESPONSE"

# Test: Transcribe non-existent video
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/ai/transcripts/000000000000000000000000" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"base"}')
test_api "Transcribe (video not found)" "404" "$RESPONSE"

# Test: Delete transcript for non-existent video
RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
  "$BASE_URL/ai/transcripts/000000000000000000000000" \
  -H "Authorization: Bearer $TOKEN")
test_api "Delete transcript (video not found)" "404" "$RESPONSE"

# Test: Summary for non-existent video
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/ai/transcripts/000000000000000000000000/summary" \
  -H "Authorization: Bearer $TOKEN")
test_api "Summary (no transcript)" "404" "$RESPONSE"

# Test: Transcribe with invalid model
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/ai/transcripts/000000000000000000000000" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"invalid_model"}')
test_api "Transcribe (invalid model)" "400" "$RESPONSE"

echo ""

# -----------------------------------------------------------
# 4. AUTH PROTECTION TESTS
# -----------------------------------------------------------
echo -e "${YELLOW}── Auth Protection ──${NC}"

# Test: Transcription without auth (should 401)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/000000000000000000000000")
test_api "Get Transcript (no auth)" "401" "$RESPONSE"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$BASE_URL/ai/transcripts/000000000000000000000000")
test_api "Transcribe (no auth)" "401" "$RESPONSE"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/ai/transcripts/search?q=test")
test_api "Search (no auth)" "401" "$RESPONSE"

echo ""

# -----------------------------------------------------------
# 5. OTHER API SMOKE TESTS
# -----------------------------------------------------------
echo -e "${YELLOW}── Other API Smoke Tests ──${NC}"

# Videos list
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/videos" \
  -H "Authorization: Bearer $TOKEN")
test_api "GET /videos" "200" "$RESPONSE"

# Get current user
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$BASE_URL/users/current-user" \
  -H "Authorization: Bearer $TOKEN")
test_api "GET /users/current-user" "200" "$RESPONSE"

echo ""

# -----------------------------------------------------------
# SUMMARY
# -----------------------------------------------------------
TOTAL=$((PASS + FAIL))
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  Results: ${GREEN}${PASS} passed${NC} / ${RED}${FAIL} failed${NC} / ${TOTAL} total"
echo -e "${CYAN}═══════════════════════════════════════════${NC}\n"

if [ $FAIL -gt 0 ]; then
    exit 1
fi
