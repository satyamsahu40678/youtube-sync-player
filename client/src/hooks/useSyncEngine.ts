"use client";

import { useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { PlaybackRateController, ScheduledPlayExecutor } from "@/lib/sync";
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
 * Utility: get seconds of media buffered ahead of current position.
 */
function getBufferedAheadSec(media: HTMLVideoElement | HTMLAudioElement): number {
  if (!media.buffered || media.buffered.length === 0) return 0;
  const currentTime = media.currentTime;
  for (let i = 0; i < media.buffered.length; i++) {
    if (media.buffered.start(i) <= currentTime && media.buffered.end(i) > currentTime) {
      return media.buffered.end(i) - currentTime;
    }
  }
  return 0;
}

/**
 * Core sync engine hook.
 * HOST mode: captures play/pause/seek events from the media element and emits them via Socket.io.
 * VIEWER mode: receives sync events and applies them to the media element with drift correction.
 *
 * Uses the pre-buffer + scheduled play pattern for 0ms latency illusion:
 * 1. On play/seek, all clients pause and pre-buffer at the target position
 * 2. Once all clients report "ready", server broadcasts a precise future timestamp
 * 3. All clients use ScheduledPlayExecutor to start playback at exactly the same moment
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
  const scheduledPlayRef = useRef(new ScheduledPlayExecutor());
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
    const scheduledPlay = scheduledPlayRef.current;

    // Buffer preparation phase — seek to target, pause, verify buffer, report ready
    const handlePrepare = (data: { progress: number }) => {
      isSyncingRef.current = true;
      scheduledPlay.cancel(); // Cancel any pending scheduled play
      media.currentTime = data.progress;
      ignoreNextPauseRef.current = true;
      media.pause();
      isSyncingRef.current = false;
      onSyncStatusChange?.("buffering");

      const checkAndReport = () => {
        // Check both readyState and actual buffer health
        const bufferedAhead = getBufferedAheadSec(media);
        if (media.readyState >= 3 && bufferedAhead >= 0.5) {
          socket.emit("sync:client-ready", {
            roomId,
            bufferedAheadSec: bufferedAhead,
          });
          return true;
        }
        return false;
      };

      if (checkAndReport()) return;

      // Wait for buffer to fill
      const onCanPlay = () => {
        if (checkAndReport()) {
          media.removeEventListener("canplay", onCanPlay);
          media.removeEventListener("seeked", onSeekedReady);
          clearTimeout(fallbackTimer);
        }
      };
      const onSeekedReady = () => {
        if (checkAndReport()) {
          media.removeEventListener("canplay", onCanPlay);
          media.removeEventListener("seeked", onSeekedReady);
          clearTimeout(fallbackTimer);
        }
      };

      // Fallback: if events don't fire within 2s, report ready anyway
      const fallbackTimer = setTimeout(() => {
        media.removeEventListener("canplay", onCanPlay);
        media.removeEventListener("seeked", onSeekedReady);
        const bufferedAhead = getBufferedAheadSec(media);
        socket.emit("sync:client-ready", {
          roomId,
          bufferedAheadSec: bufferedAhead,
        });
      }, 2000);

      media.addEventListener("canplay", onCanPlay);
      media.addEventListener("seeked", onSeekedReady);
    };

    // Scheduled play execution — precision timer for simultaneous playback
    const handleScheduledPlay = (data: { startTime: number; startProgress: number }) => {
      // Relax drift correction after scheduled play since we trust the sync
      rateCtrl.setDeadZone(100);

      scheduledPlay.scheduleAt(
        data.startTime,
        serverNow,
        () => {
          isSyncingRef.current = true;
          // Compensate for any time elapsed since startTime
          const now = serverNow();
          const elapsed = Math.max(0, (now - data.startTime) / 1000);
          if (elapsed > 0.05) {
            // If we're more than 50ms late, adjust position
            media.currentTime = data.startProgress + elapsed;
          }
          ignoreNextPlayRef.current = true;
          media.play().catch(() => {});
          onSyncStatusChange?.("synced");
          isSyncingRef.current = false;
        },
      );
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
      scheduledPlay.cancel(); // Cancel any pending scheduled play
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
      scheduledPlay.cancel();
      socket.off("sync:prepare", handlePrepare);
      socket.off("sync:scheduled-play", handleScheduledPlay);
      socket.off("sync:play", handlePlay);
      socket.off("sync:pause", handlePause);
      socket.off("sync:seek", handleSeek);
      socket.off("sync:heartbeat", handleHeartbeat);
    };
  }, [isHost, socket, serverNow, mediaRef, roomId, onSyncStatusChange]);
}

