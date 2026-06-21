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

    // Update room status
    const { getOrCreateRoomState } = require("../state");
    const roomState = getOrCreateRoomState(roomId);
    roomState.hlsStatus = "uploading";
    roomState.fileName = fileName;
    roomState.fileType = fileType as "video" | "audio";

    // Update Redis in background (don't block response)
    const redis = getRedis();
    redis
      .hget("rooms", roomId)
      .then((raw) => {
        if (raw) {
          const room = JSON.parse(raw);
          room.hlsStatus = "uploading";
          room.fileName = fileName;
          room.fileType = fileType as "video" | "audio";
          return redis.hset("rooms", roomId, JSON.stringify(room));
        }
      })
      .catch((err) => console.error("[UPLOAD] Redis update error:", err));

    // If this is the last chunk, assemble and transcode BEFORE responding
    if (currentIndex === total - 1) {
      try {
        // Verify all chunks exist before assembly
        const chunksDir = path.resolve(
          __dirname,
          `../../../uploads/chunks/${roomId}`,
        );
        const missingChunks: number[] = [];
        for (let i = 0; i < total; i++) {
          const chunkPath = path.join(chunksDir, `chunk_${i}`);
          if (!fs.existsSync(chunkPath)) {
            missingChunks.push(i);
          }
        }

        if (missingChunks.length > 0) {
          console.error(
            `[UPLOAD] Missing chunks for room ${roomId}: ${missingChunks.join(", ")}`,
          );
          return res.status(400).json({
            error: `Missing chunks: ${missingChunks.join(", ")}`,
            success: false,
          });
        }

        // All chunks present — respond success, then assemble in background
        res.json({ success: true, received: currentIndex, complete: true });

        // Assembly and transcoding happen after response
        await assembleAndQueue(
          roomId,
          total,
          fileName,
          fileType as "video" | "audio",
        );
      } catch (assemblyErr) {
        console.error("[UPLOAD] Assembly failed:", assemblyErr);
        // Response already sent, notify via socket
        roomState.hlsStatus = "error";
      }
    } else {
      // Intermediate chunk — respond immediately
      res.json({ success: true, received: currentIndex });
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

  // Verify assembled file exists and has content
  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    throw new Error("Assembled file is empty");
  }

  // Clean up chunk files
  try {
    fs.rmSync(chunksDir, { recursive: true });
  } catch {
    // ignore
  }

  console.log(
    `[UPLOAD] Assembled ${totalChunks} chunks → ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`,
  );

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
