"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Socket } from "socket.io-client";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { SyncStatus } from "@/lib/types";
import SyncIndicator from "./SyncIndicator";
import QualityBadge from "./QualityBadge";

interface VideoPlayerProps {
  roomId: string;
  hlsUrl: string;
  socket: Socket | null;
  isHost: boolean;
  serverNow: () => number;
}

export default function VideoPlayer({
  roomId,
  hlsUrl,
  socket,
  isHost,
  serverNow,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentQuality, setCurrentQuality] = useState("Auto");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const serverUrl =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
  const fullHlsUrl = hlsUrl.startsWith("http")
    ? hlsUrl
    : `${serverUrl}${hlsUrl}`;

  // Initialize HLS.js
  useEffect(() => {
    if (!videoRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        // ABR config — per-device quality selection
        abrEwmaDefaultEstimate: 500_000,
        abrMaxWithRealBitrate: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // Auto-select on start
        capLevelToPlayerSize: true,
        capLevelOnFPSDrop: true,
        // Low-latency seeking
        nudgeMaxRetry: 3,
        highBufferWatchdogPeriod: 2,
      });

      hls.loadSource(fullHlsUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) {
          setCurrentQuality(level.height ? `${level.height}p` : "Auto");
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("[HLS] Manifest parsed, ready to play");
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("[HLS] Fatal error:", data.type, data.details);
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });

      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      videoRef.current.src = fullHlsUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [fullHlsUrl]);

  // Sync engine
  useSyncEngine({
    roomId,
    socket,
    isHost,
    serverNow,
    mediaRef: videoRef,
    onSyncStatusChange: setSyncStatus,
  });

  // Time tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadedmetadata", onDurationChange);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadedmetadata", onDurationChange);
    };
  }, []);

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-2xl shadow-black/50 group">
      <video
        ref={videoRef}
        className="w-full aspect-video"
        controls={isHost}
        playsInline
        preload="auto"
      />

      {/* Top overlay — sync + quality */}
      <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <SyncIndicator status={syncStatus} />
        <QualityBadge quality={currentQuality} />
      </div>

      {/* Viewer overlay */}
      {!isHost && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pointer-events-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/70 text-xs font-medium">
                Synced to host
              </span>
            </div>
            <span className="text-white/50 text-xs font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
