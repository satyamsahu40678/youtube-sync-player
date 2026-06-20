'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { Volume2, VolumeX, Zap, Copy, Check, ArrowLeft, RefreshCw } from 'lucide-react';
import { NTPClockSync, PlaybackRateController } from '@/lib/sync';
import { RoomState } from '@/lib/types';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';

export default function JoinPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'SYNCED' | 'ADJUSTING' | 'RESYNCING'>('RESYNCING');
  const [rtt, setRtt] = useState(0);
  const [drift, setDrift] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [participantCount, setParticipantCount] = useState(1);

  const playerRef = useRef<HTMLIFrameElement>(null);
  const clockSync = useRef(new NTPClockSync());
  const rateController = useRef(new PlaybackRateController());
  const lastPositionRef = useRef(0);
  const expectedPositionRef = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('roomId');
      if (id) {
        setRoomId(id);
      }
    }
  }, []);

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!urlInput.trim()) {
      setError('Please paste a room URL or ID');
      return;
    }

    let extractedRoomId = urlInput.trim();

    // Check if user accidentally pasted a YouTube URL instead of a room URL
    if (extractedRoomId.includes('youtube.com/watch') || extractedRoomId.includes('youtu.be/')) {
      setError('This looks like a YouTube URL. Please paste the room share URL or room ID instead. YouTube URLs are used on the Host page.');
      return;
    }

    // Extract room ID from URL if full URL is provided
    const match = extractedRoomId.match(/roomId=([a-zA-Z0-9-]+)/);
    if (match) {
      extractedRoomId = match[1];
    }

    // Remove any non-alphanumeric characters (except hyphens for room IDs)
    extractedRoomId = extractedRoomId.replace(/[^a-zA-Z0-9-]/g, '');

    if (!extractedRoomId) {
      setError('Invalid room ID or URL format');
      return;
    }

    setRoomId(extractedRoomId);
    setUrlInput('');
  };

  const handleChangeRoom = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setRoomId('');
    setVideoId('');
    setIsConnected(false);
    setSyncStatus('RESYNCING');
    setError('');
  };

  useEffect(() => {
    if (!roomId) return;

    const socketInstance = io(SERVER_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketInstance.on('connect', async () => {
      console.log('✅ Connected to server');

      await clockSync.current.calibrate(socketInstance);
      setIsConnected(true);
      setSyncStatus('SYNCED');

      const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || `joiner-${Date.now()}` : `joiner-${Date.now()}`;
      socketInstance.emit('room:join', { roomId, userId });

      const syncInterval = setInterval(() => {
        const metrics = clockSync.current.getMetrics();
        setRtt(Math.round(metrics.rtt));
      }, 2000);

      return () => clearInterval(syncInterval);
    });

    socketInstance.on('room:state', (state: RoomState) => {
      console.log('📡 Room state received:', state);
      setVideoId(state.videoId || '');

      if (state.status === 'PLAYING') {
        const serverTime = clockSync.current.getServerTime();
        const timeDelta = (serverTime - state.serverTimeUpdatedAt) / 1000;
        expectedPositionRef.current = state.videoProgress + timeDelta;
      } else {
        expectedPositionRef.current = state.videoProgress;
      }

      const currentDrift = expectedPositionRef.current - lastPositionRef.current;
      setDrift(Math.abs(currentDrift));

      if (Math.abs(currentDrift) > 1500) {
        setSyncStatus('RESYNCING');
      } else if (Math.abs(currentDrift) > 50) {
        setSyncStatus('ADJUSTING');
      } else {
        setSyncStatus('SYNCED');
      }
    });

    socketInstance.on('room:participant-count', (data: { count: number }) => {
      setParticipantCount(data.count);
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
      setSyncStatus('RESYNCING');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    const positionInterval = setInterval(() => {
      lastPositionRef.current = expectedPositionRef.current;
    }, 100);

    return () => clearInterval(positionInterval);
  }, []);

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'SYNCED': return 'from-emerald-500 to-green-500';
      case 'ADJUSTING': return 'from-amber-500 to-orange-500';
      case 'RESYNCING': return 'from-red-500 to-rose-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'SYNCED': return '● Synced';
      case 'ADJUSTING': return '● Adjusting';
      case 'RESYNCING': return '● Resyncing';
      default: return 'Connecting...';
    }
  };

  const getSyncDotColor = () => {
    switch (syncStatus) {
      case 'SYNCED': return 'bg-emerald-400';
      case 'ADJUSTING': return 'bg-amber-400';
      case 'RESYNCING': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  const copyRoomUrl = () => {
    const url = `${window.location.origin}/join?roomId=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[500px] h-[500px] bg-cyan-600/12 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-48 -left-48 w-[500px] h-[500px] bg-blue-600/12 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative z-10 p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <Link href="/" className="group flex items-center gap-3">
              <ArrowLeft size={18} className="text-gray-500 group-hover:text-cyan-400 transition-colors" />
              <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Join Stream
              </h1>
            </Link>
            {isConnected && (
              <div className={`px-4 py-2 rounded-xl bg-gradient-to-r ${getSyncStatusColor()} text-white text-sm font-bold flex items-center gap-2 shadow-lg`}>
                <Zap size={14} />
                {getSyncStatusText()}
              </div>
            )}
          </div>

          {videoId && isConnected && roomId ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Player */}
              <div className="lg:col-span-2">
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl">
                  <div className="aspect-video bg-black relative">
                    <iframe
                      ref={playerRef}
                      src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                    {/* Transparent overlay to prevent joiner interactions */}
                    <div className="absolute inset-0 bg-transparent pointer-events-auto cursor-not-allowed" />
                  </div>

                  {/* Status Bar */}
                  <div className="p-4 border-t border-white/[0.06] text-center text-sm text-gray-400 bg-white/[0.02]">
                    <p>✨ You are a passive viewer — use the volume controls to adjust audio</p>
                  </div>
                </div>
              </div>

              {/* Sidebar Controls & Info */}
              <div className="space-y-5">
                {/* Volume Control */}
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
                    <p className="text-center text-xs text-gray-500 font-medium">
                      {isMuted ? '🔇 Muted' : `${volume}%`}
                    </p>
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

                {/* Sync Metrics */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-blue-400">📊 Sync Metrics</h3>
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
                      <span className="text-gray-500 text-sm">Status</span>
                      <span className="flex items-center gap-2 text-sm font-bold">
                        <div className={`w-2 h-2 rounded-full ${getSyncDotColor()} ${syncStatus === 'SYNCED' ? '' : 'animate-pulse'}`} />
                        <span className={syncStatus === 'SYNCED' ? 'text-emerald-400' : syncStatus === 'ADJUSTING' ? 'text-amber-400' : 'text-red-400'}>
                          {syncStatus}
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
                      <span className="text-gray-500 text-sm">RTT</span>
                      <span className="font-mono text-cyan-400 font-bold text-sm">{rtt}ms</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
                      <span className="text-gray-500 text-sm">Drift</span>
                      <span className="font-mono text-violet-400 font-bold text-sm">{Math.round(drift)}ms</span>
                    </div>
                  </div>
                </div>

                {/* Room Info */}
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-xl">
                  <h3 className="text-base font-bold mb-4 text-rose-400">🔐 Room Info</h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.04]">
                      <p className="text-gray-500 text-xs mb-1">Room ID</p>
                      <p className="text-cyan-400 font-mono text-xs break-all">{roomId}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.04] text-center">
                        <p className="text-gray-500 text-xs mb-1">Status</p>
                        <p className="text-emerald-400 font-bold text-sm">Connected</p>
                      </div>
                      <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.04] text-center">
                        <p className="text-gray-500 text-xs mb-1">Viewers</p>
                        <p className="text-blue-400 font-bold text-sm">{participantCount}</p>
                      </div>
                    </div>
                    <button
                      onClick={copyRoomUrl}
                      className="w-full py-2.5 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 text-violet-300 font-semibold rounded-xl hover:from-violet-600/30 hover:to-fuchsia-600/30 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      {copied ? (
                        <>
                          <Check size={14} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy Room URL
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleChangeRoom}
                      className="w-full py-2.5 bg-white/[0.03] border border-white/[0.06] text-gray-400 font-medium rounded-xl hover:bg-white/[0.06] hover:text-white transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                    >
                      <RefreshCw size={14} />
                      Change Room
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : !roomId ? (
            // Join Room Input Screen
            <div className="max-w-2xl mx-auto pt-8">
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
                <h2 className="text-2xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Join a Stream
                </h2>
                <p className="text-gray-400 mb-6 text-sm">
                  Enter the room URL or ID shared by the host to join a synchronized stream
                </p>

                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Room URL or ID</label>
                    <input
                      type="text"
                      placeholder="Paste room URL or ID here..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10 transition-all duration-200"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      ℹ️ Paste the share URL from the host or just the room ID
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                      ❌ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    Join Stream
                  </button>
                </form>

                <div className="mt-6 p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl">
                  <p className="font-semibold mb-2 text-sm text-gray-300">📌 Accepted formats:</p>
                  <ul className="space-y-1.5 text-xs text-gray-500">
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span className="font-mono">http://localhost:3000/join?roomId=room-1234567890</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span className="font-mono">room-1234567890</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            // Loading screen
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-white/[0.06] border-t-cyan-400 rounded-full animate-spin" />
              </div>
              <p className="text-gray-500 text-sm">Connecting to stream...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
