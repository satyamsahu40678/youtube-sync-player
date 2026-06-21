"use client";

import { useState, useCallback, useRef } from "react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "";
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000; // 1s base, exponential backoff

/**
 * Detect file type by extension first (more reliable than MIME),
 * then fall back to MIME type.
 */
function detectFileType(file: File): "video" | "audio" {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const videoExtensions = new Set([
    "mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v",
    "mpg", "mpeg", "3gp", "ogv", "ts", "mts",
  ]);
  const audioExtensions = new Set([
    "mp3", "wav", "flac", "aac", "ogg", "wma", "m4a", "opus",
    "aiff", "alac", "ape", "wv",
  ]);

  if (videoExtensions.has(ext)) return "video";
  if (audioExtensions.has(ext)) return "audio";

  // Fall back to MIME type
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";

  // Default to video for unknown types
  return "video";
}

/**
 * Upload a single chunk with retry logic (exponential backoff).
 */
async function uploadChunkWithRetry(
  chunk: Blob,
  formData: FormData,
  roomId: string,
  chunkIndex: number,
  abortSignal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${SERVER_URL}/api/upload/chunk`, {
        method: "POST",
        headers: {
          "x-room-id": roomId,
          "x-chunk-index": String(chunkIndex),
        },
        body: formData,
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return; // Success
    } catch (err) {
      if (abortSignal?.aborted) throw err; // Don't retry if cancelled
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        console.warn(
          `[UPLOAD] Chunk ${chunkIndex} attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Chunked file upload hook.
 * Slices files into 5MB chunks and uploads sequentially with progress tracking.
 * Features: retry logic, cancellation support, proper file type detection.
 */
export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const uploadFile = useCallback(async (file: File, roomId: string) => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileType = detectFileType(file);

    try {
      for (let i = 0; i < totalChunks; i++) {
        if (abortController.signal.aborted) {
          throw new Error("Upload cancelled");
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("roomId", roomId);
        formData.append("chunkIndex", String(i));
        formData.append("totalChunks", String(totalChunks));
        formData.append("fileName", file.name);
        formData.append("fileType", fileType);

        await uploadChunkWithRetry(
          chunk,
          formData,
          roomId,
          i,
          abortController.signal,
        );

        setProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      setIsUploading(false);
      abortControllerRef.current = null;
      return { success: true, fileType };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setIsUploading(false);
      abortControllerRef.current = null;
      return { success: false, fileType };
    }
  }, []);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsUploading(false);
      setError("Upload cancelled");
    }
  }, []);

  return { uploadFile, cancelUpload, progress, isUploading, error };
}
