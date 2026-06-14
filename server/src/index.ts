import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import prisma from "./db";
import { ClockSyncResponse, RoomState, RoomStateMessage } from "./types";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// In-memory room states (in production, use Redis)
const roomStates: Map<string, RoomState> = new Map();

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
  socket.on("room:join", async (data: { roomId: string; userId: string }) => {
    const { roomId, userId } = data;

    try {
      // Join Socket.io room
      socket.join(roomId);
      console.log(`[ROOM] User ${userId} joined room ${roomId}`);

      // Get or create room state
      let roomState = roomStates.get(roomId);
      if (!roomState) {
        roomState = {
          videoId: null,
          status: "PAUSED",
          videoProgress: 0,
          serverTimeUpdatedAt: Date.now(),
        };
        roomStates.set(roomId, roomState);
      }

      // Send current room state to the joining user
      socket.emit("room:state", roomState as RoomStateMessage);

      // Broadcast updated participant count
      const participantCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit("room:participant-count", { count: participantCount });

      // Log to database (async, non-blocking)
      prisma.sessionParticipant
        .create({
          data: {
            roomId,
            userId,
          },
        })
        .catch((err) => console.error("DB error creating participant:", err));
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Host updates video
  socket.on(
    "room:update-video",
    (data: { roomId: string; videoId: string }) => {
      const { roomId, videoId } = data;
      const roomState = roomStates.get(roomId) || {
        videoId: null,
        status: "PAUSED",
        videoProgress: 0,
        serverTimeUpdatedAt: Date.now(),
      };

      roomState.videoId = videoId;
      roomState.videoProgress = 0;
      roomState.status = "PLAYING";
      roomState.serverTimeUpdatedAt = Date.now();

      roomStates.set(roomId, roomState);
      console.log(`[ROOM] Room ${roomId} video updated to ${videoId}`);

      io.to(roomId).emit("room:state", roomState as RoomStateMessage);
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

      console.log(`[ROOM] Room ${roomId} seeked to ${progress}s`);
      io.to(roomId).emit("room:state", roomState as RoomStateMessage);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[SOCKET] User disconnected: ${socket.id}`);
  });
});

// REST endpoints
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.post("/rooms/create", async (req: Request, res: Response) => {
  try {
    const { hostId, title } = req.body;

    // Ensure user exists or create it
    let user = await prisma.user.findUnique({
      where: { id: hostId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: hostId,
          name: "Host",
          email: `${hostId}@syncplay.local`,
        },
      });
    }

    const room = await prisma.room.create({
      data: {
        hostId: user.id,
        title,
      },
    });

    res.json({ roomId: room.id });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.get("/rooms/:roomId/info", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { host: true, participants: true },
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({
      id: room.id,
      hostId: room.hostId,
      title: room.title,
      isActive: room.isActive,
      participantCount: room.participants.length,
    });
  } catch (error) {
    console.error("Error fetching room info:", error);
    res.status(500).json({ error: "Failed to fetch room info" });
  }
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`\n🚀 YouTube Sync Server is running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   HTTP: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n📴 Shutting down server...");
  await prisma.$disconnect();
  process.exit(0);
});
