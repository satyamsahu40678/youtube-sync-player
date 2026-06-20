"use client";

interface QualityBadgeProps {
  quality: string;
}

export default function QualityBadge({ quality }: QualityBadgeProps) {
  return (
    <div className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
      <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">
        {quality}
      </span>
    </div>
  );
}
