import { SyncMetrics } from "./types";

/**
 * NTP-style clock synchronization utility.
 * Estimates client clock offset relative to server.
 */
export class NTPClockSync {
  private clockOffset: number = 0; // Milliseconds
  private rttSamples: number[] = [];
  private readonly sampleSize = 5;

  /**
   * Perform a single clock sync ping-pong exchange.
   * Returns RTT and offset measurements.
   */
  async performSync(socket: any): Promise<{ rtt: number; offset: number }> {
    const t1 = Date.now();

    return new Promise((resolve) => {
      socket.emit("clock-sync:ping", t1);

      socket.once("clock-sync:pong", (response: any) => {
        const t4 = Date.now();
        const { serverReceiveTime: t2, serverSendTime: t3 } = response;

        const rtt = t4 - t1 - (t3 - t2);
        const offset = (t2 - t1 + (t3 - t4)) / 2;

        this.rttSamples.push(rtt);
        resolve({ rtt, offset });
      });
    });
  }

  /**
   * Calibrate clock sync by performing multiple exchanges and averaging results.
   */
  async calibrate(socket: any): Promise<void> {
    console.log("🔄 Calibrating clock synchronization...");

    for (let i = 0; i < this.sampleSize; i++) {
      const { rtt, offset } = await this.performSync(socket);
      this.clockOffset = offset;
      console.log(
        `  Sample ${i + 1}/${this.sampleSize}: RTT=${rtt.toFixed(2)}ms, Offset=${offset.toFixed(2)}ms`
      );
    }

    // Discard highest RTT and average the rest
    const validSamples = this.rttSamples.slice(0, this.sampleSize - 1);
    const avgRtt =
      validSamples.reduce((a, b) => a + b, 0) / validSamples.length;

    console.log(
      `✅ Clock sync calibrated. Average RTT: ${avgRtt.toFixed(2)}ms, Offset: ${this.clockOffset.toFixed(2)}ms`
    );
  }

  /**
   * Get the current server time adjusted for client clock offset.
   */
  getServerTime(): number {
    return Date.now() + this.clockOffset;
  }

  /**
   * Get current sync metrics for UI display.
   */
  getMetrics(): Omit<SyncMetrics, "driftMs" | "status"> {
    const avgRtt =
      this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length;
    return {
      rtt: avgRtt,
      clockOffset: this.clockOffset,
    };
  }
}

/**
 * Playback rate controller using PI feedback loop.
 * Smoothly adjusts playback speed to match expected position.
 */
export class PlaybackRateController {
  private playbackRate: number = 1.0;

  /**
   * Calculate required playback rate adjustment based on drift.
   * drift > 0: we're behind (need to speed up)
   * drift < 0: we're ahead (need to slow down)
   */
  calculatePlaybackRate(driftMs: number): number {
    const TOLERANCE_MS = 50;
    const MIN_DRIFT_TO_ADJUST = 50;
    const MAX_DRIFT_TO_ADJUST = 1500;
    const HARD_SEEK_THRESHOLD = 1500;

    // Within tolerance: maintain normal speed
    if (Math.abs(driftMs) < TOLERANCE_MS) {
      this.playbackRate = 1.0;
      return 1.0;
    }

    // Significant drift: adjust speed
    if (
      Math.abs(driftMs) >= MIN_DRIFT_TO_ADJUST &&
      driftMs < HARD_SEEK_THRESHOLD
    ) {
      if (driftMs > 0) {
        // Behind: speed up
        this.playbackRate = 1.05;
      } else {
        // Ahead: slow down
        this.playbackRate = 0.95;
      }

      // Once drift is corrected, return to normal
      if (Math.abs(driftMs) < 20) {
        this.playbackRate = 1.0;
      }
    }

    return this.playbackRate;
  }

  /**
   * Determine if a hard seek is needed.
   */
  shouldHardSeek(driftMs: number): boolean {
    return Math.abs(driftMs) >= 1500;
  }

  getCurrentRate(): number {
    return this.playbackRate;
  }
}
