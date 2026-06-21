"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io as socketIO, Socket } from "socket.io-client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "";

/**
 * Socket.io connection hook with auto-reconnect and cleanup.
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = socketIO(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[SOCKET] Connected:", socket.id);
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[SOCKET] Disconnected");
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[SOCKET] Connection error:", err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { socket: socketRef.current, connected };
}
