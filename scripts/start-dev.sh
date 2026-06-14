#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Kill any existing processes
pkill -f "npm run dev" || true
sleep 1

# Start backend in background
cd "$(dirname "$0")/../server" || exit 1
npm run dev > /tmp/youtube-sync-server.log 2>&1 &
SERVER_PID=$!
echo -e "${BLUE}Backend server started (PID: $SERVER_PID)${NC}"

# Wait for backend to be ready
echo -e "${YELLOW}Waiting for backend server to start...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:4000/health > /dev/null; then
    echo -e "${GREEN}✓ Backend server is ready${NC}"
    break
  fi
  sleep 1
done

# Start frontend in background
cd "$(dirname "$0")/../client" || exit 1
npm run dev > /tmp/youtube-sync-client.log 2>&1 &
CLIENT_PID=$!
echo -e "${BLUE}Frontend server started (PID: $CLIENT_PID)${NC}"

# Wait for frontend to be ready
echo -e "${YELLOW}Waiting for frontend server to start...${NC}"
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend server is ready${NC}"
    break
  fi
  sleep 1
done

echo -e "${GREEN}✓ All servers started successfully!${NC}"
echo -e "${BLUE}Frontend: http://localhost:3000${NC}"
echo -e "${BLUE}Backend: http://localhost:4000${NC}"

# Keep script running and show logs
wait
