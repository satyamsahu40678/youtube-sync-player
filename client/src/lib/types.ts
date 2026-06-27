export type SyncStatus = "synced" | "drifted" | "buffering" | "disconnected";

export type PlaybackStatus = "PLAYING" | "PAUSED" | "PREPARING";

export interface SyncMetrics {
  rtt: number; // Round-trip time in ms
  clockOffset: number; // Clock offset in ms
  driftMs: number; // Current drift in milliseconds
  status: "SYNCED" | "ADJUSTING" | "RESYNCING";
}

export interface RoomState {
  videoId: string | null;
  videoTitle?: string | null;
  status: PlaybackStatus;
  videoProgress: number;
  serverTimeUpdatedAt: number;
  isBuffering?: boolean;

  hlsStatus?: "waiting" | "uploading" | "transcoding" | "ready" | "error";
  fileType?: "video" | "audio" | null;
  hlsUrl?: string | null;
  fileName?: string | null;
}

export interface MediaState {
  currentTime: number;
  serverTime: number;
}

/** Server broadcasts scheduled play instruction */
export interface ScheduledPlayMessage {
  startTime: number; // Server epoch ms — the exact moment to call play()
  startProgress: number; // Video position in seconds to play from
}

/** Client reports buffer health when signaling readiness */
export interface ClientReadyMessage {
  roomId: string;
  bufferedAheadSec: number; // seconds of video buffered ahead of current position
}

