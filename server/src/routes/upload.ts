import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Queue } from "bullmq";
import { createBullMQConnection } from "../services/redis";
import { getRedis } from "../services/redis";
import { ChunkUploadBody, RoomState } from "../types";

const router = express.Router();

// BullMQ queue for transcoding jobs
const transcodingQueue = new Queue("transcoding", {
  connection: createBullMQConnection() as any,
});

// Multer storage: write chunks to uploads/chunks/{roomId}/
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const roomId = req.headers["x-room-id"] as string;
    const dir = path.resolve(__dirname, `../../../uploads/chunks/${roomId}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, _file, cb) => {
    const chunkIndex = req.headers["x-chunk-index"] as string;
    cb(null, `chunk_${chunkIndex}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per chunk
});

/**
 * POST /api/upload/chunk
 * Receives individual file chunks. When the last chunk arrives, assembles and queues transcoding.
 */
router.post("/chunk", upload.single("chunk"), async (req, res) => {
  try {
    const { roomId, chunkIndex, totalChunks, fileName, fileType } =
      req.body as ChunkUploadBody;

    if (
      !roomId ||
      chunkIndex === undefined ||
      !totalChunks ||
      !fileName ||
      !fileType
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const currentIndex = parseInt(chunkIndex);
    const total = parseInt(totalChunks);

    res.json({ success: true, received: currentIndex });

    // Update room status
    const redis = getRedis();
    const raw = await redis.hget("rooms", roomId);
    if (raw) {
      const room = JSON.parse(raw);
      room.hlsStatus = "uploading";
      room.fileName = fileName;
      room.fileType = fileType as "video" | "audio";
      await redis.hset("rooms", roomId, JSON.stringify(room));
    }

    const { getOrCreateRoomState } = require("../state");
    const roomState = getOrCreateRoomState(roomId);
    roomState.hlsStatus = "uploading";
    roomState.fileName = fileName;
    roomState.fileType = fileType as "video" | "audio";

    // If this is the last chunk, assemble and transcode
    if (currentIndex === total - 1) {
      // Wait briefly for all chunks to flush to disk
      await new Promise((resolve) => setTimeout(resolve, 500));
      await assembleAndQueue(
        roomId,
        total,
        fileName,
        fileType as "video" | "audio",
      );
    }
  } catch (err) {
    console.error("[UPLOAD] Error processing chunk:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * Assemble chunks into a single file and queue the transcoding job.
 */
async function assembleAndQueue(
  roomId: string,
  totalChunks: number,
  fileName: string,
  fileType: "video" | "audio",
): Promise<void> {
  const uploadsBase = path.resolve(__dirname, "../../../uploads");
  const chunksDir = path.join(uploadsBase, "chunks", roomId);
  const assembledDir = path.join(uploadsBase, "assembled");
  fs.mkdirSync(assembledDir, { recursive: true });

  const outputPath = path.join(assembledDir, `${roomId}_${fileName}`);
  const writeStream = fs.createWriteStream(outputPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunksDir, `chunk_${i}`);
    if (!fs.existsSync(chunkPath)) {
      console.error(`[UPLOAD] Missing chunk ${i} for room ${roomId}`);
      throw new Error(`Missing chunk ${i}`);
    }
    const data = fs.readFileSync(chunkPath);
    writeStream.write(data);
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on("error", reject);
  });

  // Clean up chunk files
  try {
    fs.rmSync(chunksDir, { recursive: true });
  } catch {
    // ignore
  }

  console.log(`[UPLOAD] Assembled ${totalChunks} chunks → ${outputPath}`);

  // Queue transcoding job
  await transcodingQueue.add("transcode", {
    roomId,
    inputPath: outputPath,
    fileType,
  });

  // Update room status
  const redis = getRedis();
  const raw = await redis.hget("rooms", roomId);
  if (raw) {
    const room = JSON.parse(raw);
    room.hlsStatus = "transcoding";
    await redis.hset("rooms", roomId, JSON.stringify(room));
  }

  const { getOrCreateRoomState } = require("../state");
  const roomState = getOrCreateRoomState(roomId);
  roomState.hlsStatus = "transcoding";

  console.log(`[UPLOAD] Transcoding job queued for room ${roomId}`);
}

export default router;
