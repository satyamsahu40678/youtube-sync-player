'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { Share2, Play, Pause, Copy, Check, AlertCircle, ArrowLeft, Radio, Volume2, VolumeX } from 'lucide-react';
import { NTPClockSync } from '@/lib/sync';
import { extractYouTubeVideoId, isValidYouTubeUrl, extractYouTubeStartTime } from '@/lib/youtube';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

interface RoomState {
  videoId: string | null;
  videoTitle?: string | null;
  status: 'PLAYING' | 'PAUSED';
  videoProgress: number;
  serverTimeUpdatedAt: number;
}

export default function HostPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [videoTitle, setVideoTitle] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [participantCount, setParticipantCount] = useState(1);
  const [copied, setCopied] = useState<string | false>(false);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  
  const playerRef = useRef<YouTubePlayer | null>(null);
  const clockSync = useRef(new NTPClockSync());
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let initialRoomId = '';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlRoomId = params.get('roomId');
      if (urlRoomId) {
        initialRoomId = urlRoomId.replace(/[^a-zA-Z0-9-]/g, '');
      }
    }

    let userId = `host-${Date.now()}`;
    let userName = '';
    let userEmail = '';
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('auth_user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          userId = user.id;
          userName = user.name || '';
          userEmail = user.email || '';
        } catch (e) {}
      } else {
        const storedGuestId = localStorage.getItem('guest_id');
        if (storedGuestId) {
          userId = storedGuestId;
        } else {
          localStorage.setItem('guest_id', userId);
        }
      }
    }

    const socketInstance = io(SERVER_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketInstance.on('connect', async () => {
      console.log('✅ Connected to server');

      await clockSync.current.calibrate(socketInstance);

      const finalRoomId = initialRoomId || `room-${Date.now()}`;
      setRoomId(finalRoomId);

      socketInstance.emit('room:join', { 
        roomId: finalRoomId, 
        userId,
        userName,
        userEmail
      });
    });

    socketInstance.on('room:state', (state: RoomState) => {
      if (state.videoTitle) {
        setVideoTitle(state.videoTitle);
      }
    });

    socketInstance.on('room:participant-count', (data: { count: number }) => {
      setParticipantCount(data.count);
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Periodic host progress sync
  useEffect(() => {
    if (isPlaying && socket && playerRef.current) {
      syncIntervalRef.current = setInterval(async () => {
        try {
          const currentProgress = await playerRef.current.getCurrentTime();
          setProgress(currentProgress);
          // Send periodic correction
          socket.emit('room:seek', { roomId, progress: currentProgress });
        } catch (e) {
          // Ignore errors
        }
      }, 5000);
    } else if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isPlaying, socket, roomId]);

  // UI Progress bar updater
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && playerRef.current) {
      interval = setInterval(async () => {
        try {
          const t = await playerRef.current.getCurrentTime();
          setProgress(t);
        } catch (e) {}
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayVideo = () => {
    setError('');

    if (!videoUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(videoUrl)) {
      setError('Invalid YouTube URL format. Supported: youtube.com/watch?v=..., youtu.be/..., or youtu.be/...?si=...');
      return;
    }

    const extractedId = extractYouTubeVideoId(videoUrl);
    const startTimeValue = extractYouTubeStartTime(videoUrl);

    if (!extractedId) {
      setError('Could not extract video ID from URL');
      return;
    }

    setVideoId(extractedId);
    setStartTime(startTimeValue);
    setProgress(startTimeValue || 0);

    if (socket) {
      socket.emit('room:update-video', { roomId, videoId: extractedId, startTime: startTimeValue || 0 });
    }
  };

  const togglePlayPause = async () => {
    if (!playerRef.current) return;
    
    const currentProgress = await playerRef.current.getCurrentTime();
    if (isPlaying) {
      playerRef.current.pauseVideo();
      if (socket) {
        socket.emit('room:playback-control', { roomId, status: 'PAUSED', progress: currentProgress });
      }
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      if (socket) {
        socket.emit('room:playback-control', { roomId, status: 'PLAYING', progress: currentProgress });
      }
      setIsPlaying(true);
    }
  };

  const handleSeek = async (newProgress: number) => {
    setProgress(newProgress);
    if (playerRef.current) {
      playerRef.current.seekTo(newProgress, true);
    }
    if (socket) {
      socket.emit('room:seek', { roomId, progress: newProgress });
    }
  };

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
      if (isMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    }
  }, [volume, isMuted]);

  const onPlayerReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    // Force volume to use local state to override any cross-tab YouTube cookies that might sync with the joiner
    event.target.setVolume(volume);
    if (isMuted) event.target.mute();
    setDuration(event.target.getDuration());
    if (startTime) {
      event.target.seekTo(startTime, true);
    }
    event.target.playVideo();
    setIsPlaying(true);
    
    if (socket) {
      socket.emit('room:playback-control', { roomId, status: 'PLAYING', progress: startTime || 0 });
    }
  };

  const onPlayerStateChange = async (event: YouTubeEvent) => {
    const state = event.data;
    // 0 = ENDED, 1 = PLAYING, 2 = PAUSED
    if (state === 0) {
      setIsPlaying(false);
      event.target.pauseVideo();
      if (socket) {
        const t = await event.target.getCurrentTime();
        socket.emit('room:playback-control', { roomId, status: 'PAUSED', progress: t });
      }
    } else if (state === 1 && !isPlaying) {
      setIsPlaying(true);
      if (socket) {
        const t = await event.target.getCurrentTime();
        socket.emit('room:playback-control', { roomId, status: 'PLAYING', progress: t });
      }
    } else if (state === 2 && isPlaying) {
      setIsPlaying(false);
      if (socket) {
        const t = await event.target.getCurrentTime();
        socket.emit('room:playback-control', { roomId, status: 'PAUSED', progress: t });
      }
    }
  };

  const copyShareUrl = (mode?: 'audio') => {
    let shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/join?roomId=${roomId}`;
    if (mode === 'audio') {
      shareUrl += '&mode=audio';
    }
    navigator.clipboard.writeText(shareUrl);
    setCopied(mode === 'audio' ? 'audio' : 'video');
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[500px] h-[500px] bg-emerald-600/12 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] bg-green-600/12 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <Link href="/" className="group flex items-center gap-3">
              <ArrowLeft size={18} className="text-gray-500 group-hover:text-emerald-400 transition-colors" />
              <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
                Host Stream
              </h1>
            </Link>
            {roomId && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 flex items-center gap-2 max-w-sm w-full sm:w-auto">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Room</p>
                  <p className="text-sm font-mono font-bold text-emerald-400 truncate">{videoTitle || `${roomId.slice(0, 16)}...`}</p>
                </div>
              </div>
            )}
          </div>

          {roomId ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Video Player */}
              <div className="lg:col-span-2">
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl">
                  {videoId ? (
                    <div className="aspect-video bg-black relative">
                      <YouTube
                        videoId={videoId}
                        opts={{
                          width: '100%',
                          height: '100%',
                          playerVars: {
                            autoplay: 1,
                            controls: 0, // hide native controls to prevent host confusion, we use custom
                            disablekb: 1,
                            modestbranding: 1,
                            rel: 0,
                          },
                        }}
                        onReady={onPlayerReady}
                        onStateChange={onPlayerStateChange}
                        className="absolute inset-0 w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-[#0d0d18] to-[#0a0a12] flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                        <Play size={28} className="text-gray-600" />
                      </div>
                      <p className="text-gray-500 text-sm">Enter a YouTube URL below to start streaming</p>
                    </div>
                  )}

                  {/* Controls */}
                  <div className="p-6 border-t border-white/[0.06] space-y-4 bg-white/[0.02]">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">YouTube URL</label>
                      <div className="flex gap-2 flex-wrap">
                        <input
                          type="text"
                          placeholder="Paste YouTube link (e.g., youtu.be/-PXivr2hmMA?si=... or youtube.com/watch?v=...)"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handlePlayVideo()}
                          className="flex-1 min-w-64 px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 transition-all duration-200"
                        />
                        <button
                          onClick={handlePlayVideo}
                          className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-0.5 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2"
                        >
                          <Play size={16} />
                          Play
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        ✨ Supports: youtube.com/watch?v=ID, youtu.be/ID, youtu.be/-PXivr2hmMA?si=xxxxx, timestamps (?t=60s)
                      </p>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                        <AlertCircle size={14} />
                        {error}
                      </div>
                    )}

                    {videoId && (
                      <div className="flex gap-4 flex-wrap">
                        <button
                          onClick={togglePlayPause}
                          className="flex-1 min-w-32 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 text-violet-300 hover:from-violet-600/30 hover:to-fuchsia-600/30 rounded-xl font-semibold transition-all duration-200"
                        >
                          {isPlaying ? (
                            <>
                              <Pause size={18} />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play size={18} />
                              Play
                            </>
                          )}
                        </button>

                        <div className="flex-1 min-w-32 flex items-center gap-3">
                          <span className="text-xs text-gray-500 min-w-fit">Seek:</span>
                          <input
                            type="range"
                            min="0"
                            max={duration || 100}
                            value={progress}
                            onChange={(e) => handleSeek(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, rgb(16, 185, 129) 0%, rgb(16, 185, 129) ${progressPercent}%, rgba(255,255,255,0.06) ${progressPercent}%, rgba(255,255,255,0.06) 100%)`,
                            }}
                          />
                          <span className="text-xs text-gray-500 min-w-fit font-mono">{Math.floor(progress / 60)}:{(Math.floor(progress % 60)).toString().padStart(2, '0')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* Share URL */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-emerald-400 flex items-center gap-2">
                    <Share2 size={16} />
                    Share Stream
                  </h3>
                  <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3 text-xs font-mono break-all text-cyan-400 mb-3">
                    {typeof window !== 'undefined' ? `${window.location.origin}/join?roomId=${roomId}` : 'Loading...'}
                  </div>
                  <div className="space-y-2 flex flex-col sm:flex-row gap-2 sm:space-y-0">
                    <button
                      onClick={() => copyShareUrl()}
                      className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-0.5 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      {copied === 'video' ? (
                        <>
                          <Check size={14} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Video Link
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => copyShareUrl('audio')}
                      className="flex-1 py-2.5 bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.08] hover:border-white/[0.15] text-white rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      {copied === 'audio' ? (
                        <>
                          <Check size={14} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Radio size={14} />
                          Audio Link
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-blue-400">📊 Live Stats</h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
                      <p className="text-gray-500 text-xs mb-1">Connected Viewers</p>
                      <p className="text-3xl font-extrabold text-emerald-400">{participantCount}</p>
                    </div>
                    <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
                      <p className="text-gray-500 text-xs mb-1">Status</p>
                      <div className={`text-base font-bold flex items-center gap-2 ${isPlaying ? 'text-blue-400' : 'text-amber-400'}`}>
                        {isPlaying ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                            Playing
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                            Paused
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Audio Control */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-cyan-400 flex items-center gap-2">
                    <Volume2 size={16} />
                    Audio Control
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {isMuted ? (
                        <VolumeX size={20} className="text-red-400 shrink-0" />
                      ) : (
                        <Volume2 size={20} className="text-cyan-400 shrink-0" />
                      )}
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, rgb(6, 182, 212) 0%, rgb(6, 182, 212) ${volume}%, rgba(255,255,255,0.06) ${volume}%, rgba(255,255,255,0.06) 100%)`,
                        }}
                      />
                    </div>
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                        isMuted
                          ? 'bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] text-gray-300'
                          : 'bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 text-cyan-300'
                      }`}
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>

                {/* Network Info */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-violet-400 flex items-center gap-2">
                    <Radio size={16} />
                    Network Status
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: 'Server connected', active: true },
                      { label: 'Clock synced', active: true },
                      { label: 'Stream active', active: isPlaying },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3 p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.03]">
                        <div className={`w-1.5 h-1.5 rounded-full ${item.active ? 'bg-emerald-400' : 'bg-gray-600'} ${item.active ? 'animate-pulse' : ''}`} />
                        <span className="text-gray-400 text-sm">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-12 h-12 border-2 border-white/[0.06] border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Creating room...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

