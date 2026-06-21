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
PORT=4000 node dist/index.js > /tmp/youtube-sync-server-prod.log 2>&1 &
SERVER_PID=$!
echo -e "${GREEN}✓ Backend server started (PID: $SERVER_PID)${NC}"

# Start frontend (Next.js production)
cd "$PROJECT_ROOT/client" || exit 1
PORT=3000 npm run start > /tmp/youtube-sync-client-prod.log 2>&1 &
CLIENT_PID=$!
echo -e "${GREEN}✓ Frontend server started (PID: $CLIENT_PID)${NC}"

# Setup Nginx Proxy
echo -e "${BLUE}Starting Nginx Proxy...${NC}"
EXTERNAL_PORT=${PORT:-10000}
cat > /tmp/nginx.conf <<EOF
worker_processes 1;
daemon off;
events { worker_connections 1024; }
http {
    map \$http_upgrade \$connection_upgrade {
        default upgrade;
        '' close;
    }
    server {
        listen $EXTERNAL_PORT;
        
        location /socket.io/ {
            proxy_pass http://127.0.0.1:4000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            proxy_set_header Host \$host;
        }
        
        location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host \$host; }
        location /hls/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host \$host; }
        location /rooms/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host \$host; }
        location /users/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host \$host; }
        location /history/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host \$host; }
        location /health { proxy_pass http://127.0.0.1:4000; proxy_set_header Host \$host; }
        
        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_set_header Host \$host;
        }
    }
}
EOF

nginx -c /tmp/nginx.conf > /tmp/youtube-sync-nginx.log 2>&1 &
NGINX_PID=$!
echo -e "${GREEN}✓ Nginx Proxy started on port $EXTERNAL_PORT (PID: $NGINX_PID)${NC}"

echo -e "${GREEN}✓ Production servers running!${NC}"
tail -f /tmp/youtube-sync-server-prod.log /tmp/youtube-sync-client-prod.log /tmp/youtube-sync-nginx.log
