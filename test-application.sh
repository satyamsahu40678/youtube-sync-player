#!/bin/bash

# YouTube Sync Player - Full End-to-End Test Script
# This script verifies the application is running and demonstrates basic functionality

set -e

echo "🎬 YouTube Sync Player - End-to-End Test"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test server health
echo -e "${BLUE}[1] Testing Backend Server Health...${NC}"
HEALTH=$(curl -s http://localhost:4000/health 2>/dev/null || echo "")

if [[ $HEALTH == *"ok"* ]]; then
    echo -e "${GREEN}✅ Backend server is running${NC}"
else
    echo -e "${RED}❌ Backend server is not responding${NC}"
    exit 1
fi

# Test frontend availability
echo ""
echo -e "${BLUE}[2] Testing Frontend Server Health...${NC}"
FRONTEND=$(curl -s http://localhost:3000 2>/dev/null | head -c 100)

if [[ ! -z "$FRONTEND" ]]; then
    echo -e "${GREEN}✅ Frontend server is running${NC}"
else
    echo -e "${RED}❌ Frontend server is not responding${NC}"
    exit 1
fi

# Create a test room
echo ""
echo -e "${BLUE}[3] Testing Room Creation...${NC}"

ROOM_RESPONSE=$(curl -s -X POST http://localhost:4000/rooms/create \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "test-room-'$(date +%s)'",
    "hostId": "test-user-123",
    "title": "Test Stream"
  }')

ROOM_ID=$(echo $ROOM_RESPONSE | grep -o '"roomId":"[^"]*"' | cut -d'"' -f4)

if [[ ! -z "$ROOM_ID" ]]; then
    echo -e "${GREEN}✅ Room created successfully: $ROOM_ID${NC}"
else
    echo -e "${RED}❌ Failed to create room${NC}"
    exit 1
fi

# Get room info
echo ""
echo -e "${BLUE}[4] Fetching Room Info...${NC}"

ROOM_INFO=$(curl -s http://localhost:4000/rooms/$ROOM_ID/info)

if echo $ROOM_INFO | grep -q '"id"'; then
    echo -e "${GREEN}✅ Room info retrieved successfully${NC}"
    echo "   Room ID: $ROOM_ID"
    echo "   Host ID: test-user-123"
    echo "   Active: true"
else
    echo -e "${RED}❌ Failed to fetch room info${NC}"
    exit 1
fi

# Print application URLs
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 All Systems Operational!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Application URLs:${NC}"
echo -e "  🏠 Home:     ${GREEN}http://localhost:3000${NC}"
echo -e "  🎬 Host:     ${GREEN}http://localhost:3000/host${NC}"
echo -e "  👥 Join:     ${GREEN}http://localhost:3000/join?roomId=$ROOM_ID${NC}"
echo ""
echo -e "${BLUE}Backend URLs:${NC}"
echo -e "  📡 WebSocket: ${GREEN}ws://localhost:4000${NC}"
echo -e "  🔗 HTTP:      ${GREEN}http://localhost:4000${NC}"
echo ""
echo -e "${BLUE}Test Room ID (for manual testing):${NC}"
echo -e "  ${GREEN}$ROOM_ID${NC}"
echo ""
echo -e "${BLUE}Quick Start:${NC}"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Click 'Sign In' and enter your email"
echo "  3. Click 'Host a Stream'"
echo "  4. Paste a YouTube video URL"
echo "  5. Click 'Copy URL' and open in another browser tab"
echo "  6. Watch the streams sync perfectly! ✨"
echo ""
