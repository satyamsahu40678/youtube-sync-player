export interface SyncMetrics {
  rtt: number; // Round-trip time in ms
  clockOffset: number; // Clock offset in ms
  driftMs: number; // Current drift in milliseconds
  status: "SYNCED" | "ADJUSTING" | "RESYNCING";
}

export interface RoomState {
  videoId: string | null;
  videoTitle?: string | null;
  status: "PLAYING" | "PAUSED";
  videoProgress: number;
  serverTimeUpdatedAt: number;
}
