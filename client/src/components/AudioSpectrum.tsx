"use client";

import React, { useEffect, useRef, useCallback } from "react";

interface AudioSpectrumProps {
  /** Ref to the audio/video element to analyze */
  mediaRef?: React.RefObject<HTMLAudioElement | HTMLVideoElement | null>;
  /** Whether playback is active (used for simulated mode fallback) */
  isPlaying: boolean;
  /** Height in pixels */
  height?: number;
  /** Number of bars */
  barCount?: number;
  /** Color theme: 'blue-purple' | 'emerald' | 'cyan' */
  colorTheme?: "blue-purple" | "emerald" | "cyan";
}

/**
 * Real-time audio spectrum visualizer using Web Audio API.
 *
 * When connected to a media element via mediaRef, renders actual FFT frequency data.
 * Falls back to a smooth, responsive simulated spectrum when Web Audio API
 * is unavailable (e.g., YouTube iframe, cross-origin restrictions).
 *
 * The simulated spectrum uses Perlin-like noise that responds to isPlaying state,
 * providing a more realistic visualization than pure CSS animations.
 */
export default function AudioSpectrum({
  mediaRef,
  isPlaying,
  height = 160,
  barCount = 64,
  colorTheme = "blue-purple",
}: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const isWebAudioActiveRef = useRef(false);
  const simulatedDataRef = useRef<Float32Array>(new Float32Array(barCount));
  const simulatedPhaseRef = useRef<Float32Array>(
    new Float32Array(barCount).map(() => Math.random() * Math.PI * 2),
  );

  // Color theme configurations
  const getBarColor = useCallback(
    (barIndex: number, barValue: number, total: number) => {
      const normalizedIndex = barIndex / total;
      const normalizedValue = barValue / 255;
      const lightness = 45 + normalizedValue * 25;

      switch (colorTheme) {
        case "emerald":
          return `hsl(${150 + normalizedIndex * 30}, 70%, ${lightness}%)`;
        case "cyan":
          return `hsl(${180 + normalizedIndex * 40}, 75%, ${lightness}%)`;
        case "blue-purple":
        default:
          return `hsl(${220 + normalizedIndex * 60}, 80%, ${lightness}%)`;
      }
    },
    [colorTheme],
  );

  // Try to connect Web Audio API to media element
  useEffect(() => {
    if (!mediaRef?.current || !canvasRef.current) return;
    if (sourceRef.current) return; // Already connected

    const media = mediaRef.current;

    const initWebAudio = () => {
      if (audioCtxRef.current) return;

      try {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = barCount * 4; // Higher for smoother data
        analyser.smoothingTimeConstant = 0.8;

        const source = audioCtx.createMediaElementSource(media);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;
        isWebAudioActiveRef.current = true;
      } catch (err) {
        // MediaElementSource can only be created once per element
        // or may fail for cross-origin content
        console.debug("[AudioSpectrum] Web Audio API unavailable:", err);
      }
    };

    const onPlay = () => {
      initWebAudio();
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    };

    media.addEventListener("play", onPlay);
    // If already playing, init immediately
    if (!media.paused) {
      onPlay();
    }

    return () => {
      media.removeEventListener("play", onPlay);
    };
  }, [mediaRef, barCount]);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const dataArray = new Uint8Array(barCount);

    // Smooth simulated spectrum using sine waves with varying frequencies
    const updateSimulatedData = (time: number) => {
      const data = simulatedDataRef.current;
      const phases = simulatedPhaseRef.current;

      for (let i = 0; i < barCount; i++) {
        // Bell curve shape: center bars taller
        const distFromCenter = Math.abs((i - barCount / 2) / (barCount / 2));
        const bellCurve = 1 - distFromCenter * 0.6;

        // Multiple layered sine waves for organic movement
        const speed1 = 0.002 + (i % 7) * 0.0003;
        const speed2 = 0.003 + (i % 5) * 0.0004;
        const speed3 = 0.001 + (i % 11) * 0.0002;

        const wave1 = Math.sin(time * speed1 + phases[i]) * 0.4;
        const wave2 = Math.sin(time * speed2 + phases[i] * 1.7) * 0.3;
        const wave3 = Math.sin(time * speed3 + phases[i] * 2.3) * 0.2;

        const combined = (wave1 + wave2 + wave3 + 1) / 2; // Normalize to 0-1

        if (isPlaying) {
          // When playing, animate with full amplitude
          const target = combined * bellCurve * 220 + 20;
          data[i] += (target - data[i]) * 0.15; // Smooth lerp
        } else {
          // When paused, decay to near-zero
          data[i] *= 0.92;
        }
      }
    };

    const draw = (timestamp: number) => {
      animFrameRef.current = requestAnimationFrame(draw);

      const analyser = analyserRef.current;
      let useRealData = false;

      if (analyser && isWebAudioActiveRef.current) {
        analyser.getByteFrequencyData(dataArray);
        // Check if we're getting real audio data
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        useRealData = sum > 0;
      }

      if (!useRealData) {
        updateSimulatedData(timestamp);
        for (let i = 0; i < barCount; i++) {
          dataArray[i] = Math.round(simulatedDataRef.current[i]);
        }
      }

      // Clear canvas with slight trail effect for smoothness
      ctx.fillStyle = "rgba(10, 10, 18, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const totalBarWidth = canvas.width / barCount;
      const barWidth = totalBarWidth * 0.75;
      const gap = totalBarWidth * 0.25;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i];
        const barHeight = (value / 255) * canvas.height * 0.92;

        if (barHeight < 1) continue;

        const x = i * totalBarWidth + gap / 2;
        const y = canvas.height - barHeight;

        // Gradient fill per bar
        const color = getBarColor(i, value, barCount);
        ctx.fillStyle = color;

        // Rounded top
        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, canvas.height);
        ctx.fill();

        // Subtle glow on tall bars
        if (value > 150) {
          ctx.fillStyle = color.replace("80%", "50%").replace(")", ", 0.15)").replace("hsl", "hsla");
          ctx.fillRect(x - 1, y, barWidth + 2, barHeight);
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [barCount, isPlaying, getBarColor]);

  // Cleanup audio context
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      className="w-full rounded-lg"
      style={{ height: `${height}px` }}
    />
  );
}
