// Server Types & Interfaces

export interface RoomState {
  // YouTube Fields (Legacy)
  videoId: string | null;
  videoTitle?: string | null;
  status: "PLAYING" | "PAUSED";
  videoProgress: number; // in seconds
  serverTimeUpdatedAt: number; // Epoch ms

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
  status: "PLAYING" | "PAUSED";
  videoProgress: number;
  serverTimeUpdatedAt: number;

  // HLS fields (sent when file upload mode is active)
  hlsStatus?: "waiting" | "uploading" | "transcoding" | "ready" | "error";
  fileType?: "video" | "audio" | null;
  hlsUrl?: string | null;
  fileName?: string | null;
}

export interface ChunkUploadBody {
  roomId: string;
  chunkIndex: string;
  totalChunks: string;
  fileName: string;
  fileType: string;
}
