// Server Types & Interfaces

export type PlaybackStatus = "PLAYING" | "PAUSED" | "PREPARING";

export interface RoomState {
  // YouTube Fields (Legacy)
  videoId: string | null;
  videoTitle?: string | null;
  status: PlaybackStatus;
  videoProgress: number; // in seconds
  serverTimeUpdatedAt: number; // Epoch ms
  isBuffering?: boolean;

  // File Upload / HLS Fields
  hlsStatus: "waiting" | "uploading" | "transcoding" | "ready" | "error";
  fileType: "video" | "audio" | null;
  hlsUrl: string | null;
  fileName: string | null;
}

export interface SyncMessage {
  roomId: string;
  userId: string;
  clientTime: number;
}

export interface ClockSyncResponse {
  serverReceiveTime: number; // T2
  serverSendTime: number; // T3
}

export interface RoomStateMessage {
  videoId: string | null;
  videoTitle?: string | null;
  status: PlaybackStatus;
  videoProgress: number;
  serverTimeUpdatedAt: number;
  isBuffering?: boolean;

  // HLS fields (sent when file upload mode is active)
  hlsStatus?: "waiting" | "uploading" | "transcoding" | "ready" | "error";
  fileType?: "video" | "audio" | null;
  hlsUrl?: string | null;
  fileName?: string | null;
}

/** Client reports buffer health when signaling readiness */
export interface ClientReadyMessage {
  roomId: string;
  bufferedAheadSec: number; // seconds of video buffered ahead of current position
}

/** Server broadcasts scheduled play instruction */
export interface ScheduledPlayMessage {
  startTime: number; // Server epoch ms — the exact moment to call play()
  startProgress: number; // Video position in seconds to play from
}

export interface ChunkUploadBody {
  roomId: string;
  chunkIndex: string;
  totalChunks: string;
  fileName: string;
  fileType: string;
}
