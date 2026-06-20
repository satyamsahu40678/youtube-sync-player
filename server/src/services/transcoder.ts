import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { getRedis } from "./redis";

// Quality ladders
export const VIDEO_QUALITIES = [
  {
    name: "360p",
    width: 640,
    height: 360,
    videoBitrate: "500k",
    audioBitrate: "96k",
  },
  {
    name: "480p",
    width: 854,
    height: 480,
    videoBitrate: "1000k",
    audioBitrate: "128k",
  },
  {
    name: "720p",
    width: 1280,
    height: 720,
    videoBitrate: "2500k",
    audioBitrate: "192k",
  },
  {
    name: "1080p",
    width: 1920,
    height: 1080,
    videoBitrate: "5000k",
    audioBitrate: "256k",
  },
];

export const AUDIO_QUALITIES = [
  { name: "low", bitrate: "64k" },
  { name: "mid", bitrate: "128k" },
  { name: "high", bitrate: "256k" },
  { name: "lossless", bitrate: "320k" },
];

/**
 * Get the input file's video resolution to determine which quality levels to produce.
 */
function probeResolution(
  inputPath: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(
        (s) => s.codec_type === "video",
      );
      if (!videoStream || !videoStream.width || !videoStream.height) {
        return resolve({ width: 1920, height: 1080 }); // default
      }
      resolve({ width: videoStream.width, height: videoStream.height });
    });
  });
}

/**
 * Main entry point: transcode a file into HLS segments at multiple quality levels.
 */
export async function startTranscoding(
  roomId: string,
  inputPath: string,
  fileType: "video" | "audio",
  onProgress?: (quality: string, percent: number) => void,
): Promise<string> {
  const hlsBaseDir = path.resolve(__dirname, "../../../hls");
  const outputDir = path.join(hlsBaseDir, roomId);
  fs.mkdirSync(outputDir, { recursive: true });

  const redis = getRedis();
  await redis.set(`room:${roomId}:status`, "transcoding");

  try {
    if (fileType === "video") {
      await transcodeVideo(roomId, inputPath, outputDir, onProgress);
    } else {
      await transcodeAudio(roomId, inputPath, outputDir, onProgress);
    }

    // Generate master playlist
    generateMasterPlaylist(roomId, outputDir, fileType);

    const hlsUrl = `/hls/${roomId}/master.m3u8`;

    // Store in Redis
    await redis.set(`room:${roomId}:hlsUrl`, hlsUrl);
    await redis.set(`room:${roomId}:status`, "ready");
    await redis.set(`room:${roomId}:fileType`, fileType);

    // Clean up the assembled source file
    try {
      fs.unlinkSync(inputPath);
    } catch {
      // ignore
    }

    return hlsUrl;
  } catch (err) {
    console.error("[TRANSCODER] Transcoding failed:", err);
    await redis.set(`room:${roomId}:status`, "error");
    throw err;
  }
}

/**
 * Transcode video to multiple HLS quality levels in parallel.
 */
async function transcodeVideo(
  roomId: string,
  inputPath: string,
  outputDir: string,
  onProgress?: (quality: string, percent: number) => void,
): Promise<void> {
  // Probe input resolution to skip unnecessary upscaling
  const { width: srcWidth, height: srcHeight } =
    await probeResolution(inputPath);

  // Only produce qualities that don't upscale
  const qualities = VIDEO_QUALITIES.filter((q) => q.height <= srcHeight);
  if (qualities.length === 0) {
    // If source is smaller than 360p, produce at least one level at source size
    qualities.push({
      name: `${srcHeight}p`,
      width: srcWidth,
      height: srcHeight,
      videoBitrate: "500k",
      audioBitrate: "96k",
    });
  }

  const promises = qualities.map((q) => {
    return new Promise<void>((resolve, reject) => {
      const qualityDir = path.join(outputDir, q.name);
      fs.mkdirSync(qualityDir, { recursive: true });

      ffmpeg(inputPath)
        .videoCodec("libx264")
        .audioCodec("aac")
        .size(`${q.width}x${q.height}`)
        .videoBitrate(q.videoBitrate)
        .audioBitrate(q.audioBitrate)
        .outputOptions([
          "-preset fast",
          "-crf 23",
          "-sc_threshold 0",
          "-g 48",
          "-keyint_min 48",
          "-hls_time 6",
          "-hls_list_size 0",
          "-hls_segment_filename",
          path.join(qualityDir, "seg_%03d.ts"),
          "-f hls",
        ])
        .output(path.join(qualityDir, "index.m3u8"))
        .on("progress", (progress) => {
          const pct = Math.round(progress.percent ?? 0);
          onProgress?.(q.name, pct);
        })
        .on("end", () => {
          onProgress?.(q.name, 100);
          resolve();
        })
        .on("error", (err) => {
          console.error(
            `[TRANSCODER] Error transcoding ${q.name}:`,
            err.message,
          );
          reject(err);
        })
        .run();
    });
  });

  await Promise.all(promises);
}

/**
 * Transcode audio to multiple HLS quality levels in parallel.
 */
async function transcodeAudio(
  roomId: string,
  inputPath: string,
  outputDir: string,
  onProgress?: (quality: string, percent: number) => void,
): Promise<void> {
  const promises = AUDIO_QUALITIES.map((q) => {
    return new Promise<void>((resolve, reject) => {
      const qualityDir = path.join(outputDir, q.name);
      fs.mkdirSync(qualityDir, { recursive: true });

      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("aac")
        .audioBitrate(q.bitrate)
        .outputOptions([
          "-hls_time 6",
          "-hls_list_size 0",
          "-hls_segment_filename",
          path.join(qualityDir, "seg_%03d.ts"),
          "-f hls",
        ])
        .output(path.join(qualityDir, "index.m3u8"))
        .on("progress", (progress) => {
          const pct = Math.round(progress.percent ?? 0);
          onProgress?.(q.name, pct);
        })
        .on("end", () => {
          onProgress?.(q.name, 100);
          resolve();
        })
        .on("error", (err) => {
          console.error(
            `[TRANSCODER] Error transcoding ${q.name}:`,
            err.message,
          );
          reject(err);
        })
        .run();
    });
  });

  await Promise.all(promises);
}

/**
 * Generate master HLS playlist pointing to all quality-level sub-playlists.
 */
function generateMasterPlaylist(
  roomId: string,
  outputDir: string,
  fileType: "video" | "audio",
): void {
  let manifest = "#EXTM3U\n#EXT-X-VERSION:3\n\n";

  if (fileType === "video") {
    // Only include quality dirs that actually exist
    const existingQualities = VIDEO_QUALITIES.filter((q) =>
      fs.existsSync(path.join(outputDir, q.name, "index.m3u8")),
    );

    // Also check for custom resolution dir
    const dirs = fs.readdirSync(outputDir, { withFileTypes: true });
    const allQualityDirs = dirs
      .filter(
        (d) =>
          d.isDirectory() &&
          fs.existsSync(path.join(outputDir, d.name, "index.m3u8")),
      )
      .map((d) => d.name);

    for (const dirName of allQualityDirs) {
      const q = existingQualities.find((vq) => vq.name === dirName);
      if (q) {
        const bw = parseInt(q.videoBitrate) * 1000;
        manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${q.width}x${q.height},NAME="${q.name}"\n`;
        manifest += `${q.name}/index.m3u8\n\n`;
      } else {
        // Custom resolution fallback
        manifest += `#EXT-X-STREAM-INF:BANDWIDTH=500000,NAME="${dirName}"\n`;
        manifest += `${dirName}/index.m3u8\n\n`;
      }
    }
  } else {
    for (const q of AUDIO_QUALITIES) {
      if (fs.existsSync(path.join(outputDir, q.name, "index.m3u8"))) {
        const bw = parseInt(q.bitrate) * 1000;
        manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bw},NAME="${q.name}"\n`;
        manifest += `${q.name}/index.m3u8\n\n`;
      }
    }
  }

  const masterPath = path.join(outputDir, "master.m3u8");
  fs.writeFileSync(masterPath, manifest);
}
