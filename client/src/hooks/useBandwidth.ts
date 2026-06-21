"use client";

import { useEffect, useState, useCallback } from "react";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || "";

/**
 * Network bandwidth estimation hook.
 * Downloads a small test payload to estimate download speed.
 */
export function useBandwidth() {
  const [bandwidth, setBandwidth] = useState<number | null>(null); // in Mbps
  const [measuring, setMeasuring] = useState(false);

  const measure = useCallback(async () => {
    setMeasuring(true);
    try {
      // Use health endpoint as a lightweight probe
      const start = performance.now();
      const response = await fetch(`${SERVER_URL}/health`, {
        cache: "no-store",
      });
      await response.text();
      const end = performance.now();

      // Very rough estimate based on response time
      const durationMs = end - start;
      // Assume ~200 bytes response, extrapolate to Mbps
      const bytesPerMs = 200 / durationMs;
      const mbps = (bytesPerMs * 1000 * 8) / (1024 * 1024);

      // This is a rough lower bound — actual bandwidth is much higher
      // Real ABR is handled by HLS.js internally
      setBandwidth(Math.max(mbps, 1));
    } catch {
      setBandwidth(null);
    } finally {
      setMeasuring(false);
    }
  }, []);

  useEffect(() => {
    measure();
  }, [measure]);

  return { bandwidth, measuring, measure };
}
