import { RoomState } from "./types";

export const roomStates: Map<string, RoomState> = new Map();

export function getOrCreateRoomState(roomId: string): RoomState {
  let state = roomStates.get(roomId);
  if (!state) {
    state = {
      videoId: null,
      videoTitle: null,
      status: "PAUSED",
      videoProgress: 0,
      serverTimeUpdatedAt: Date.now(),
      hlsStatus: "waiting",
      fileType: null,
      hlsUrl: null,
      fileName: null,
    };
    roomStates.set(roomId, state);
  }
  return state;
}

export function getRoomState(roomId: string): RoomState | undefined {
  return roomStates.get(roomId);
}
