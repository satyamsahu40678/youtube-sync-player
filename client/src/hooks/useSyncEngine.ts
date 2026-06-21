"use client";

import { useEffect, useRef, useCallback } from "react";
import { Socket } from "socket.io-client";
import { PlaybackRateController } from "@/lib/sync";
import { MediaState, SyncStatus } from "@/lib/types";

interface UseSyncEngineOptions {
  roomId: string;
  socket: Socket | null;
  isHost: boolean;
  serverNow: () => number;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  onSyncStatusChange?: (status: SyncStatus) => void;
}

/**
 * Core sync engine hook.
 * HOST mode: captures play/pause/seek events from the media element and emits them via Socket.io.
 * VIEWER mode: receives sync events and applies them to the media element with drift correction.
 *
 * Improvements:
 * - Jitter buffer: averages 2-3 heartbeats before adjusting
 * - Adaptive hard-seek threshold based on RTT
 * - No more setTimeout-based rate reset (PID controller handles it)
 */
export function useSyncEngine({
  roomId,
  socket,
  isHost,
  serverNow,
  mediaRef,
  onSyncStatusChange,
}: UseSyncEngineOptions) {
  const rateControllerRef = useRef(new PlaybackRateController());
  const isSyncingRef = useRef(false); // Guard to prevent echo loops
  const heartbeatBufferRef = useRef<number[]>([]); // Jitter buffer for drift samples

  // ─── HOST MODE ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !socket || !mediaRef.current || !roomId) return;
    const media = mediaRef.current;

    const onPlay = () => {
      if (isSyncingRef.current) return;
      socket.emit("sync:play", {
        roomId,
        currentTime: media.currentTime,
        serverTime: serverNow(),
      });
    };

    const onPause = () => {
      if (isSyncingRef.current) return;
      socket.emit("sync:pause", {
        roomId,
        currentTime: media.currentTime,
      });
    };

    const onSeeked = () => {
      if (isSyncingRef.current) return;
      socket.emit("sync:seek", {
        roomId,
        currentTime: media.currentTime,
        serverTime: serverNow(),
      });
    };

    // Heartbeat: broadcast position every 500ms (was 2000ms — faster = lower latency)
    const heartbeat = setInterval(() => {
      if (!media.paused && !media.ended) {
        socket.emit("sync:heartbeat", {
          roomId,
          currentTime: media.currentTime,
        });
      }
    }, 500);

    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("seeked", onSeeked);

    return () => {
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("seeked", onSeeked);
      clearInterval(heartbeat);
    };
  }, [isHost, socket, serverNow, mediaRef, roomId]);

  // ─── VIEWER MODE ────────────────────────────────────────────────
  useEffect(() => {
    if (isHost || !socket || !mediaRef.current) return;
    const media = mediaRef.current;
    const rateCtrl = rateControllerRef.current;

    const handlePlay = (data: MediaState) => {
      isSyncingRef.current = true;
      const elapsed = (serverNow() - data.serverTime) / 1000;
      const targetTime = data.currentTime + Math.max(0, elapsed);
      media.currentTime = targetTime;
      media.play().catch(() => {});
      rateCtrl.reset();
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handlePause = (data: MediaState) => {
      isSyncingRef.current = true;
      media.currentTime = data.currentTime;
      media.pause();
      rateCtrl.reset();
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handleSeek = (data: MediaState) => {
      isSyncingRef.current = true;
      const elapsed = (serverNow() - data.serverTime) / 1000;
      media.currentTime = data.currentTime + Math.max(0, elapsed);
      rateCtrl.reset();
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handleHeartbeat = (data: {
      currentTime: number;
      serverTime: number;
    }) => {
      if (media.paused) return;

      const elapsed = Math.max(0, (serverNow() - data.serverTime) / 1000);
      const expectedTime = data.currentTime + elapsed;
      const actualTime = media.currentTime;
      const drift = expectedTime - actualTime; // positive = we're behind
      const driftMs = drift * 1000;

      // Jitter buffer: collect 2 samples before acting to smooth network jitter
      const buffer = heartbeatBufferRef.current;
      buffer.push(driftMs);
      if (buffer.length < 2) return; // Wait for 2 samples

      // Use median of buffered samples
      const sorted = [...buffer].sort((a, b) => a - b);
      const medianDrift = sorted[Math.floor(sorted.length / 2)];
      heartbeatBufferRef.current = []; // Clear buffer

      const { rate, hardSeek } = rateCtrl.calculatePlaybackRate(medianDrift);

      if (hardSeek) {
        isSyncingRef.current = true;
        media.currentTime = expectedTime;
        media.playbackRate = 1.0;
        rateCtrl.reset();
        onSyncStatusChange?.("synced");
        isSyncingRef.current = false;
      } else if (rate !== 1.0) {
        media.playbackRate = rate;
        onSyncStatusChange?.("drifted");
        // PID controller handles convergence — no setTimeout reset needed
      } else {
        media.playbackRate = 1.0;
        onSyncStatusChange?.("synced");
      }
    };

    socket.on("sync:play", handlePlay);
    socket.on("sync:pause", handlePause);
    socket.on("sync:seek", handleSeek);
    socket.on("sync:heartbeat", handleHeartbeat);

    return () => {
      socket.off("sync:play", handlePlay);
      socket.off("sync:pause", handlePause);
      socket.off("sync:seek", handleSeek);
      socket.off("sync:heartbeat", handleHeartbeat);
    };
  }, [isHost, socket, serverNow, mediaRef, onSyncStatusChange]);
}
