'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authService, AuthUser } from '@/lib/auth';
import { Play, Users, Zap, Lock, LogOut, Sparkles } from 'lucide-react';

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    setUser(authService.getCurrentUser());
  }, []);

  const handleSignOut = () => {
    authService.signOut();
    setUser(null);
  };

  const handleGoogleSignIn = async () => {
    setGoogleError('');
    try {
      const result = await authService.signInWithGoogle();
      if (result) {
        setUser(result);
      }
    } catch (err: any) {
      setGoogleError(err.message || 'Google sign-in failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-48 -left-48 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-violet-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '3s' }} />
      </div>

      {/* Floating particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${6 + Math.random() * 8}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 p-4 sm:p-6">
        {!user ? (
          <>
            {/* Hero */}
            <div className="max-w-6xl mx-auto mb-16">
              <div className="text-center pt-16 sm:pt-24">
                <div className="inline-flex items-center gap-2 mb-8 px-5 py-2.5 bg-gradient-to-r from-violet-600/30 to-cyan-600/30 border border-violet-500/30 rounded-full text-sm font-medium text-violet-200 backdrop-blur-sm">
                  <Sparkles size={14} className="text-violet-400" />
                  Real-Time Video Synchronization
                </div>
                <h1 className="text-5xl sm:text-7xl font-extrabold mb-6 leading-tight">
                  <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                    YouTube Sync
                  </span>
                  <br />
                  <span className="text-white/90">Player</span>
                </h1>
                <p className="text-lg sm:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                  Watch YouTube videos together with perfect synchronization.
                  <br className="hidden sm:block" />
                  Zero delay, infinite possibilities.
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="max-w-6xl mx-auto mb-16">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  { icon: Play, color: 'violet', title: 'Stream Instantly', desc: 'Paste a YouTube URL and start streaming in seconds' },
                  { icon: Users, color: 'cyan', title: 'Watch Together', desc: 'Invite friends with a simple shareable link' },
                  { icon: Zap, color: 'rose', title: 'Perfect Sync', desc: 'Sub-millisecond precision keeps everyone in sync' },
                  { icon: Lock, color: 'blue', title: 'Secure Rooms', desc: 'Private rooms with controlled access' },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="group relative bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                  >
                    <div className={`w-12 h-12 rounded-xl bg-${feature.color}-500/10 border border-${feature.color}-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className={`w-6 h-6 text-${feature.color}-400`} />
                    </div>
                    <h3 className="font-bold mb-2 text-white/90">{feature.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Auth Actions */}
            <div className="max-w-md mx-auto">
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
                <h2 className="text-xl font-bold text-center mb-6 text-white/90">Get Started</h2>

                <div className="flex gap-3 mb-4">
                  <Link href="/signin" className="flex-1">
                    <button className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200">
                      Sign In
                    </button>
                  </Link>
                  <Link href="/signup" className="flex-1">
                    <button className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-violet-500/25 hover:-translate-y-0.5 transition-all duration-200">
                      Sign Up
                    </button>
                  </Link>
                </div>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/[0.06]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-[#0a0a12] text-gray-500">or</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleSignIn}
                  className="w-full py-3.5 bg-white/[0.05] border border-white/[0.1] text-white font-semibold rounded-xl hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-200 flex items-center justify-center gap-3"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                {googleError && (
                  <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center">
                    {googleError}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="max-w-2xl mx-auto pt-16 sm:pt-24 animate-fadeIn">
            {/* Welcome Card */}
            <div className="relative bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 sm:p-10 mb-6 shadow-2xl overflow-hidden">
              {/* Card glow effect */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl" />

              <div className="relative">
                {user.image && (
                  <img src={user.image} alt="" className="w-16 h-16 rounded-full border-2 border-violet-500/30 mb-4" />
                )}
                <h2 className="text-3xl sm:text-4xl font-extrabold mb-2">
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    Welcome back{user.name ? `, ${user.name}` : ''}!
                  </span>
                </h2>
                <p className="text-gray-400 mb-8">
                  Signed in as <span className="font-medium text-white/80">{user.email}</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Link href="/host">
                    <button className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                      <Play size={20} />
                      Host a Stream
                    </button>
                  </Link>

                  <Link href="/join">
                    <button className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                      <Users size={20} />
                      Join a Stream
                    </button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="w-full py-3 bg-white/[0.03] border border-white/[0.06] text-gray-400 font-medium rounded-xl hover:bg-white/[0.06] hover:text-white transition-all duration-200 flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.5; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.3; }
          75% { transform: translateY(-30px) translateX(15px); opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
      `}</style>
    </div>
  );
}
