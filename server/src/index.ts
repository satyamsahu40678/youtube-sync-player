import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import path from "path";
import { ClockSyncResponse, RoomState, RoomStateMessage } from "./types";

// Import services and routes from our new architecture
import { getRedis, closeRedis } from "./services/redis";
import uploadRouter from "./routes/upload";
import {
  startTranscodingWorker,
  setWorkerIO,
} from "./workers/transcodingWorker";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10MB for socket messages
  // Performance optimizations for multi-user
  pingInterval: 10000,
  pingTimeout: 5000,
  perMessageDeflate: false, // Disable compression for lower latency
});

app.use(cors());
app.use(express.json());

// ─── HLS Static Files ──────────────────────────────────────────────
const hlsDir = path.resolve(__dirname, "../../hls");
app.use(
  "/hls",
  (req, res, next) => {
    if (req.path.endsWith(".ts")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (req.path.endsWith(".m3u8")) {
      res.setHeader("Cache-Control", "no-cache");
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static(hlsDir),
);

// ─── API Routes ─────────────────────────────────────────────────────
app.use("/api/upload", uploadRouter);

// ─── Socket-to-Room Tracking (for disconnect cleanup) ──────────────
// Map socket.id -> { roomId, userId }
const socketRoomMap = new Map<string, { roomId: string; userId: string }>();

// Heartbeat rate limiter: socket.id -> last heartbeat timestamp
const heartbeatTimestamps = new Map<string, number>();
const HEARTBEAT_MIN_INTERVAL_MS = 400; // Max ~2.5 heartbeats/sec per socket

// Helper to save room info to Redis for persistence and REST API
async function saveRoomToRedis(roomId: string, hostId: string, title: string) {
  const redis = getRedis();
  const roomData = {
    id: roomId,
    hostId,
    title,
    createdAt: Date.now(),
    isActive: true,
  };
  await redis.hset(`rooms`, roomId, JSON.stringify(roomData));
}

async function updateRoomVideoInRedis(
  roomId: string,
  videoId: string,
  videoTitle: string,
) {
  const redis = getRedis();
  const roomJson = await redis.hget(`rooms`, roomId);
  if (roomJson) {
    const roomData = JSON.parse(roomJson);
    roomData.currentVideoId = videoId;
    roomData.title = videoTitle;
    await redis.hset(`rooms`, roomId, JSON.stringify(roomData));
  }
}

import { roomStates, getOrCreateRoomState } from "./state";

// Socket.io event handlers
io.on("connection", (socket) => {
  console.log(`[SOCKET] User connected: ${socket.id}`);

  // Clock synchronization (NTP-style)
  socket.on("clock-sync:ping", (clientTime: number) => {
    const serverReceiveTime = Date.now();
    socket.emit("clock-sync:pong", {
      serverReceiveTime,
      serverSendTime: Date.now(),
    } as ClockSyncResponse);
  });

  // Room join event
  socket.on(
    "room:join",
    async (data: {
      roomId: string;
      userId: string;
      userName?: string;
      userEmail?: string;
    }) => {
      const { roomId, userId, userName, userEmail } = data;

      try {
        socket.join(roomId);
        console.log(`[ROOM] User ${userId} joined room ${roomId}`);

        // Track socket-to-room mapping for disconnect cleanup
        socketRoomMap.set(socket.id, { roomId, userId });

        const roomState = getOrCreateRoomState(roomId);
        socket.emit("room:state", roomState as RoomStateMessage);

        const participantCount =
          io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit("room:participant-count", {
          count: participantCount,
        });

        // Fire-and-forget Redis operations (don't block the event loop)
        const redis = getRedis();
        Promise.all([
          redis.hset(
            `users`,
            userId,
            JSON.stringify({
              id: userId,
              email: userEmail || `${userId}@guest.local`,
              name: userName || `Guest ${userId.slice(0, 4)}`,
            }),
          ),
          redis.hget(`rooms`, roomId).then((existingRoom) => {
            if (!existingRoom) {
              return saveRoomToRedis(
                roomId,
                userId,
                `Room ${roomId.slice(0, 8)}`,
              );
            }
          }),
          redis.sadd(`room:${roomId}:participants`, userId),
          redis.sadd(`user:${userId}:history`, roomId),
        ]).catch((error) => {
          console.error("[REDIS] Error during room join:", error);
        });
      } catch (error) {
        console.error("Error joining room:", error);
        socket.emit("error", { message: "Failed to join room" });
      }
    },
  );

  // Host updates video
  socket.on(
    "room:update-video",
    async (data: { roomId: string; videoId: string }) => {
      const { roomId, videoId } = data;
      const roomState = getOrCreateRoomState(roomId);

      roomState.videoId = videoId;
      roomState.videoTitle = `Room ${roomId.slice(0, 8)}`;
      roomState.videoProgress = 0;
      roomState.status = "PLAYING";
      roomState.serverTimeUpdatedAt = Date.now();

      console.log(`[ROOM] Room ${roomId} video updated to ${videoId}`);

      io.to(roomId).emit("room:state", roomState as RoomStateMessage);

      // Fetch real YouTube title asynchronously (don't block)
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oembedUrl);
        if (response.ok) {
          const data = (await response.json()) as any;
          if (data && data.title) {
            roomState.videoTitle = data.title;
            // Only emit title update if it actually changed
            io.to(roomId).emit("room:state", roomState as RoomStateMessage);
          }
        }
        await updateRoomVideoInRedis(
          roomId,
          videoId,
          roomState.videoTitle || `Room ${roomId.slice(0, 8)}`,
        );
      } catch (err) {
        console.error("Failed to fetch YouTube title:", err);
      }
    },
  );

  // Host play/pause control
  socket.on(
    "room:playback-control",
    (data: {
      roomId: string;
      status: "PLAYING" | "PAUSED";
      progress: number;
    }) => {
      const { roomId, status, progress } = data;
      const roomState = roomStates.get(roomId);

      if (roomState) {
        roomState.status = status;
        roomState.videoProgress = progress;
        roomState.serverTimeUpdatedAt = Date.now();

        console.log(
          `[ROOM] Room ${roomId} playback control: ${status} @ ${progress}s`,
        );
        io.to(roomId).emit("room:state", roomState as RoomStateMessage);
      }
    },
  );

  // Host seek
  socket.on("room:seek", (data: { roomId: string; progress: number }) => {
    const { roomId, progress } = data;
    const roomState = roomStates.get(roomId);

    if (roomState) {
      roomState.videoProgress = progress;
      roomState.serverTimeUpdatedAt = Date.now();
      io.to(roomId).emit("room:state", roomState as RoomStateMessage);
    }
  });

  // Zero-latency heartbeat with rate limiting
  socket.on(
    "sync:heartbeat",
    (data: { roomId: string; progress?: number; currentTime?: number }) => {
      if (!data.roomId) return; // Ignore malformed events missing roomId

      // Rate limit: max 1 heartbeat per HEARTBEAT_MIN_INTERVAL_MS per socket
      const now = Date.now();
      const lastBeat = heartbeatTimestamps.get(socket.id) || 0;
      if (now - lastBeat < HEARTBEAT_MIN_INTERVAL_MS) return;
      heartbeatTimestamps.set(socket.id, now);

      const progress = data.progress ?? data.currentTime; // Handle both formats
      if (progress === undefined || isNaN(progress)) return;

      const roomState = roomStates.get(data.roomId);
      if (roomState) {
        roomState.videoProgress = progress;
        roomState.serverTimeUpdatedAt = now;

        // Stamp with server time exactly before emitting, volatile to drop stale ones
        socket.to(data.roomId).volatile.emit("sync:heartbeat", {
          progress,
          serverTime: now,
          currentTime: progress, // send both for backwards compat
        });
      }
    },
  );

  // Uploaded file playback sync
  socket.on(
    "sync:play",
    (data: { roomId: string; currentTime: number; serverTime: number }) => {
      const roomState = roomStates.get(data.roomId);
      if (roomState) {
        roomState.status = "PLAYING";
        roomState.videoProgress = data.currentTime;
        roomState.serverTimeUpdatedAt = Date.now();
        socket.to(data.roomId).emit("sync:play", {
          ...data,
          serverTime: Date.now(), // Re-stamp with accurate server time
        });
      }
    },
  );

  socket.on(
    "sync:pause",
    (data: { roomId: string; currentTime: number }) => {
      const roomState = roomStates.get(data.roomId);
      if (roomState) {
        roomState.status = "PAUSED";
        roomState.videoProgress = data.currentTime;
        roomState.serverTimeUpdatedAt = Date.now();
        socket.to(data.roomId).emit("sync:pause", data);
      }
    },
  );

  socket.on(
    "sync:seek",
    (data: { roomId: string; currentTime: number; serverTime: number }) => {
      const roomState = roomStates.get(data.roomId);
      if (roomState) {
        roomState.videoProgress = data.currentTime;
        roomState.serverTimeUpdatedAt = Date.now();
        socket.to(data.roomId).emit("sync:seek", {
          ...data,
          serverTime: Date.now(), // Re-stamp with accurate server time
        });
      }
    },
  );

  // ─── Disconnect: Clean up socket-room mapping and Redis ──────────
  socket.on("disconnect", () => {
    console.log(`[SOCKET] User disconnected: ${socket.id}`);

    // Clean up rate limiter
    heartbeatTimestamps.delete(socket.id);

    // Clean up participant tracking
    const mapping = socketRoomMap.get(socket.id);
    if (mapping) {
      const { roomId, userId } = mapping;
      socketRoomMap.delete(socket.id);

      // Update participant count for remaining users
      const participantCount =
        io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit("room:participant-count", {
        count: participantCount,
      });

      // Remove from Redis participant set (fire-and-forget)
      const redis = getRedis();
      redis
        .srem(`room:${roomId}:participants`, userId)
        .catch((err) =>
          console.error("[REDIS] Failed to remove participant:", err),
        );
    }
  });
});

// REST endpoints
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.post("/rooms/create", async (req: Request, res: Response) => {
  try {
    const { roomId, hostId, title, hostName, hostEmail } = req.body;
    const redis = getRedis();

    // Generate roomId if not provided
    const finalRoomId = roomId || `room-${Date.now()}`;

    // Ensure user exists
    const userJson = await redis.hget(`users`, hostId);
    if (!userJson) {
      const newUser = {
        id: hostId,
        name: hostName || "Host",
        email: hostEmail || `${hostId}@syncplay.local`,
      };
      await redis.hset(`users`, hostId, JSON.stringify(newUser));
    }

    await saveRoomToRedis(
      finalRoomId,
      hostId,
      title || `Room ${finalRoomId.slice(0, 8)}`,
    );
    res.json({ roomId: finalRoomId });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.get("/rooms/active", async (req: Request, res: Response) => {
  try {
    const redis = getRedis();
    const rooms = await redis.hgetall(`rooms`);

    const activeRooms = [];
    for (const roomId in rooms) {
      const r = JSON.parse(rooms[roomId]);
      if (r.isActive) {
        const hostJson = await redis.hget(`users`, r.hostId);
        const hostName = hostJson ? JSON.parse(hostJson).name : "Unknown";
        const participantCount = await redis.scard(
          `room:${roomId}:participants`,
        );

        activeRooms.push({
          id: r.id,
          title: r.title,
          hostId: r.hostId,
          hostName,
          currentVideoId: r.currentVideoId,
          participantCount,
          createdAt: r.createdAt,
        });
      }
    }

    activeRooms.sort((a, b) => b.participantCount - a.participantCount);
    res.json(activeRooms.slice(0, 10));
  } catch (error) {
    console.error("Error fetching active rooms:", error);
    res.status(500).json({ error: "Failed to fetch active rooms" });
  }
});

app.get("/users/:userId/history", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const redis = getRedis();

    const allRooms = await redis.hgetall(`rooms`);
    const hosted = [];
    for (const roomId in allRooms) {
      const r = JSON.parse(allRooms[roomId]);
      if (r.hostId === userId) {
        hosted.push(r);
      }
    }
    hosted.sort((a, b) => b.createdAt - a.createdAt);

    const joinedIds = await redis.smembers(`user:${userId}:history`);
    const joined = [];
    for (const roomId of joinedIds) {
      if (allRooms[roomId]) {
        const r = JSON.parse(allRooms[roomId]);
        if (r.hostId !== userId) {
          joined.push(r);
        }
      }
    }
    joined.sort((a, b) => b.createdAt - a.createdAt);

    res.json({ hosted, joined });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

app.delete("/history/hosted/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const redis = getRedis();

    const roomJson = await redis.hget(`rooms`, roomId);
    if (!roomJson) return res.status(404).json({ error: "Not found" });
    const room = JSON.parse(roomJson);

    if (room.hostId !== userId)
      return res.status(403).json({ error: "Unauthorized" });

    await redis.hdel(`rooms`, roomId);
    await redis.del(`room:${roomId}:participants`);
    roomStates.delete(roomId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete room" });
  }
});

app.delete("/history/joined/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    const redis = getRedis();

    await redis.srem(`user:${String(userId)}:history`, roomId);
    await redis.srem(`room:${roomId}:participants`, String(userId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete history" });
  }
});

app.get("/rooms/:roomId/info", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const redis = getRedis();
    const roomJson = await redis.hget(`rooms`, roomId);
    if (!roomJson) {
      return res.status(404).json({ error: "Room not found" });
    }
    const room = JSON.parse(roomJson);
    const participantCount = await redis.scard(`room:${roomId}:participants`);

    res.json({
      id: room.id,
      hostId: room.hostId,
      title: room.title,
      isActive: room.isActive,
      participantCount,
    });
  } catch (error) {
    console.error("Error fetching room info:", error);
    res.status(500).json({ error: "Failed to fetch room info" });
  }
});

const PORT = process.env.PORT || 4000;

// Set Socket IO instance in transcoder worker
setWorkerIO(io);

// Start worker but don't crash if Redis is unavailable yet
let worker: any = null;
try {
  worker = startTranscodingWorker();
} catch (e) {
  console.log(
    "[WORKER] Transcoding worker failed to start. Ensure Redis is running.",
  );
}

httpServer.listen(PORT, async () => {
  console.log(`\n🚀 YouTube Sync Server is running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   HTTP: http://localhost:${PORT}`);
  console.log(`   HLS: http://localhost:${PORT}/hls/`);

  // Verify Redis connection
  const redis = getRedis();
  try {
    await redis.ping();
    console.log("[REDIS] Connection verified");
  } catch (err: any) {
    console.error("[REDIS] Connection failed:", err.message);
    console.error(
      "[REDIS] Make sure Redis is running. Try: docker compose up redis -d",
    );
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n📴 Shutting down server...");
  if (worker) await worker.close();
  await closeRedis();
  httpServer.close();
  process.exit(0);
});
