"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Socket } from "socket.io-client";
import { useSyncEngine } from "@/hooks/useSyncEngine";
import { SyncStatus } from "@/lib/types";
import SyncIndicator from "./SyncIndicator";
import QualityBadge from "./QualityBadge";

interface AudioPlayerProps {
  roomId: string;
  hlsUrl: string;
  socket: Socket | null;
  isHost: boolean;
  serverNow: () => number;
}

export default function AudioPlayer({
  roomId,
  hlsUrl,
  socket,
  isHost,
  serverNow,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const [currentQuality, setCurrentQuality] = useState("Auto");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const serverUrl =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";
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

      hlsRef.current = hls;
    } else {
      audioRef.current.src = fullHlsUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [fullHlsUrl]);

  // Web Audio API waveform visualizer
  useEffect(() => {
    if (!audioRef.current || !canvasRef.current) return;

    let audioCtx: AudioContext | null = null;

    const initVisualizer = () => {
      if (audioCtx) return; // Already initialized

      try {
        audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const source = audioCtx.createMediaElementSource(audioRef.current!);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        analyserRef.current = analyser;

        // Start drawing
        const canvas = canvasRef.current!;
        const canvasCtx = canvas.getContext("2d")!;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
          animFrameRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(dataArray);

          canvasCtx.fillStyle = "rgba(10, 10, 18, 0.85)";
          canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / bufferLength) * 2.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;

            // Blue to purple gradient per bar
            const hue = (i / bufferLength) * 60 + 220;
            const lightness = 50 + (dataArray[i] / 255) * 20;
            canvasCtx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;

            // Rounded top bars
            const radius = Math.min(barWidth / 2, 3);
            const yPos = canvas.height - barHeight;

            canvasCtx.beginPath();
            canvasCtx.moveTo(x, canvas.height);
            canvasCtx.lineTo(x, yPos + radius);
            canvasCtx.quadraticCurveTo(x, yPos, x + radius, yPos);
            canvasCtx.lineTo(x + barWidth - radius, yPos);
            canvasCtx.quadraticCurveTo(
              x + barWidth,
              yPos,
              x + barWidth,
              yPos + radius,
            );
            canvasCtx.lineTo(x + barWidth, canvas.height);
            canvasCtx.fill();

            x += barWidth + 1;
          }
        };

        draw();
      } catch (err) {
        console.error("[AUDIO] Failed to initialize visualizer:", err);
      }
    };

    // Initialize on first play
    const onPlay = () => {
      initVisualizer();
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);

    audioRef.current.addEventListener("play", onPlay);
    audioRef.current.addEventListener("pause", onPause);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      audioRef.current?.removeEventListener("play", onPlay);
      audioRef.current?.removeEventListener("pause", onPause);
      audioCtx?.close();
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

  return (
    <div className="relative w-full bg-[#0a0a12] rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl shadow-black/50">
      {/* Waveform Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={800}
          height={160}
          className="w-full h-40 rounded-t-2xl"
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
