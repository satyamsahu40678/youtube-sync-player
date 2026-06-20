"use client";

import { Users, Crown } from "lucide-react";

interface MemberListProps {
  memberCount: number;
  isHost: boolean;
}

export default function MemberList({ memberCount, isHost }: MemberListProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl">
      <Users size={14} className="text-violet-400" />
      <span className="text-xs font-semibold text-white/70">
        {memberCount} {memberCount === 1 ? "viewer" : "viewers"}
      </span>
      {isHost && (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
          <Crown size={10} className="text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400">HOST</span>
        </span>
      )}
    </div>
  );
}
