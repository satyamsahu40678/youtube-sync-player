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
  socket.on("room:join", async (data: { roomId: string; userId: string; userName?: string; userEmail?: string }) => {
    const { roomId, userId, userName, userEmail } = data;

    try {
      // Join Socket.io room
      socket.join(roomId);
      console.log(`[ROOM] User ${userId} joined room ${roomId}`);

      // Get or create room state
      let roomState = roomStates.get(roomId);
      if (!roomState) {
        roomState = {
          videoId: null,
          videoTitle: null,
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

      // Log to database robustly
      try {
        // Ensure user exists
        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              id: userId,
              email: userEmail || `${userId}@guest.local`,
              name: userName || `Guest ${userId.slice(0, 4)}`,
            },
          });
        }

        // Ensure room exists
        let room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room) {
          room = await prisma.room.create({
            data: {
              id: roomId,
              hostId: userId, // Default to first person joining if not created via REST
              title: `Room ${roomId.slice(0, 8)}`,
              isActive: true,
            },
          });
        }

        // Create participant
        await prisma.sessionParticipant.create({
          data: {
            roomId,
            userId,
          },
        });
      } catch (dbErr) {
        console.error("DB error creating participant/room:", dbErr);
      }
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Host updates video
  socket.on(
    "room:update-video",
    async (data: { roomId: string; videoId: string }) => {
      const { roomId, videoId } = data;
      const roomState = roomStates.get(roomId) || {
        videoId: null,
        videoTitle: null,
        status: "PAUSED",
        videoProgress: 0,
        serverTimeUpdatedAt: Date.now(),
      };

      roomState.videoId = videoId;
      roomState.videoTitle = `Room ${roomId.slice(0, 8)}`;
      roomState.videoProgress = 0;
      roomState.status = "PLAYING";
      roomState.serverTimeUpdatedAt = Date.now();

      roomStates.set(roomId, roomState);
      console.log(`[ROOM] Room ${roomId} video updated to ${videoId}`);

      io.to(roomId).emit("room:state", roomState as RoomStateMessage);

      // Save to DB and fetch real YouTube title
      try {
        let videoTitle = `Room ${roomId.slice(0, 8)}`;
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          const response = await fetch(oembedUrl);
          if (response.ok) {
            const data = await response.json() as any;
            if (data && data.title) {
              videoTitle = data.title;
              roomState.videoTitle = videoTitle;
              io.to(roomId).emit("room:state", roomState as RoomStateMessage);
            }
          }
        } catch (fetchErr) {
          console.error("Failed to fetch YouTube oEmbed title", fetchErr);
        }

        await prisma.room.update({
          where: { id: roomId },
          data: { 
            currentVideoId: videoId,
            title: videoTitle
          },
        });
      } catch (err) {
        console.error("Failed to update room video in DB:", err);
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

      // We don't log periodic seeks to console to avoid spam
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
    const { roomId, hostId, title, hostName, hostEmail } = req.body;

    // Ensure user exists or create it
    let user = await prisma.user.findUnique({
      where: { id: hostId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: hostId,
          name: hostName || "Host",
          email: hostEmail || `${hostId}@syncplay.local`,
        },
      });
    }

    const room = await prisma.room.create({
      data: {
        id: roomId, // Use explicit ID from client
        hostId: user.id,
        title: title || `Room ${roomId.slice(0, 8)}`,
      },
    });

    res.json({ roomId: room.id });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.get("/rooms/active", async (req: Request, res: Response) => {
  try {
    const activeRooms = await prisma.room.findMany({
      where: { isActive: true },
      include: {
        host: true,
        participants: true,
      },
      orderBy: {
        participants: {
          _count: "desc",
        },
      },
      take: 10,
    });
    
    const result = activeRooms.map((r) => ({
      id: r.id,
      title: r.title,
      hostId: r.hostId,
      hostName: r.host.name,
      currentVideoId: r.currentVideoId,
      participantCount: r.participants.length,
      createdAt: r.createdAt,
    }));
    
    res.json(result);
  } catch (error) {
    console.error("Error fetching active rooms:", error);
    res.status(500).json({ error: "Failed to fetch active rooms" });
  }
});

app.get("/users/:userId/history", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const hosted = await prisma.room.findMany({
      where: { hostId: userId },
      orderBy: { createdAt: "desc" },
    });
    
    const participations = await prisma.sessionParticipant.findMany({
      where: { userId },
      include: { room: true },
      orderBy: { joinedAt: "desc" },
    });
    
    const joinedRoomMap = new Map();
    for (const p of participations) {
      if (p.room.hostId !== userId && !joinedRoomMap.has(p.roomId)) {
        joinedRoomMap.set(p.roomId, p.room);
      }
    }
    
    res.json({
      hosted,
      joined: Array.from(joinedRoomMap.values()),
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

app.delete("/history/hosted/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;
    
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.hostId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    await prisma.room.delete({ where: { id: roomId } });
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
    
    await prisma.sessionParticipant.deleteMany({
      where: { roomId, userId: String(userId) },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete history" });
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
