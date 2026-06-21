"use client";

import { useEffect, useRef } from "react";
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
  const ignoreNextPauseRef = useRef(false);
  const ignoreNextPlayRef = useRef(false);

  // ─── HOST MODE ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isHost || !socket || !mediaRef.current || !roomId) return;
    const media = mediaRef.current;

    const onPlay = () => {
      if (isSyncingRef.current) return;
      if (ignoreNextPlayRef.current) {
        ignoreNextPlayRef.current = false;
        return;
      }
      // Intercept local play and trigger room-wide prepare buffer cycle
      ignoreNextPauseRef.current = true;
      media.pause();
      socket.emit("sync:request-prepare", {
        roomId,
        currentTime: media.currentTime,
      });
    };

    const onPause = () => {
      if (isSyncingRef.current) return;
      if (ignoreNextPauseRef.current) {
        ignoreNextPauseRef.current = false;
        return;
      }
      socket.emit("sync:pause", {
        roomId,
        currentTime: media.currentTime,
      });
    };

    const onSeeked = () => {
      if (isSyncingRef.current) return;
      // Seek while playing -> prepare/preload at seek target
      if (!media.paused) {
        ignoreNextPauseRef.current = true;
        media.pause();
        socket.emit("sync:request-prepare", {
          roomId,
          currentTime: media.currentTime,
        });
      } else {
        // Seek while paused -> update frame instantly on all devices
        socket.emit("sync:seek", {
          roomId,
          currentTime: media.currentTime,
          serverTime: serverNow(),
        });
      }
    };

    // Heartbeat: broadcast position every 500ms
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

  // ─── COORD & DRIFT SYNC LISTENERS (UNIFIED) ──────────────────────────
  useEffect(() => {
    if (!socket || !mediaRef.current || !roomId) return;
    const media = mediaRef.current;
    const rateCtrl = rateControllerRef.current;

    // Buffer preparation phase
    const handlePrepare = (data: { progress: number }) => {
      isSyncingRef.current = true;
      media.currentTime = data.progress;
      ignoreNextPauseRef.current = true;
      media.pause();
      isSyncingRef.current = false;
      onSyncStatusChange?.("buffering");

      const checkAndReport = () => {
        if (media.readyState >= 3) {
          socket.emit("sync:client-ready", { roomId });
          return true;
        }
        return false;
      };

      if (checkAndReport()) return;

      const onCanPlay = () => {
        if (checkAndReport()) {
          media.removeEventListener("canplay", onCanPlay);
          media.removeEventListener("seeked", onSeekedReady);
        }
      };
      const onSeekedReady = () => {
        if (checkAndReport()) {
          media.removeEventListener("canplay", onCanPlay);
          media.removeEventListener("seeked", onSeekedReady);
        }
      };

      media.addEventListener("canplay", onCanPlay);
      media.addEventListener("seeked", onSeekedReady);
    };

    // Scheduled play execution
    const handleScheduledPlay = (data: { startTime: number; startProgress: number }) => {
      isSyncingRef.current = true;
      const now = serverNow();
      const delay = data.startTime - now;

      if (delay > 0) {
        onSyncStatusChange?.("synced");
        setTimeout(() => {
          isSyncingRef.current = true;
          ignoreNextPlayRef.current = true;
          media.play().catch(() => {});
          isSyncingRef.current = false;
        }, delay);
      } else {
        const elapsed = Math.max(0, -delay / 1000);
        media.currentTime = data.startProgress + elapsed;
        ignoreNextPlayRef.current = true;
        media.play().catch(() => {});
        onSyncStatusChange?.("synced");
      }
      isSyncingRef.current = false;
    };

    const handlePlay = (data: MediaState) => {
      isSyncingRef.current = true;
      const elapsed = (serverNow() - data.serverTime) / 1000;
      const targetTime = data.currentTime + Math.max(0, elapsed);
      media.currentTime = targetTime;
      ignoreNextPlayRef.current = true;
      media.play().catch(() => {});
      rateCtrl.reset();
      onSyncStatusChange?.("synced");
      isSyncingRef.current = false;
    };

    const handlePause = (data: MediaState) => {
      isSyncingRef.current = true;
      media.currentTime = data.currentTime;
      ignoreNextPauseRef.current = true;
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
      if (media.paused || isSyncingRef.current) return;

      const elapsed = Math.max(0, (serverNow() - data.serverTime) / 1000);
      const expectedTime = data.currentTime + elapsed;
      const actualTime = media.currentTime;
      const drift = expectedTime - actualTime; // positive = we're behind
      const driftMs = drift * 1000;

      const buffer = heartbeatBufferRef.current;
      buffer.push(driftMs);
      if (buffer.length < 2) return;

      const sorted = [...buffer].sort((a, b) => a - b);
      const medianDrift = sorted[Math.floor(sorted.length / 2)];
      heartbeatBufferRef.current = [];

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
      } else {
        media.playbackRate = 1.0;
        onSyncStatusChange?.("synced");
      }
    };

    socket.on("sync:prepare", handlePrepare);
    socket.on("sync:scheduled-play", handleScheduledPlay);

    if (!isHost) {
      socket.on("sync:play", handlePlay);
      socket.on("sync:pause", handlePause);
      socket.on("sync:seek", handleSeek);
      socket.on("sync:heartbeat", handleHeartbeat);
    }

    return () => {
      socket.off("sync:prepare", handlePrepare);
      socket.off("sync:scheduled-play", handleScheduledPlay);
      socket.off("sync:play", handlePlay);
      socket.off("sync:pause", handlePause);
      socket.off("sync:seek", handleSeek);
      socket.off("sync:heartbeat", handleHeartbeat);
    };
  }, [isHost, socket, serverNow, mediaRef, roomId, onSyncStatusChange]);
}
