"use client";

import { SyncStatus } from "@/lib/types";

interface SyncIndicatorProps {
  status: SyncStatus;
}

const STATUS_CONFIG: Record<
  SyncStatus,
  { color: string; bg: string; label: string }
> = {
  synced: {
    color: "bg-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "Synced",
  },
  drifted: {
    color: "bg-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    label: "Syncing",
  },
  buffering: {
    color: "bg-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    label: "Buffering",
  },
  disconnected: {
    color: "bg-gray-400",
    bg: "bg-gray-500/10 border-gray-500/20",
    label: "Offline",
  },
};

export default function SyncIndicator({ status }: SyncIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm ${config.bg}`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${config.color} ${status === "synced" ? "animate-pulse" : ""}`}
      />
      <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
        {config.label}
      </span>
    </div>
  );
}
