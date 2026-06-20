import { SyncMetrics } from "./types";

/**
 * NTP-style clock synchronization utility.
 * Estimates client clock offset relative to server.
 */
export class NTPClockSync {
  private clockOffset: number = 0; // Milliseconds
  private rttSamples: { offset: number; rtt: number }[] = [];
  private readonly sampleSize = 10;

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

    return new Promise((resolve) => {
      socket.emit("clock-sync:ping", t1);

      socket.once("clock-sync:pong", (response: any) => {
        const t4 = this.preciseNow();
        const { serverReceiveTime: t2, serverSendTime: t3 } = response;

        const rtt = t4 - t1 - (t3 - t2);
        const offset = (t2 - t1 + (t3 - t4)) / 2;

        resolve({ rtt, offset });
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calibrate clock sync by performing multiple exchanges and averaging results.
   */
  async calibrate(socket: any): Promise<void> {
    console.log("🔄 Calibrating clock synchronization...");

    this.rttSamples = [];

    for (let i = 0; i < this.sampleSize; i++) {
      const sample = await this.performSync(socket);
      this.rttSamples.push(sample);
      await this.sleep(80); // 80ms apart for fast calibration
    }

    // Sort by RTT and take the best 7 samples
    const sorted = [...this.rttSamples].sort((a, b) => a.rtt - b.rtt);
    const best7 = sorted.slice(0, 7);

    // Calculate median of the best 7 samples
    const offsets = best7.map((s) => s.offset).sort((a, b) => a - b);
    this.clockOffset = offsets[Math.floor(offsets.length / 2)];

    console.log(
      `✅ Clock sync calibrated. Median Offset: ${this.clockOffset.toFixed(2)}ms`,
    );
  }

  /**
   * Auto re-sync every interval (e.g. 15 seconds)
   */
  startPeriodicSync(socket: any, intervalMs: number = 15000): void {
    setInterval(() => this.calibrate(socket), intervalMs);
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
 * Playback rate controller using proportional feedback loop.
 * Smoothly adjusts playback speed to match expected position.
 */
export class PlaybackRateController {
  private playbackRate: number = 1.0;

  /**
   * Calculate required playback rate adjustment based on drift.
   * drift > 0: we're behind (need to speed up)
   * drift < 0: we're ahead (need to slow down)
   */
  calculatePlaybackRate(driftMs: number): { rate: number; hardSeek: boolean } {
    const abs = Math.abs(driftMs);

    // < 30ms -> Do nothing (Perfect sync)
    if (abs < 30) {
      this.playbackRate = 1.0;
      return { rate: 1.0, hardSeek: false };
    }

    // > 2000ms -> Hard seek (Jump, last resort)
    if (abs > 2000) {
      this.playbackRate = 1.0;
      return { rate: 1.0, hardSeek: true };
    }

    // Proportional: bigger drift = bigger correction
    // Maps 30-2000ms drift to 0.01-0.08 rate adjustment
    const intensity = Math.min((abs - 30) / 2000, 0.08);
    this.playbackRate = driftMs > 0 ? 1.0 + intensity : 1.0 - intensity;

    return { rate: this.playbackRate, hardSeek: false };
  }

  getCurrentRate(): number {
    return this.playbackRate;
  }
}
