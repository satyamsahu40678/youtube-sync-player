"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { NTPClockSync } from "@/lib/sync";

/**
 * React hook wrapping NTPClockSync.
 * Auto-syncs on connect, re-syncs periodically.
 * Properly cleans up intervals on unmount to prevent memory leaks.
 */
export function useClockSync(socket: Socket | null) {
  const clockRef = useRef(new NTPClockSync());
  const [clockOffset, setClockOffset] = useState(0);
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    if (!socket || !socket.connected) return;

    const clock = clockRef.current;

    // Initial calibration
    clock.calibrate(socket).then(() => {
      setClockOffset(clock.getMetrics().clockOffset);
      setSyncReady(true);
      clock.startPeriodicSync(socket, 10000); // Re-sync every 10s
    });

    return () => {
      // CRITICAL: Stop periodic sync to prevent memory leak from stacking intervals
      clock.stopPeriodicSync();
    };
  }, [socket, socket?.connected]);

  const serverNow = useCallback((): number => {
    return clockRef.current.getServerTime();
  }, []);

  return { clockOffset, syncReady, serverNow };
}
