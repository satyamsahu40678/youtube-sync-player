import { SyncMetrics } from "./types";

/**
 * NTP-style clock synchronization utility.
 * Estimates client clock offset relative to server.
 * Uses exponential moving average for smooth offset tracking.
 */
export class NTPClockSync {
  private clockOffset: number = 0; // Milliseconds
  private rttSamples: { offset: number; rtt: number }[] = [];
  private readonly sampleSize = 5; // Reduced from 10 for faster startup
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private isCalibrating: boolean = false;

  // Use performance.now() for sub-millisecond precision
  private performanceBase = Date.now() - performance.now();

  private preciseNow(): number {
    return this.performanceBase + performance.now();
  }

  /**
   * Perform a single clock sync ping-pong exchange.
   * Returns RTT and offset measurements.
   */
  async performSync(socket: any): Promise<{ rtt: number; offset: number }> {
    const t1 = this.preciseNow();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off("clock-sync:pong", handler);
        reject(new Error("Clock sync timeout"));
      }, 3000);

      const handler = (response: any) => {
        clearTimeout(timeout);
        const t4 = this.preciseNow();
        const { serverReceiveTime: t2, serverSendTime: t3 } = response;

        const rtt = t4 - t1 - (t3 - t2);
        const offset = (t2 - t1 + (t3 - t4)) / 2;

        resolve({ rtt, offset });
      };

      socket.emit("clock-sync:ping", t1);
      socket.once("clock-sync:pong", handler);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calibrate clock sync by performing multiple exchanges and averaging results.
   * Uses EMA (Exponential Moving Average) for smooth offset tracking.
   */
  async calibrate(socket: any): Promise<void> {
    // Prevent concurrent calibrations from stacking
    if (this.isCalibrating) return;
    this.isCalibrating = true;

    try {
      console.log("🔄 Calibrating clock synchronization...");

      this.rttSamples = [];

      for (let i = 0; i < this.sampleSize; i++) {
        try {
          const sample = await this.performSync(socket);
          this.rttSamples.push(sample);
        } catch {
          // Skip failed samples
        }
        await this.sleep(50); // 50ms apart for faster calibration (was 80ms)
      }

      if (this.rttSamples.length === 0) {
        console.warn("⚠️ Clock sync calibration failed: no successful samples");
        return;
      }

      // Sort by RTT and take the best samples (low RTT = more accurate)
      const sorted = [...this.rttSamples].sort((a, b) => a.rtt - b.rtt);
      const bestCount = Math.min(3, sorted.length);
      const best = sorted.slice(0, bestCount);

      // Calculate median offset from best samples
      const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
      const newOffset = offsets[Math.floor(offsets.length / 2)];

      // Use EMA to smooth offset transitions (alpha=0.3 for existing, 1.0 for first calibration)
      if (this.clockOffset === 0) {
        this.clockOffset = newOffset;
      } else {
        const alpha = 0.3;
        this.clockOffset = alpha * newOffset + (1 - alpha) * this.clockOffset;
      }

      console.log(
        `✅ Clock sync calibrated. Offset: ${this.clockOffset.toFixed(2)}ms, Best RTT: ${sorted[0].rtt.toFixed(1)}ms`,
      );
    } finally {
      this.isCalibrating = false;
    }
  }

  /**
   * Auto re-sync every interval (default 10 seconds).
   * Only one periodic sync can be active at a time.
   */
  startPeriodicSync(socket: any, intervalMs: number = 10000): void {
    // Clear any existing interval first to prevent stacking
    this.stopPeriodicSync();
    this.syncIntervalId = setInterval(() => this.calibrate(socket), intervalMs);
  }

  /**
   * Stop the periodic sync interval.
   */
  stopPeriodicSync(): void {
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Get the current server time adjusted for client clock offset.
   */
  getServerTime(): number {
    return this.preciseNow() + this.clockOffset;
  }

  /**
   * Get current sync metrics for UI display.
   */
  getMetrics(): Omit<SyncMetrics, "driftMs" | "status"> {
    const avgRtt =
      this.rttSamples.length > 0
        ? this.rttSamples.reduce((a, b) => a + b.rtt, 0) /
          this.rttSamples.length
        : 0;
    return {
      rtt: avgRtt,
      clockOffset: this.clockOffset,
    };
  }
}

/**
 * Playback rate controller using PID-style feedback loop.
 * Smoothly adjusts playback speed to match expected position.
 * Uses integral term to prevent steady-state error.
 */
export class PlaybackRateController {
  private playbackRate: number = 1.0;
  private integralError: number = 0;
  private lastDriftMs: number = 0;
  private readonly maxIntegral = 500; // Cap integral to prevent windup

  /**
   * Calculate required playback rate adjustment based on drift.
   * drift > 0: we're behind (need to speed up)
   * drift < 0: we're ahead (need to slow down)
   *
   * Uses proportional + integral control for smooth, accurate correction.
   */
  calculatePlaybackRate(driftMs: number): { rate: number; hardSeek: boolean } {
    const abs = Math.abs(driftMs);

    // < 20ms -> Do nothing (Perfect sync zone - tightened from 30ms)
    if (abs < 20) {
      this.playbackRate = 1.0;
      this.integralError = 0; // Reset integral when synced
      this.lastDriftMs = driftMs;
      return { rate: 1.0, hardSeek: false };
    }

    // > 1500ms -> Hard seek (tightened from 2000ms for faster convergence)
    if (abs > 1500) {
      this.playbackRate = 1.0;
      this.integralError = 0;
      this.lastDriftMs = driftMs;
      return { rate: 1.0, hardSeek: true };
    }

    // PID-style control
    // Proportional: bigger drift = bigger correction (maps 20-1500ms to 0.005-0.06)
    const kP = 0.00004;
    const proportional = kP * abs;

    // Integral: accumulated error for steady-state correction
    this.integralError += driftMs * 0.001; // Scale down
    this.integralError = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integralError));
    const kI = 0.00002;
    const integral = kI * Math.abs(this.integralError);

    const adjustment = Math.min(proportional + integral, 0.08); // Cap at 8% speed change
    this.playbackRate = driftMs > 0 ? 1.0 + adjustment : 1.0 - adjustment;

    this.lastDriftMs = driftMs;
    return { rate: this.playbackRate, hardSeek: false };
  }

  getCurrentRate(): number {
    return this.playbackRate;
  }

  reset(): void {
    this.playbackRate = 1.0;
    this.integralError = 0;
    this.lastDriftMs = 0;
  }
}
