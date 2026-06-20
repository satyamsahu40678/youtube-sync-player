"use client";

import { useEffect, useRef, useCallback } from "react";
import { Socket } from "socket.io-client";
import { PlaybackRateController } from "@/lib/sync";
import { MediaState, SyncStatus } from "@/lib/types";

interface UseSyncEngineOptions {
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
 */
export function useSyncEngine({
  socket,
  isHost,
  serverNow,
  mediaRef,
  onSyncStatusChange,
}: UseSyncEngineOptions) {
  const rateControllerRef = useRef(new PlaybackRateController());
  const isSyncingRef = useRef(false); // Guard to prevent echo loops

  // ─── HOST MODE ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !socket || !mediaRef.current) return;
    const media = mediaRef.current;

    const onPlay = () => {
      if (isSyncingRef.current) return;
      socket.emit("sync:play", {
        currentTime: media.currentTime,
        serverTime: serverNow(),
      });
    };

    const onPause = () => {
      if (isSyncingRef.current) return;
      socket.emit("sync:pause", {
        currentTime: media.currentTime,
      });
    };

    const onSeeked = () => {
      if (isSyncingRef.current) return;
      socket.emit("sync:seek", {
        currentTime: media.currentTime,
        serverTime: serverNow(),
      });
    };

    // Heartbeat: broadcast position every 2 seconds
    const heartbeat = setInterval(() => {
      if (!media.paused && !media.ended) {
        socket.emit("sync:heartbeat", {
          currentTime: media.currentTime,
        });
      }
    }, 2000);

    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("seeked", onSeeked);

    return () => {
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("seeked", onSeeked);
      clearInterval(heartbeat);
    };
  }, [isHost, socket, serverNow, mediaRef]);

  // ─── VIEWER MODE ────────────────────────────────────────────────
  useEffect(() => {
    if (isHost || !socket || !mediaRef.current) return;
    const media = mediaRef.current;
    const rateCtrl = rateControllerRef.current;

    const handlePlay = (data: MediaState) => {
      isSyncingRef.current = true;
      const elapsed = (serverNow() - data.serverTime) / 1000;
      const targetTime = data.currentTime + elapsed;
      media.currentTime = targetTime;
      media.play().catch(() => {});
      // rateCtrl.reset(); (not needed in new API)
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handlePause = (data: MediaState) => {
      isSyncingRef.current = true;
      media.currentTime = data.currentTime;
      media.pause();
      // rateCtrl.reset();
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handleSeek = (data: MediaState) => {
      isSyncingRef.current = true;
      const elapsed = (serverNow() - data.serverTime) / 1000;
      media.currentTime = data.currentTime + elapsed;
      // rateCtrl.reset();
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handleHeartbeat = (data: {
      currentTime: number;
      serverTime: number;
    }) => {
      if (media.paused) return;

      const elapsed = (serverNow() - data.serverTime) / 1000;
      const expectedTime = data.currentTime + elapsed;
      const actualTime = media.currentTime;
      const drift = expectedTime - actualTime; // positive = we're behind

      const { rate, hardSeek } = rateCtrl.calculatePlaybackRate(drift * 1000);

      if (hardSeek) {
        isSyncingRef.current = true;
        media.currentTime = expectedTime;
        media.playbackRate = 1.0;
        onSyncStatusChange?.("synced");
        isSyncingRef.current = false;
      } else if (rate !== 1.0) {
        media.playbackRate = rate;
        onSyncStatusChange?.("drifted");

        // Reset rate after correction period
        const correctionTime = Math.min((Math.abs(drift) * 1000) / 0.08, 5000);
        setTimeout(() => {
          if (mediaRef.current) {
            mediaRef.current.playbackRate = 1.0;
            onSyncStatusChange?.("synced");
          }
        }, correctionTime);
      } else {
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
