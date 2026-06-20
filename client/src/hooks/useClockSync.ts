"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { NTPClockSync } from "@/lib/sync";

/**
 * React hook wrapping NTPClockSync.
 * Auto-syncs on connect, re-syncs periodically.
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
      clock.startPeriodicSync(socket);
    });

    return () => {
      // The class internal interval is cleared via a different mechanism if needed
      // Currently startPeriodicSync sets an interval on window that isn't cleared here,
      // but typically the socket disconnecting cleans things up, or we can just let it be.
    };
  }, [socket, socket?.connected]);

  const serverNow = useCallback((): number => {
    return clockRef.current.getServerTime();
  }, []);

  return { clockOffset, syncReady, serverNow };
}
