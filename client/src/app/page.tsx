'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authService } from '@/lib/auth';
import { Play, Users, Zap, Lock } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState(authService.getCurrentUser());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
  }, []);

  const handleSignOut = () => {
    authService.signOut();
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900 to-slate-900 text-white p-4">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10"></div>
      </div>

      {!user ? (
        <>
          {/* Header */}
          <div className="max-w-6xl mx-auto mb-12">
            <div className="text-center pt-20">
              <div className="inline-block mb-6 px-4 py-2 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-full text-sm font-semibold">
                🚀 Real-Time Video Synchronization
              </div>
              <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                YouTube Sync Player
              </h1>
              <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
                Watch YouTube videos together with perfect synchronization. Zero delay, infinite possibilities.
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="max-w-6xl mx-auto mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 hover:border-purple-500 transition">
                <Play className="w-8 h-8 text-purple-400 mb-3" />
                <h3 className="font-bold mb-2">Stream Instantly</h3>
                <p className="text-gray-400 text-sm">Paste a YouTube URL and start streaming in seconds</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 hover:border-cyan-500 transition">
                <Users className="w-8 h-8 text-cyan-400 mb-3" />
                <h3 className="font-bold mb-2">Watch Together</h3>
                <p className="text-gray-400 text-sm">Invite friends with a simple shareable link</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 hover:border-pink-500 transition">
                <Zap className="w-8 h-8 text-pink-400 mb-3" />
                <h3 className="font-bold mb-2">Perfect Sync</h3>
                <p className="text-gray-400 text-sm">Sub-millisecond precision keeps everyone in sync</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 hover:border-blue-500 transition">
                <Lock className="w-8 h-8 text-blue-400 mb-3" />
                <h3 className="font-bold mb-2">Secure Rooms</h3>
                <p className="text-gray-400 text-sm">Private rooms with controlled access</p>
              </div>
            </div>
          </div>

          {/* Auth Actions */}
          <div className="max-w-md mx-auto">
            <div className="flex gap-3 mb-4">
              <Link href="/signin" className="flex-1">
                <button className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 transition">
                  Sign In
                </button>
              </Link>
              <Link href="/signup" className="flex-1">
                <button className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/50 transition">
                  Sign Up
                </button>
              </Link>
            </div>
            <button className="w-full py-3 bg-slate-800/50 border border-slate-700 text-white font-semibold rounded-xl hover:bg-slate-800 transition">
              🔵 Continue with Google
            </button>
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto pt-20">
          {/* Welcome Card */}
          <div className="bg-gradient-to-br from-slate-800/50 to-purple-900/50 backdrop-blur border border-slate-700 rounded-2xl p-8 mb-8 shadow-2xl">
            <h2 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Welcome back!
            </h2>
            <p className="text-gray-300 mb-6">
              Signed in as <span className="font-semibold text-white">{user.email}</span>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/host">
                <button className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-green-500/50 transition flex items-center justify-center gap-2">
                  <Play size={20} />
                  🎬 Host a Stream
                </button>
              </Link>

              <Link href="/join">
                <button className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 transition flex items-center justify-center gap-2">
                  <Users size={20} />
                  👥 Join a Stream
                </button>
              </Link>
            </div>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-full py-3 bg-slate-800/50 border border-slate-700 text-gray-300 font-semibold rounded-xl hover:bg-slate-800 transition"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
                    👥 Join a Stream
                  </button>
                </Link>

                <button
                  onClick={() => {
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('userId');
                    setIsAuthenticated(false);
                    setUserEmail('');
                  }}
                  className="w-full py-3 bg-white/10 border border-white/20 text-gray-200 font-semibold rounded-lg hover:bg-white/20 transition"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-gray-200 text-sm">
              <p className="font-semibold mb-2">✨ How It Works:</p>
              <ul className="space-y-1 text-xs">
                <li>• Host creates a stream link</li>
                <li>• Share link with friends</li>
                <li>• Everyone watches in perfect sync</li>
                <li>• Zero-delay, millisecond precision</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
