"use client";

import { useState, useCallback } from "react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Chunked file upload hook.
 * Slices files into 5MB chunks and uploads sequentially with progress tracking.
 */
export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File, roomId: string) => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const isVideo = file.type.startsWith("video/") || file.name.match(/\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i);
    const fileType = isVideo ? "video" : "audio";

    try {
      for (let i = 0; i < totalChunks; i++) {
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

        const response = await fetch(`${SERVER_URL}/api/upload/chunk`, {
          method: "POST",
          headers: {
            "x-room-id": roomId,
            "x-chunk-index": String(i),
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks}`);
        }

        setProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      setIsUploading(false);
      return { success: true, fileType };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      setIsUploading(false);
      return { success: false, fileType };
    }
  }, []);

  return { uploadFile, progress, isUploading, error };
}
