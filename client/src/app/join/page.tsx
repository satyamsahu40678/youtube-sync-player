'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';
import { Volume2, VolumeX, Zap, Copy, Check } from 'lucide-react';
import { NTPClockSync, PlaybackRateController } from '@/lib/sync';
import { RoomState } from '@/lib/types';
import { extractYouTubeStartTime } from '@/lib/youtube';

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
    // Extract roomId from URL
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

    // Extract room ID from URL if full URL is provided
    // Format: http://localhost:3000/join?roomId=xxx or just xxx
    const match = extractedRoomId.match(/roomId=([a-zA-Z0-9]+)/);
    if (match) {
      extractedRoomId = match[1];
    }

    // Remove any non-alphanumeric characters
    extractedRoomId = extractedRoomId.replace(/[^a-zA-Z0-9]/g, '');

    if (!extractedRoomId) {
      setError('Invalid room ID or URL format');
      return;
    }

    setRoomId(extractedRoomId);
    setUrlInput('');
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

      // Calibrate clock sync
      await clockSync.current.calibrate(socketInstance);
      setIsConnected(true);
      setSyncStatus('SYNCED');

      // Get user ID
      const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || `joiner-${Date.now()}` : `joiner-${Date.now()}`;

      // Join the room
      socketInstance.emit('room:join', { roomId, userId });

      // Start continuous sync loop
      const syncInterval = setInterval(() => {
        const metrics = clockSync.current.getMetrics();
        setRtt(Math.round(metrics.rtt));
      }, 2000);

      return () => clearInterval(syncInterval);
    });

    socketInstance.on('room:state', (state: RoomState) => {
      console.log('📡 Room state received:', state);
      setVideoId(state.videoId || '');

      // Calculate expected position
      if (state.status === 'PLAYING') {
        const serverTime = clockSync.current.getServerTime();
        const timeDelta = (serverTime - state.serverTimeUpdatedAt) / 1000;
        expectedPositionRef.current = state.videoProgress + timeDelta;
      } else {
        expectedPositionRef.current = state.videoProgress;
      }

      // Update sync status based on drift
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

  // Update last position periodically
  useEffect(() => {
    const positionInterval = setInterval(() => {
      lastPositionRef.current = expectedPositionRef.current;
    }, 100);

    return () => clearInterval(positionInterval);
  }, []);

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'SYNCED':
        return 'from-green-500 to-emerald-500';
      case 'ADJUSTING':
        return 'from-yellow-500 to-orange-500';
      case 'RESYNCING':
        return 'from-red-500 to-pink-500';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'SYNCED':
        return '🟢 Synced';
      case 'ADJUSTING':
        return '🟡 Adjusting';
      case 'RESYNCING':
        return '🔴 Resyncing';
      default:
        return 'Connecting...';
    }
  };

  const copyRoomUrl = () => {
    const url = `${window.location.origin}/join?roomId=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 text-white p-4">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -z-10"></div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
          <Link href="/">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition">
              YouTube Sync - JOIN
            </h1>
          </Link>
          <div className={`px-4 py-2 rounded-lg bg-gradient-to-r ${getSyncStatusColor()} text-black font-bold flex items-center gap-2`}>
            <Zap size={20} />
            {getSyncStatusText()}
          </div>
        </div>

        {videoId && isConnected && roomId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Player */}
            <div className="lg:col-span-2">
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
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
                <div className="p-4 border-t border-slate-700 text-center text-sm text-gray-400 bg-slate-900/50">
                  <p>✨ You are a passive viewer. Use the volume controls to adjust audio.</p>
                </div>
              </div>
            </div>

            {/* Sidebar Controls & Info */}
            <div className="space-y-6">
              {/* Volume Control */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-cyan-400">🔊 Audio Control</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {isMuted ? (
                      <VolumeX size={24} className="text-red-400" />
                    ) : (
                      <Volume2 size={24} className="text-cyan-400" />
                    )}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, rgb(34, 197, 94) 0%, rgb(34, 197, 94) ${volume}%, rgb(51, 65, 85) ${volume}%, rgb(51, 65, 85) 100%)`,
                      }}
                    />
                  </div>
                  <p className="text-center text-sm text-gray-400">
                    {isMuted ? '🔇 Muted' : `🔊 ${volume}%`}
                  </p>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-full py-2 rounded-lg font-semibold transition ${
                      isMuted
                        ? 'bg-slate-700 hover:bg-slate-600 text-white'
                        : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                    }`}
                  >
                    {isMuted ? '🔇 Unmute' : '🔊 Mute'}
                  </button>
                </div>
              </div>

              {/* Sync Metrics */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-blue-400">📊 Sync Metrics</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-gray-400">Status:</span>
                    <span className={`font-bold ${syncStatus === 'SYNCED' ? 'text-green-400' : syncStatus === 'ADJUSTING' ? 'text-yellow-400' : 'text-red-400'}`}>
                      {getSyncStatusText()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-gray-400">RTT:</span>
                    <span className="font-mono text-cyan-400 font-bold">{rtt}ms</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-lg">
                    <span className="text-gray-400">Drift:</span>
                    <span className="font-mono text-purple-400 font-bold">{Math.round(drift)}ms</span>
                  </div>
                </div>
              </div>

              {/* Room Info */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-4 text-pink-400">🔐 Room Info</h3>
                <div className="space-y-3 text-sm">
                  <div className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-gray-400 text-xs mb-1">Room ID</p>
                    <p className="text-cyan-400 font-mono text-xs break-all">{roomId}</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 p-3 bg-slate-700/50 rounded-lg text-center">
                      <p className="text-gray-400 text-xs mb-1">Status</p>
                      <p className="text-green-400 font-bold">✅ Connected</p>
                    </div>
                    <div className="flex-1 p-3 bg-slate-700/50 rounded-lg text-center">
                      <p className="text-gray-400 text-xs mb-1">Viewers</p>
                      <p className="text-blue-400 font-bold">{participantCount}</p>
                    </div>
                  </div>
                  <button
                    onClick={copyRoomUrl}
                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <>
                        <Check size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy Room URL
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : !roomId ? (
          // Join Room Input Screen
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-2xl">
              <h2 className="text-2xl font-bold mb-2 text-cyan-400">Join a Stream</h2>
              <p className="text-gray-300 mb-6">Enter the room URL or ID to join a synchronized stream</p>

              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Room URL or ID</label>
                  <input
                    type="text"
                    placeholder="Paste room URL or ID here..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    ℹ️ Paste the share URL or just the room ID
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    ❌ {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition"
                >
                  Join Stream
                </button>
              </form>

              <div className="mt-6 p-4 bg-slate-700/30 border border-slate-600 rounded-lg text-sm text-gray-300">
                <p className="font-semibold mb-2">📌 Examples:</p>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>✓ Room URL: http://localhost:3000/join?roomId=abc123xyz</li>
                  <li>✓ Room ID: abc123xyz</li>
                  <li>✓ Share Link: (paste directly)</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          // Loading screen
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin">
              <Zap size={32} className="text-cyan-400" />
            </div>
            <p className="text-gray-400">Loading stream...</p>
          </div>
        )}
      </div>
    </div>
  );
}

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [roomId, userId]);

  // Update last position periodically
  useEffect(() => {
    const positionInterval = setInterval(() => {
      // In a real app, this would read from the YouTube player's current time
      // For now, we're simulating the position
      lastPositionRef.current = expectedPositionRef.current;
    }, 100);

    return () => clearInterval(positionInterval);
  }, []);

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case 'SYNCED':
        return 'from-green-500 to-emerald-500';
      case 'ADJUSTING':
        return 'from-yellow-500 to-orange-500';
      case 'RESYNCING':
        return 'from-red-500 to-pink-500';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case 'SYNCED':
        return '🟢 Synced';
      case 'ADJUSTING':
        return '🟡 Adjusting';
      case 'RESYNCING':
        return '🔴 Resyncing';
      default:
        return 'Connecting...';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent cursor-pointer">
              YouTube Sync - JOIN
            </h1>
          </Link>
          <div className={`px-4 py-2 rounded-lg bg-gradient-to-r ${getSyncStatusColor()} text-black font-bold`}>
            <div className="flex items-center gap-2">
              <Zap size={20} />
              {getSyncStatusText()}
            </div>
          </div>
        </div>

        {videoId && isConnected ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Player */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl overflow-hidden">
                <div className="aspect-video bg-black relative">
                  <iframe
                    ref={playerRef}
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=0`}
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                  {/* Transparent overlay to prevent joiner interactions */}
                  <div className="absolute inset-0 bg-transparent pointer-events-auto cursor-not-allowed" />
                </div>

                {/* Status Bar */}
                <div className="p-4 border-t border-gray-700 text-center text-sm text-gray-400">
                  <p>You are a passive viewer. Use the volume controls below to adjust audio.</p>
                </div>
              </div>
            </div>

            {/* Sidebar Controls & Info */}
            <div className="space-y-6">
              {/* Volume Control */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold mb-4">Audio Control</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {isMuted ? (
                      <VolumeX size={24} className="text-gray-400" />
                    ) : (
                      <Volume2 size={24} className="text-blue-400" />
                    )}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                  </div>
                  <p className="text-center text-sm text-gray-400">
                    {isMuted ? 'Muted' : `${volume}%`}
                  </p>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-full py-2 rounded-lg font-semibold transition ${
                      isMuted
                        ? 'bg-gray-700 hover:bg-gray-600'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                </div>
              </div>

              {/* Sync Metrics */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold mb-3">📊 Sync Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status:</span>
                    <span className={`font-bold ${syncStatus === 'SYNCED' ? 'text-green-400' : ''}`}>
                      {getSyncStatusText()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">RTT:</span>
                    <span className="font-mono">{rtt}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Drift:</span>
                    <span className="font-mono">
                      {Math.abs(expectedPositionRef.current - lastPositionRef.current).toFixed(0)}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Room Info */}
              <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-4">
                <h3 className="text-lg font-bold mb-3">🔐 Room Info</h3>
                <div className="text-xs text-gray-400 space-y-2">
                  <p>
                    <span className="text-gray-300 block font-mono break-all">{roomId}</span>
                  </p>
                  <p>✅ Connected</p>
                  <p>🔄 Synchronized playback</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-gray-400">
              {roomId ? 'Loading stream...' : 'No room ID provided'}
            </p>
            {!isConnected && roomId && (
              <div className="animate-spin">
                <Zap size={32} className="text-blue-400" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
