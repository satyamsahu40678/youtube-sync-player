FROM node:20-bookworm-slim AS build

WORKDIR /app

# Copy package files
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies (using npm install in case lockfiles are missing/out of sync)
RUN cd client && npm install
RUN cd server && npm install

# Copy source code
COPY . .

# Install ffmpeg for HLS transcoding
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Build server
RUN cd server && npm run build

# Build client (with NEXT_PUBLIC_SERVER_URL set)
ARG NEXT_PUBLIC_SERVER_URL=http://localhost:4000
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
RUN cd client && npm run build

# Production image
FROM node:20-bookworm-slim

WORKDIR /app

# Install procps and ffmpeg for start-prod.sh and transcoding
RUN apt-get update && apt-get install -y procps ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY --from=build /app/client/package*.json ./client/
COPY --from=build /app/server/package*.json ./server/

# Install production dependencies
RUN cd client && npm install --omit=dev
RUN cd server && npm install --omit=dev

# Copy built artifacts
COPY --from=build /app/client/.next ./client/.next
COPY --from=build /app/client/public ./client/public
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/scripts ./scripts

# Set environment
ENV NODE_ENV=production

# Expose Next.js and Express ports
EXPOSE 3000 4000

# Run start-prod.sh
CMD bash ./scripts/start-prod.sh
