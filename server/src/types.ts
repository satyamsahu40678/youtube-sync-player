// Server Types & Interfaces

export interface RoomState {
  videoId: string | null;
  videoTitle?: string | null;
  status: "PLAYING" | "PAUSED";
  videoProgress: number; // in seconds
  serverTimeUpdatedAt: number; // Epoch ms
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
}
