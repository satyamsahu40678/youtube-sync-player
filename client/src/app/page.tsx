"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authService, AuthUser } from "@/lib/auth";
import {
  Play,
  Users,
  Zap,
  Lock,
  LogOut,
  Sparkles,
  Trash2,
  Video,
  Radio,
} from "lucide-react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

interface ActiveRoom {
  id: string;
  title: string;
  hostId?: string;
  hostName: string;
  participantCount: number;
}

interface HistoryRoom {
  id: string;
  title: string;
  createdAt?: string;
  joinedAt?: string;
}

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [googleError, setGoogleError] = useState("");

  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [hostedHistory, setHostedHistory] = useState<HistoryRoom[]>([]);
  const [joinedHistory, setJoinedHistory] = useState<HistoryRoom[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    fetchActiveRooms();

    if (currentUser) {
      fetchHistory(currentUser.id);
    } else if (typeof window !== "undefined") {
      const guestId = localStorage.getItem("guest_id");
      if (guestId) {
        fetchHistory(guestId);
      }
    }
  }, []);

  const fetchActiveRooms = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/rooms/active`);
      if (res.ok) {
        const data = await res.json();
        setActiveRooms(data);
      }
    } catch (e) {
      console.error("Failed to fetch active rooms", e);
    }
  };

  const fetchHistory = async (userId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${SERVER_URL}/users/${userId}/history`);
      if (res.ok) {
        const data = await res.json();
        setHostedHistory(data.hosted);
        setJoinedHistory(data.joined);
      }
    } catch (e) {
      console.error("Failed to fetch history", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteHistory = async (
    roomId: string,
    type: "hosted" | "joined",
  ) => {
    const userId =
      user?.id ||
      (typeof window !== "undefined" ? localStorage.getItem("guest_id") : null);
    if (!userId) return;
    try {
      const res = await fetch(
        `${SERVER_URL}/history/${type}/${roomId}?userId=${userId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        // Optimistic UI update
        if (type === "hosted") {
          setHostedHistory((prev) => prev.filter((r) => r.id !== roomId));
        } else {
          setJoinedHistory((prev) => prev.filter((r) => r.id !== roomId));
        }
      }
    } catch (e) {
      console.error(`Failed to delete ${type} history`, e);
    }
  };

  const handleSignOut = () => {
    authService.signOut();
    setUser(null);
  };

  const handleGoogleSignIn = async () => {
    setGoogleError("");
    try {
      const result = await authService.signInWithGoogle();
      if (result) {
        setUser(result);
      }
    } catch (err: any) {
      setGoogleError(err.message || "Google sign-in failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white relative overflow-hidden pb-20">
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-48 -right-48 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[120px] animate-pulse" />
        <div
          className="absolute -bottom-48 -left-48 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[120px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-violet-500/10 rounded-full blur-[80px] animate-pulse"
          style={{ animationDelay: "3s" }}
        />
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
                  {
                    icon: Play,
                    color: "violet",
                    title: "Stream Instantly",
                    desc: "Paste a YouTube URL and start streaming in seconds",
                  },
                  {
                    icon: Users,
                    color: "cyan",
                    title: "Watch Together",
                    desc: "Invite friends with a simple shareable link",
                  },
                  {
                    icon: Zap,
                    color: "rose",
                    title: "Perfect Sync",
                    desc: "Sub-millisecond precision keeps everyone in sync",
                  },
                  {
                    icon: Lock,
                    color: "blue",
                    title: "Secure Rooms",
                    desc: "Private rooms with controlled access",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="group relative bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-${feature.color}-500/10 border border-${feature.color}-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                    >
                      <feature.icon
                        className={`w-6 h-6 text-${feature.color}-400`}
                      />
                    </div>
                    <h3 className="font-bold mb-2 text-white/90">
                      {feature.title}
                    </h3>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Active Rooms Section (Logged Out) */}
            {activeRooms.length > 0 && (
              <div className="max-w-4xl mx-auto mb-16">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="text-2xl font-bold text-white/90">
                    Live Rooms
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {activeRooms.map((room) => (
                    <Link href={`/join?roomId=${room.id}`} key={room.id}>
                      <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 hover:-translate-y-1 cursor-pointer">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-bold text-white/90 truncate mr-2">
                            {room.title}
                          </h3>
                          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md shrink-0">
                            <Users size={12} />
                            {room.participantCount}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 flex items-center gap-1.5">
                          <Radio size={14} className="text-violet-400" />
                          Host:{" "}
                          <span className="text-gray-300 font-medium truncate">
                            {room.hostName}
                          </span>
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Auth Actions */}
            <div className="max-w-md mx-auto">
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 shadow-2xl">
                <h2 className="text-xl font-bold text-center mb-6 text-white/90">
                  Get Started
                </h2>

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
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
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
          <div className="max-w-5xl mx-auto pt-8 sm:pt-16 animate-fadeIn">
            {/* Welcome Dashboard */}
            <div className="relative bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 sm:p-10 mb-8 shadow-2xl overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Card glow effect */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex items-center gap-6">
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    className="w-16 h-16 rounded-full border-2 border-violet-500/30"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full border-2 border-violet-500/30 bg-violet-500/10 flex items-center justify-center text-xl font-bold text-violet-300">
                    {user.name?.[0]?.toUpperCase() ||
                      user.email[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold mb-1">
                    Welcome back{user.name ? `, ${user.name}` : ""}!
                  </h2>
                  <p className="text-gray-400 text-sm">{user.email}</p>
                </div>
              </div>

              <div className="relative z-10 flex gap-3">
                <Link href="/host">
                  <button className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                    <Play size={18} />
                    Host
                  </button>
                </Link>

                <Link href="/join">
                  <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-500/25 hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2">
                    <Users size={18} />
                    Join
                  </button>
                </Link>

                <button
                  onClick={handleSignOut}
                  className="px-4 py-3 bg-white/[0.05] border border-white/[0.08] text-gray-300 font-medium rounded-xl hover:bg-white/[0.08] hover:text-white transition-all duration-200 flex items-center justify-center"
                  title="Sign Out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* History Section */}
              <div className="lg:col-span-2 space-y-8">
                {/* Hosted Rooms */}
                <div>
                  <h3 className="text-xl font-bold text-white/90 mb-4 flex items-center gap-2">
                    <Video className="text-violet-400" size={20} />
                    Your Hosted Rooms
                  </h3>

                  {isLoadingHistory ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      Loading history...
                    </div>
                  ) : hostedHistory.length === 0 ? (
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-8 text-center">
                      <p className="text-gray-500 text-sm">
                        You haven't hosted any rooms yet.
                      </p>
                      <Link href="/host">
                        <span className="text-violet-400 hover:text-violet-300 text-sm font-medium mt-2 inline-block transition-colors">
                          Start your first stream &rarr;
                        </span>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {hostedHistory.map((room) => (
                        <div
                          key={room.id}
                          className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between group hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <h4 className="font-bold text-gray-200 truncate">
                              {room.title}
                            </h4>
                            <p className="text-xs text-gray-500 font-mono mt-1">
                              ID: {room.id.slice(0, 12)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Link href={`/host?roomId=${room.id}`}>
                              <button className="px-3 py-1.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-lg text-xs font-bold hover:bg-violet-500/20 transition-colors">
                                Re-host
                              </button>
                            </Link>
                            <button
                              onClick={() =>
                                handleDeleteHistory(room.id, "hosted")
                              }
                              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Joined Rooms */}
                <div>
                  <h3 className="text-xl font-bold text-white/90 mb-4 flex items-center gap-2">
                    <Users className="text-blue-400" size={20} />
                    Recently Joined
                  </h3>

                  {isLoadingHistory ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      Loading history...
                    </div>
                  ) : joinedHistory.length === 0 ? (
                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-8 text-center">
                      <p className="text-gray-500 text-sm">
                        You haven't joined any rooms yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {joinedHistory.map((room) => (
                        <div
                          key={room.id}
                          className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between group hover:bg-white/[0.05] transition-colors"
                        >
                          <div className="flex-1 min-w-0 pr-4">
                            <h4 className="font-bold text-gray-200 truncate">
                              {room.title}
                            </h4>
                            <p className="text-xs text-gray-500 font-mono mt-1">
                              ID: {room.id.slice(0, 12)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Link href={`/join?roomId=${room.id}`}>
                              <button className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition-colors">
                                Re-join
                              </button>
                            </Link>
                            <button
                              onClick={() =>
                                handleDeleteHistory(room.id, "joined")
                              }
                              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: Top Active Rooms */}
              <div className="lg:col-span-1">
                <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 sticky top-6">
                  <h3 className="text-lg font-bold text-white/90 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse block" />
                    Top Live Rooms
                  </h3>

                  {activeRooms.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      No active rooms right now. Be the first to host!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeRooms.map((room) => {
                        const currentUserId =
                          user?.id ||
                          (typeof window !== "undefined"
                            ? localStorage.getItem("guest_id")
                            : null);
                        const isHost = currentUserId === room.hostId;
                        return (
                          <div
                            key={room.id}
                            className="relative group flex items-stretch gap-2"
                          >
                            <Link
                              href={`/join?roomId=${room.id}`}
                              className="flex-1 min-w-0"
                            >
                              <div className="block p-3 h-full bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.06] hover:border-emerald-500/30 transition-all duration-200">
                                <div className="flex justify-between items-start mb-1.5">
                                  <h4 className="font-bold text-sm text-gray-200 group-hover:text-emerald-400 transition-colors truncate pr-2">
                                    {room.title}
                                  </h4>
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                                    <Users size={10} />
                                    {room.participantCount}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 flex items-center gap-1.5 truncate">
                                  <Radio
                                    size={12}
                                    className="text-violet-400 shrink-0"
                                  />
                                  <span className="truncate">
                                    {room.hostName}
                                  </span>
                                </p>
                              </div>
                            </Link>
                            {isHost && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleDeleteHistory(room.id, "hosted");
                                  setActiveRooms((prev) =>
                                    prev.filter((r) => r.id !== room.id),
                                  );
                                }}
                                className="px-3 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-xl flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                title="Delete Room"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0) translateX(0);
            opacity: 0.2;
          }
          25% {
            transform: translateY(-20px) translateX(10px);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-10px) translateX(-5px);
            opacity: 0.3;
          }
          75% {
            transform: translateY(-30px) translateX(15px);
            opacity: 0.4;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}
