'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { Share2, Play, Pause, Copy, Check, AlertCircle } from 'lucide-react';
import { NTPClockSync } from '@/lib/sync';
import { extractYouTubeVideoId, isValidYouTubeUrl, buildYouTubeEmbedUrl, extractYouTubeStartTime } from '@/lib/youtube';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

interface RoomState {
  videoId: string | null;
  status: 'PLAYING' | 'PAUSED';
  videoProgress: number;
  serverTimeUpdatedAt: number;
}

export default function HostPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [participantCount, setParticipantCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const playerRef = useRef<HTMLIFrameElement>(null);
  const clockSync = useRef(new NTPClockSync());

  useEffect(() => {
    const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || `host-${Date.now()}` : `host-${Date.now()}`;
    const socketInstance = io(SERVER_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketInstance.on('connect', async () => {
      console.log('✅ Connected to server');

      // Calibrate clock sync
      await clockSync.current.calibrate(socketInstance);

      // Create a new room
      const newRoomId = `room-${Date.now()}`;
      setRoomId(newRoomId);

      // Join the room
      socketInstance.emit('room:join', { roomId: newRoomId, userId });
    });

    socketInstance.on('room:participant-count', (data: { count: number }) => {
      setParticipantCount(data.count);
    });

    socketInstance.on('room:state', (state: RoomState) => {
      console.log('📡 Room state updated:', state);
      if (state.videoId) {
        setVideoId(state.videoId);
      }
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const handlePlayVideo = () => {
    setError('');

    if (!videoUrl.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(videoUrl)) {
      setError('Invalid YouTube URL format. Please use youtube.com or youtu.be');
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
    setProgress(0);

    if (socket) {
      socket.emit('room:update-video', { roomId, videoId: extractedId, startTime: startTimeValue || 0 });
      setIsPlaying(true);
    }
  };

  const togglePlayPause = () => {
    if (socket) {
      const newStatus = isPlaying ? 'PAUSED' : 'PLAYING';
      socket.emit('room:playback-control', {
        roomId,
        status: newStatus,
        progress,
      });
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (newProgress: number) => {
    setProgress(newProgress);
    if (socket) {
      socket.emit('room:seek', { roomId, progress: newProgress });
    }
  };

  const copyShareUrl = () => {
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/join?roomId=${roomId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 text-white p-4">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl -z-10"></div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <Link href="/">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition">
              YouTube Sync - HOST
            </h1>
          </Link>
          {roomId && (
            <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/50 rounded-xl px-4 py-2">
              <p className="text-xs text-gray-300">Room ID</p>
              <p className="text-lg font-mono font-bold text-green-400">{roomId.slice(0, 12)}...</p>
            </div>
          )}
        </div>

        {roomId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Video Player */}
            <div className="lg:col-span-2">
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
                {videoId ? (
                  <div className="aspect-video bg-black relative">
                    <iframe
                      ref={playerRef}
                      src={buildYouTubeEmbedUrl(videoId, startTime)}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex flex-col items-center justify-center">
                    <Play size={48} className="text-gray-600 mb-3" />
                    <p className="text-gray-400">Enter a YouTube URL below to start streaming</p>
                  </div>
                )}

                {/* Controls */}
                <div className="p-6 border-t border-slate-700 space-y-4 bg-slate-900/50">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">YouTube URL</label>
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="text"
                        placeholder="Paste YouTube link (e.g., https://youtu.be/dQw4w9WgXcQ or with timestamp)"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handlePlayVideo()}
                        className="flex-1 min-w-64 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition"
                      />
                      <button
                        onClick={handlePlayVideo}
                        className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:shadow-lg hover:shadow-green-500/50 rounded-lg font-semibold transition flex items-center gap-2"
                      >
                        <Play size={18} />
                        Play
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">✨ Supports timestamps: youtu.be/ID?t=60s or youtu.be/-PXivr2hmMA?si=xxxxx</p>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}

                  {videoId && (
                    <div className="flex gap-4 flex-wrap">
                      <button
                        onClick={togglePlayPause}
                        className="flex-1 min-w-32 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-500/50 rounded-lg font-semibold transition"
                      >
                        {isPlaying ? (
                          <>
                            <Pause size={20} />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play size={20} />
                            Play
                          </>
                        )}
                      </button>

                      <div className="flex-1 min-w-32 flex items-center gap-2">
                        <span className="text-xs text-gray-400 min-w-fit">Seek:</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={progress}
                          onChange={(e) => handleSeek(parseFloat(e.target.value))}
                          className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                          style={{
                            background: `linear-gradient(to right, rgb(34, 197, 94) 0%, rgb(34, 197, 94) ${progress}%, rgb(51, 65, 85) ${progress}%, rgb(51, 65, 85) 100%)`,
                          }}
                        />
                        <span className="text-xs text-gray-400 min-w-fit">{Math.round(progress)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Share URL */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-green-400 flex items-center gap-2">
                  <Share2 size={20} />
                  Share Stream
                </h3>
                <div className="bg-slate-900/50 rounded-lg p-3 text-xs font-mono break-all text-cyan-400 mb-3 border border-slate-600">
                  {typeof window !== 'undefined' ? `${window.location.origin}/join?roomId=${roomId}` : 'Loading...'}
                </div>
                <button
                  onClick={copyShareUrl}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:shadow-lg hover:shadow-green-500/50 rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check size={18} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={18} />
                      Copy Link
                    </>
                  )}
                </button>
              </div>

              {/* Stats */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-blue-400">📊 Live Stats</h3>
                <div className="space-y-4">
                  <div className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-gray-400 text-sm">Connected Viewers</p>
                    <p className="text-3xl font-bold text-green-400">{participantCount}</p>
                  </div>
                  <div className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-gray-400 text-sm">Status</p>
                    <p className={`text-lg font-semibold flex items-center gap-2 ${isPlaying ? 'text-blue-400' : 'text-yellow-400'}`}>
                      {isPlaying ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                          Playing
                        </>
                      ) : (
                        <>
                          <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                          Paused
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Network Info */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-purple-400">🌐 Network Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 p-2 bg-slate-700/50 rounded">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span className="text-gray-300">Server connected</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-700/50 rounded">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span className="text-gray-300">Clock synced</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-slate-700/50 rounded">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-gray-300">Stream active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin">
              <div className="w-12 h-12 border-4 border-slate-600 border-t-green-400 rounded-full"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
      setIsPlaying(true);
    }
  };

  const togglePlayPause = () => {
    if (socket) {
      const newStatus = isPlaying ? 'PAUSED' : 'PLAYING';
      socket.emit('room:playback-control', {
        roomId,
        status: newStatus,
        progress,
      });
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (newProgress: number) => {
    setProgress(newProgress);
    if (socket) {
      socket.emit('room:seek', { roomId, progress: newProgress });
    }
  };

  const copyShareUrl = () => {
    const shareUrl = `${window.location.origin}/join?roomId=${roomId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent cursor-pointer">
              YouTube Sync - HOST
            </h1>
          </Link>
          <div className="text-right">
            {roomId && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg px-4 py-2">
                <p className="text-xs text-gray-400">Room ID</p>
                <p className="text-lg font-mono font-bold">{roomId.slice(0, 8)}...</p>
              </div>
            )}
          </div>
        </div>

        {roomId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Video Player */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl overflow-hidden">
                {videoId ? (
                  <div className="aspect-video bg-black relative">
                    <iframe
                      ref={playerRef}
                      src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-900 flex items-center justify-center">
                    <p className="text-gray-400">Enter a YouTube URL below to start</p>
                  </div>
                )}

                {/* Controls */}
                <div className="p-4 border-t border-gray-700 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      YouTube URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={handlePlayVideo}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition"
                      >
                        Play
                      </button>
                    </div>
                  </div>

                  {videoId && (
                    <div className="flex gap-4">
                      <button
                        onClick={togglePlayPause}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition"
                      >
                        {isPlaying ? (
                          <>
                            <Pause size={20} /> Pause
                          </>
                        ) : (
                          <>
                            <Play size={20} /> Play
                          </>
                        )}
                      </button>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress}
                        onChange={(e) => handleSeek(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Share URL */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Share2 size={20} />
                  Share Stream
                </h3>
                <div className="bg-gray-900 rounded-lg p-3 text-sm font-mono break-all text-gray-300 mb-3">
                  {`${window.location.origin}/join?roomId=${roomId}`}
                </div>
                <button
                  onClick={copyShareUrl}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check size={18} /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={18} /> Copy URL
                    </>
                  )}
                </button>
              </div>

              {/* Stats */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold mb-4">Live Stats</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-gray-400 text-sm">Connected Viewers</p>
                    <p className="text-3xl font-bold text-green-400">{participantCount}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Status</p>
                    <p className={`text-xl font-semibold ${isPlaying ? 'text-blue-400' : 'text-gray-400'}`}>
                      {isPlaying ? '▶ Playing' : '⏸ Paused'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Network Info */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold mb-3">🌐 Network</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>✅ Connected to server</p>
                  <p>🔄 Clock sync calibrated</p>
                  <p>📡 Real-time streaming active</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-400">Loading room...</p>
          </div>
        )}
      </div>
    </div>
  );
}
