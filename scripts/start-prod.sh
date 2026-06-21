#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo -e "${BLUE}Starting production servers...${NC}"

# Kill any existing processes
pkill -f "node" || true
pkill -f "redis-server" || true
sleep 1

# Start Redis
echo -e "${BLUE}Starting Redis server...${NC}"
redis-server --daemonize yes
echo -e "${GREEN}✓ Redis server started${NC}"

# Start backend
cd "$PROJECT_ROOT/server" || exit 1
node dist/index.js > /tmp/youtube-sync-server-prod.log 2>&1 &
SERVER_PID=$!
echo -e "${GREEN}✓ Backend server started (PID: $SERVER_PID)${NC}"

# Start frontend (Next.js production)
cd "$PROJECT_ROOT/client" || exit 1
npm run start > /tmp/youtube-sync-client-prod.log 2>&1 &
CLIENT_PID=$!
echo -e "${GREEN}✓ Frontend server started (PID: $CLIENT_PID)${NC}"

echo -e "${GREEN}✓ Production servers running!${NC}"
echo -e "${BLUE}Frontend: http://localhost:3000${NC}"
echo -e "${BLUE}Backend: http://localhost:4000${NC}"

tail -f /tmp/youtube-sync-server-prod.log /tmp/youtube-sync-client-prod.log
