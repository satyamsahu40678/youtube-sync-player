import React from 'react';

export default function SimulatedSpectrum({ isPlaying }: { isPlaying: boolean }) {
  // Generate 40 bars with random heights and animation delays
  return (
    <div className="flex items-end justify-center gap-1 h-32 w-full max-w-lg mx-auto">
      {Array.from({ length: 40 }).map((_, i) => {
        const heightBase = 20 + Math.random() * 80; // 20% to 100%
        const animationDelay = Math.random() * -1.5; // Random start time
        const duration = 0.5 + Math.random() * 0.5; // 0.5s to 1.0s
        
        // Use a bell curve to make center bars taller
        const distanceFromCenter = Math.abs((i - 20) / 20); // 0 at center, 1 at edges
        const heightMultiplier = 1 - distanceFromCenter * 0.7; // Center = 1x, Edges = 0.3x
        
        return (
          <div
            key={i}
            className={`w-2.5 rounded-t-sm transition-all duration-300 ${isPlaying ? 'bg-emerald-400/80' : 'bg-gray-700/50 h-2'}`}
            style={
              isPlaying
                ? {
                    height: `${heightBase * heightMultiplier}%`,
                    animation: `spectrum-bounce ${duration}s ease-in-out infinite alternate`,
                    animationDelay: `${animationDelay}s`,
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
