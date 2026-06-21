"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Socket } from "socket.io-client";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { SyncStatus } from "@/lib/types";
import SyncIndicator from "./SyncIndicator";
import QualityBadge from "./QualityBadge";
import AudioSpectrum from "./AudioSpectrum";

interface AudioPlayerProps {
  roomId: string;
  hlsUrl: string;
  socket: Socket | null;
  isHost: boolean;
  serverNow: () => number;
  externalAudioRef?: any;
  hideUI?: boolean;
}

export default function AudioPlayer({
  roomId,
  hlsUrl,
  socket,
  isHost,
  serverNow,
  externalAudioRef,
  hideUI = false,
}: AudioPlayerProps) {
  const internalAudioRef = useRef<HTMLAudioElement>(null);
  const audioRef = externalAudioRef || internalAudioRef;
  const hlsRef = useRef<Hls | null>(null);
  const [currentQuality, setCurrentQuality] = useState("Auto");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const serverUrl =
    process.env.NEXT_PUBLIC_SERVER_URL || "";
  const fullHlsUrl = hlsUrl.startsWith("http")
    ? hlsUrl
    : `${serverUrl}${hlsUrl}`;

  // Initialize HLS.js for audio
  useEffect(() => {
    if (!audioRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        abrEwmaDefaultEstimate: 128_000,
        maxBufferLength: 30,
        startLevel: -1,
      });

      hls.loadSource(fullHlsUrl);
      hls.attachMedia(audioRef.current);

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const level = hls.levels[data.level];
        if (level) {
          const kbps = Math.round(level.bitrate / 1000);
          setCurrentQuality(`${kbps}kbps`);
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error("[HLS Audio] Fatal error:", data.type, data.details);
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        }
      });

      hlsRef.current = hls;
    } else {
      audioRef.current.src = fullHlsUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [fullHlsUrl]);

  // Track play/pause state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  // Sync engine
  useSyncEngine({
    roomId,
    socket,
    isHost,
    serverNow,
    mediaRef: audioRef,
    onSyncStatusChange: setSyncStatus,
  });

  // Time tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
    };
  }, []);

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (hideUI) {
    return (
      <audio
        ref={audioRef}
        controls={isHost}
        crossOrigin="anonymous"
        className="hidden"
        preload="auto"
      />
    );
  }

  return (
    <div className="relative w-full bg-[#0a0a12] rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl shadow-black/50">
      {/* Real Audio Spectrum Visualizer */}
      <div className="relative">
        <AudioSpectrum
          mediaRef={audioRef}
          isPlaying={isPlaying}
          height={160}
          barCount={64}
          colorTheme="blue-purple"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12] via-transparent to-transparent pointer-events-none" />

        {/* Status badges */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <SyncIndicator status={syncStatus} />
          <QualityBadge quality={currentQuality} />
        </div>

        {/* Centered music icon when not playing */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-violet-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Audio element + controls */}
      <div className="p-4 space-y-3">
        <audio
          ref={audioRef}
          controls={isHost}
          crossOrigin="anonymous"
          className="w-full h-10 [&::-webkit-media-controls-panel]:bg-white/5"
          preload="auto"
        />

        {/* Info bar */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {!isHost && (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-white/50 font-medium">
                  Synced to host
                </span>
              </>
            )}
          </div>
          <span className="text-white/40 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
