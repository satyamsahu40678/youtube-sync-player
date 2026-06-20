import { Worker, Job } from "bullmq";
import { createBullMQConnection } from "../services/redis";
import { startTranscoding } from "../services/transcoder";
import { Server as SocketIOServer } from "socket.io";

export interface TranscodeJobData {
  roomId: string;
  inputPath: string;
  fileType: "video" | "audio";
}

let io: SocketIOServer | null = null;

/**
 * Set the Socket.io instance so the worker can emit progress updates to clients.
 */
export function setWorkerIO(socketIO: SocketIOServer): void {
  io = socketIO;
}

/**
 * Start the BullMQ transcoding worker.
 * Processes transcoding jobs one at a time to avoid overloading CPU.
 */
export function startTranscodingWorker(): Worker {
  const connection = createBullMQConnection();

  const worker = new Worker<TranscodeJobData>(
    "transcoding",
    async (job: Job<TranscodeJobData>) => {
      const { roomId, inputPath, fileType } = job.data;
      console.log(
        `[WORKER] Starting transcoding for room ${roomId} (${fileType})`,
      );

      const hlsUrl = await startTranscoding(
        roomId,
        inputPath,
        fileType,
        (quality: string, percent: number) => {
          // Emit progress to all clients in the room
          if (io) {
            io.to(roomId).emit("transcode:progress", { quality, percent });
          }
          // Update job progress
          job.updateProgress({ quality, percent });
        },
      );

      // Update in-memory room state so new viewers get it immediately
      const { getOrCreateRoomState } = require("../state");
      const roomState = getOrCreateRoomState(roomId);
      roomState.hlsStatus = "ready";
      roomState.hlsUrl = hlsUrl;
      roomState.fileType = fileType;

      // Notify all clients that the stream is ready
      if (io) {
        io.to(roomId).emit("stream:ready", { hlsUrl, fileType });
        io.to(roomId).emit("room:state", roomState);
      }

      console.log(
        `[WORKER] Transcoding complete for room ${roomId}: ${hlsUrl}`,
      );
      return { hlsUrl };
    },
    {
      connection: connection as any,
      concurrency: 1, // Process one job at a time (FFmpeg is CPU-heavy)
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  );

  worker.on("completed", (job: Job<TranscodeJobData> | undefined) => {
    if (job) {
      console.log(
        `[WORKER] Job ${job.id} completed for room ${job.data.roomId}`,
      );
    }
  });

  worker.on("failed", (job: Job<TranscodeJobData> | undefined, err: Error) => {
    console.error(`[WORKER] Job ${job?.id} failed:`, err.message);
    if (job && io) {
      io.to(job.data.roomId).emit("transcode:error", {
        message: "Transcoding failed. Please try uploading again.",
      });
    }
  });

  console.log("[WORKER] Transcoding worker started");
  return worker;
}
