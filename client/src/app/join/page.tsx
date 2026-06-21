"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import Link from "next/link";
import {
  Volume2,
  VolumeX,
  Zap,
  Copy,
  Check,
  ArrowLeft,
  RefreshCw,
  Music,
  Video as VideoIcon,
} from "lucide-react";
import { NTPClockSync, PlaybackRateController } from "@/lib/sync";
import { RoomState } from "@/lib/types";
import YouTube, { YouTubeEvent, YouTubePlayer } from "react-youtube";

import VideoPlayer from "@/components/VideoPlayer";
import AudioPlayer from "@/components/AudioPlayer";
import AudioSpectrum from "@/components/AudioSpectrum";

interface Participant {
  userId: string;
  userName: string;
  isHost: boolean;
  isReady: boolean;
}

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "";

export default function JoinPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState("");
  const [urlInput, setUrlInput] = useState("");

  // YouTube state
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState<string | null>(null);

  // Common state
  const [isConnected, setIsConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "SYNCED" | "ADJUSTING" | "RESYNCING"
  >("RESYNCING");
  const [rtt, setRtt] = useState(0);
  const [drift, setDrift] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [participantCount, setParticipantCount] = useState(1);
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // HLS State
  const [mode, setMode] = useState<"youtube" | "file">("youtube");
  const [roomState, setRoomState] = useState<RoomState | null>(null);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const clockSync = useRef(new NTPClockSync());
  const rateController = useRef(new PlaybackRateController());

  const expectedPositionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const lastHeartbeatTimeRef = useRef(0); // Track when last heartbeat was received
  // Use ref for mode to avoid socket reconnection on mode change
  const modeRef = useRef<"youtube" | "file">("youtube");
  const audioModeRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("roomId");
      if (id) {
        setRoomId(id);
      }
      const modeParams = params.get("mode");
      if (modeParams === "audio") {
        setIsAudioMode(true);
      }
    }
  }, []);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!urlInput.trim()) {
      setError("Please paste a room URL or ID");
      return;
    }

    let extractedRoomId = urlInput.trim();

    // Check if user accidentally pasted a YouTube URL instead of a room URL
    if (
      extractedRoomId.includes("youtube.com/watch") ||
      extractedRoomId.includes("youtu.be/")
    ) {
      setError(
        "This looks like a YouTube URL. Please paste the room share URL or room ID instead. YouTube URLs are used on the Host page.",
      );
      return;
    }

    // Extract room ID from URL if full URL is provided
    const match = extractedRoomId.match(/roomId=([a-zA-Z0-9-]+)/);
    if (match) {
      extractedRoomId = match[1];
    }

    // Remove any non-alphanumeric characters (except hyphens for room IDs)
    extractedRoomId = extractedRoomId.replace(/[^a-zA-Z0-9-]/g, "");

    if (!extractedRoomId) {
      setError("Invalid room ID or URL format");
      return;
    }

    setRoomId(extractedRoomId);
    setUrlInput("");
  };

  const handleChangeRoom = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setRoomId("");
    setVideoId("");
    setIsConnected(false);
    setSyncStatus("RESYNCING");
    setError("");
    setRoomState(null);
  };

  // FIXED: Removed `mode` from dependency array — mode changes should NOT cause socket reconnection
  useEffect(() => {
    if (!roomId) return;

    const socketInstance = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketInstance.on("connect", async () => {
      console.log("✅ Connected to server");

      await clockSync.current.calibrate(socketInstance);
      clockSync.current.startPeriodicSync(socketInstance, 10000);

      setIsConnected(true);
      setSyncStatus("SYNCED");

      let userId = `joiner-${Date.now()}`;
      let userName = "";
      let userEmail = "";
      if (typeof window !== "undefined") {
        const userStr = localStorage.getItem("auth_user");
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            userId = user.id;
            userName = user.name || "";
            userEmail = user.email || "";
          } catch (e) {}
        } else {
          const storedGuestId = localStorage.getItem("guest_id");
          if (storedGuestId) {
            userId = storedGuestId;
          } else {
            localStorage.setItem("guest_id", userId);
          }
        }
      }

      socketInstance.emit("room:join", {
        roomId,
        userId,
        userName,
        userEmail,
      });

      const syncInterval = setInterval(() => {
        const metrics = clockSync.current.getMetrics();
        setRtt(Math.round(metrics.rtt));
      }, 2000);

      return () => clearInterval(syncInterval);
    });

    socketInstance.on("room:state", (state: RoomState) => {
      console.log("📡 Room state received:", state);
      setRoomState(state);
      setVideoId(state.videoId || "");

      if (state.hlsStatus === "ready" && state.hlsUrl) {
        setMode("file");
      } else if (state.videoId) {
        setMode("youtube");
      }

      if (state.videoTitle) {
        setVideoTitle(state.videoTitle);
      }

      if (state.status === "PLAYING") {
        const serverTime = clockSync.current.getServerTime();
        const timeDelta = Math.max(
          0,
          (serverTime - state.serverTimeUpdatedAt) / 1000,
        );
        expectedPositionRef.current = state.videoProgress + timeDelta;
        lastHeartbeatTimeRef.current = serverTime;
        isPlayingRef.current = true;
        if (modeRef.current === "youtube" && playerRef.current) {
          playerRef.current.seekTo(expectedPositionRef.current, true);
          playerRef.current.playVideo();
        }
      } else {
        expectedPositionRef.current = state.videoProgress;
        isPlayingRef.current = false;
        if (modeRef.current === "youtube" && playerRef.current) {
          playerRef.current.seekTo(expectedPositionRef.current, true);
          playerRef.current.pauseVideo();
        }
      }
    });

    socketInstance.on("room:participant-count", (data: { count: number }) => {
      setParticipantCount(data.count);
    });

    // Heartbeat listener — use linear interpolation instead of crude += 0.5
    socketInstance.on(
      "sync:heartbeat",
      ({ progress, serverTime }: { progress: number; serverTime: number }) => {
        const now = clockSync.current.getServerTime();
        const transitTimeSec = Math.max(0, (now - serverTime) / 1000);
        expectedPositionRef.current = progress + transitTimeSec;
        lastHeartbeatTimeRef.current = now;
      },
    );

    socketInstance.on(
      "stream:ready",
      (data: { hlsUrl: string; fileType: "video" | "audio" }) => {
        setMode("file");
      },
    );

    socketInstance.on("disconnect", () => {
      console.log("❌ Disconnected from server");
      setIsConnected(false);
      setSyncStatus("RESYNCING");
    });

    socketInstance.on("room:participants", (data: { participants: Participant[] }) => {
      setParticipants(data.participants);
    });

    socketInstance.on("sync:prepare", (data: { progress: number }) => {
      if (modeRef.current === "youtube" && playerRef.current) {
        playerRef.current.seekTo(data.progress, true);
        playerRef.current.pauseVideo();
        isPlayingRef.current = false;
        setTimeout(() => {
          socketInstance.emit("sync:client-ready", { roomId });
        }, 800);
      }
    });

    socketInstance.on("sync:scheduled-play", (data: { startTime: number; startProgress: number }) => {
      if (modeRef.current === "youtube" && playerRef.current) {
        const now = clockSync.current.getServerTime();
        const delay = data.startTime - now;
        if (delay > 0) {
          setTimeout(() => {
            isPlayingRef.current = true;
            if (playerRef.current) {
              playerRef.current.playVideo();
            }
          }, delay);
        } else {
          const elapsed = Math.max(0, -delay / 1000);
          playerRef.current.seekTo(data.startProgress + elapsed, true);
          isPlayingRef.current = true;
          playerRef.current.playVideo();
        }
      }
    });

    setSocket(socketInstance);

    return () => {
      clockSync.current.stopPeriodicSync();
      socketInstance.disconnect();
    };
  }, [roomId]); // FIXED: Only roomId, not mode

  // Sync Loop for YouTube — uses linear interpolation between heartbeats
  useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (
        modeRef.current !== "youtube" ||
        !playerRef.current ||
        !isConnected ||
        !isPlayingRef.current
      )
        return;

      try {
        const currentVideoTime = await playerRef.current.getCurrentTime();

        // Linear interpolation: advance expected position based on time since last heartbeat
        const now = clockSync.current.getServerTime();
        const timeSinceHeartbeat =
          (now - lastHeartbeatTimeRef.current) / 1000;
        const interpolatedPosition =
          expectedPositionRef.current + Math.max(0, timeSinceHeartbeat);

        const driftSeconds = interpolatedPosition - currentVideoTime;
        const driftMs = driftSeconds * 1000;
        setDrift(Math.abs(driftMs));

        const { rate, hardSeek } =
          rateController.current.calculatePlaybackRate(driftMs);

        if (hardSeek) {
          playerRef.current.seekTo(interpolatedPosition, true);
          rateController.current.reset();
          setSyncStatus("RESYNCING");
        } else {
          // Playback rate nudging
          if (rate !== 1.0) {
            playerRef.current.setPlaybackRate(rate);
            setSyncStatus("ADJUSTING");
          } else {
            playerRef.current.setPlaybackRate(1.0);
            setSyncStatus("SYNCED");
          }
        }
      } catch (e) {}
    }, 500);

    return () => clearInterval(syncInterval);
  }, [isConnected]);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    // Start muted to bypass browser autoplay policies, user unmutes via overlay
    event.target.mute();
    event.target.setVolume(100);
    setIsMuted(true);
    if (isPlayingRef.current) {
      event.target.seekTo(expectedPositionRef.current, true);
      event.target.playVideo();
    }
  };

  const copyRoomUrl = () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/join?roomId=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <Link href="/" className="group flex items-center gap-3">
              <ArrowLeft
                size={18}
                className="text-gray-500 group-hover:text-blue-400 transition-colors"
              />
              <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                Join Stream
              </h1>
            </Link>

            {roomId && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAudioMode(!isAudioMode)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                    isAudioMode
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-white/[0.05] text-gray-400 border border-white/[0.05] hover:bg-white/[0.1]"
                  }`}
                >
                  {isAudioMode ? <Music size={16} /> : <VideoIcon size={16} />}
                  {isAudioMode ? "Audio Mode" : "Video Mode"}
                </button>
                <button
                  onClick={handleChangeRoom}
                  className="px-4 py-2 bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] rounded-xl text-sm text-gray-300 transition-all duration-200 flex items-center gap-2"
                >
                  <RefreshCw size={14} />
                  Change Room
                </button>
              </div>
            )}
          </div>

          {!roomId ? (
            <div className="max-w-md mx-auto mt-20">
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
                <h2 className="text-xl font-bold mb-6 text-center text-gray-200">
                  Enter Room Details
                </h2>
                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Room URL or ID
                    </label>
                    <input
                      type="text"
                      placeholder="Paste link here..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a12] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200"
                    />
                  </div>
                  {error && (
                    <p className="text-red-400 text-sm text-center bg-red-400/10 py-2 rounded-lg">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 rounded-xl font-bold transition-all duration-200"
                  >
                    Join Room
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Player Area */}
              <div className="lg:col-span-2">
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl relative">
                  {isAudioMode ? (
                    // AUDIO MODE UI with real spectrum
                    <div className="aspect-video bg-gradient-to-br from-[#0d0d18] to-[#0a0a12] flex flex-col items-center justify-center p-8 relative">
                      <div className="absolute bottom-0 left-0 right-0 z-0 opacity-60 px-4">
                        <AudioSpectrum
                          mediaRef={audioModeRef}
                          isPlaying={isPlayingRef.current}
                          height={120}
                          barCount={48}
                          colorTheme="cyan"
                        />
                      </div>
                      <div className="w-32 h-32 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 relative z-10">
                        {isPlayingRef.current && (
                          <div
                            className="absolute inset-0 rounded-full border border-blue-400/30 animate-ping"
                            style={{ animationDuration: "3s" }}
                          />
                        )}
                        <Music
                          size={48}
                          className={
                            isPlayingRef.current
                              ? "text-blue-400"
                              : "text-gray-600"
                          }
                        />
                      </div>
                      <h3 className="text-xl font-bold text-gray-200 mb-2 relative z-10">
                        {videoTitle || "Audio Mode Active"}
                      </h3>
                      <p className="text-gray-500 text-sm mb-8 text-center max-w-md relative z-10">
                        Video playback is disabled to save data and battery.
                        Audio is fully synchronized with the host.
                      </p>

                      {/* Hidden player for audio mode */}
                      <div className="hidden">
                        {mode === "youtube" ? (
                          <YouTube
                            videoId={videoId}
                            opts={{
                              width: "100",
                              height: "100",
                              playerVars: { autoplay: 0, controls: 0 },
                            }}
                            onReady={onPlayerReady}
                          />
                        ) : roomState?.hlsStatus === "ready" &&
                          roomState?.hlsUrl ? (
                          <AudioPlayer
                            roomId={roomId}
                            hlsUrl={roomState.hlsUrl}
                            socket={socket}
                            isHost={false}
                            serverNow={() => clockSync.current.getServerTime()}
                            externalAudioRef={audioModeRef}
                            hideUI={true}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : // VIDEO MODE UI
                  mode === "youtube" ? (
                    videoId ? (
                      <div className="aspect-video bg-black relative">
                        <YouTube
                          videoId={videoId}
                          opts={{
                            width: "100%",
                            height: "100%",
                            playerVars: {
                              autoplay: 0,
                              controls: 1,
                              modestbranding: 1,
                              rel: 0,
                              cc_load_policy: 1,
                              playsinline: 1,
                              // FIXED: Removed disablekb — allow keyboard shortcuts
                              // FIXED: Removed pointer-events-none — allow native controls
                            },
                          }}
                          onReady={onPlayerReady}
                          className="absolute inset-0 w-full h-full"
                        />
                        {/* Unmute Overlay */}
                        {isMuted && (
                          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 transition-opacity">
                            <button
                              onClick={() => {
                                setIsMuted(false);
                                if (playerRef.current) {
                                  playerRef.current.unMute();
                                  playerRef.current.setVolume(volume);
                                }
                              }}
                              className="group flex flex-col items-center gap-4"
                            >
                              <div className="w-20 h-20 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 transition-transform group-hover:scale-110">
                                <Volume2 size={32} className="text-white" />
                              </div>
                              <span className="text-xl font-bold tracking-wide">
                                Click to Unmute Stream
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-[#0d0d18] to-[#0a0a12] flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                          <div className="w-4 h-4 rounded-full bg-gray-600 animate-pulse" />
                        </div>
                        <p className="text-gray-500 text-sm">
                          Waiting for host to start a video...
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="aspect-video bg-black relative">
                      {roomState?.hlsStatus === "ready" && roomState?.hlsUrl ? (
                        roomState.fileType === "audio" ? (
                          <div className="flex items-center justify-center w-full h-full p-4">
                            <AudioPlayer
                              roomId={roomId}
                              hlsUrl={roomState.hlsUrl}
                              socket={socket}
                              isHost={false}
                              serverNow={() =>
                                clockSync.current.getServerTime()
                              }
                            />
                          </div>
                        ) : (
                          <VideoPlayer
                            roomId={roomId}
                            hlsUrl={roomState.hlsUrl}
                            socket={socket}
                            isHost={false}
                            serverNow={() => clockSync.current.getServerTime()}
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                          Waiting for host...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Glassmorphic Buffering & Syncing Overlay */}
                  {roomState?.isBuffering && (
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center z-20 transition-all duration-300">
                      <div className="max-w-md w-full px-6 py-8 bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col items-center text-center space-y-6 mx-4">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-pulse" />
                          <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-xl font-bold text-white tracking-wide">Syncing Playback</h3>
                          <p className="text-gray-400 text-xs max-w-xs">
                            Pre-loading media on all devices to ensure perfect zero-delay synchronization.
                          </p>
                        </div>

                        <div className="w-full bg-[#07070c] border border-white/[0.04] rounded-xl p-4 text-left space-y-3 max-h-48 overflow-y-auto">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                            Device Readiness
                          </p>
                          <div className="space-y-2">
                            {participants.map((p) => (
                              <div key={p.userId} className="flex items-center justify-between text-sm py-1 border-b border-white/[0.02] last:border-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate max-w-[150px]">{p.userName}</span>
                                  {p.isHost && (
                                    <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] font-bold rounded">
                                      HOST
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {p.isReady ? (
                                    <>
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      <span className="text-emerald-400 text-xs font-semibold">Ready</span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                                      <span className="text-blue-400 text-xs">Buffering</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Room Info Bar */}
                  <div className="p-4 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <span className="font-bold text-blue-400">R</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-200 truncate max-w-xs">
                          {videoTitle || `Room ${roomId.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {roomId}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={copyRoomUrl}
                      className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-2"
                    >
                      {copied ? (
                        <Check size={14} className="text-emerald-400" />
                      ) : (
                        <Copy size={14} />
                      )}
                      {copied ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* Connection Status */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-blue-400 flex items-center gap-2">
                    <Zap size={16} />
                    Sync Status
                  </h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                      <span className="text-sm text-gray-400">State</span>
                      <div className="flex items-center gap-2">
                        {syncStatus === "SYNCED" && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-emerald-400 font-medium text-sm">
                              Perfect
                            </span>
                          </>
                        )}
                        {syncStatus === "ADJUSTING" && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-blue-400 font-medium text-sm">
                              Micro-adjusting
                            </span>
                          </>
                        )}
                        {syncStatus === "RESYNCING" && (
                          <>
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-amber-400 font-medium text-sm">
                              Seeking
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                        <p className="text-xs text-gray-500 mb-1">
                          Latency (RTT)
                        </p>
                        <p className="text-lg font-mono text-gray-200">
                          {rtt}ms
                        </p>
                      </div>
                      <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                        <p className="text-xs text-gray-500 mb-1">
                          Clock Drift
                        </p>
                        <p
                          className={`text-lg font-mono ${drift < 100 ? "text-emerald-400" : drift < 500 ? "text-amber-400" : "text-red-400"}`}
                        >
                          {drift.toFixed(0)}ms
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Local Audio Control */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-gray-300 flex items-center gap-2">
                    <Volume2 size={16} />
                    Local Volume
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {isMuted || volume === 0 ? (
                        <VolumeX
                          size={20}
                          className="text-gray-500 shrink-0 cursor-pointer"
                          onClick={() => setIsMuted(false)}
                        />
                      ) : (
                        <Volume2
                          size={20}
                          className="text-blue-400 shrink-0 cursor-pointer"
                          onClick={() => setIsMuted(true)}
                        />
                      )}
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setVolume(val);
                          if (val > 0) setIsMuted(false);
                          if (mode === "youtube" && playerRef.current) {
                            playerRef.current.setVolume(val);
                            if (val > 0) playerRef.current.unMute();
                            else playerRef.current.mute();
                          }
                        }}
                        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, rgb(96, 165, 250) 0%, rgb(96, 165, 250) ${volume}%, rgba(255,255,255,0.06) ${volume}%, rgba(255,255,255,0.06) 100%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Room Stats */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">
                      Viewers in Room
                    </p>
                    <p className="text-2xl font-bold text-gray-200">
                      {participantCount}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
