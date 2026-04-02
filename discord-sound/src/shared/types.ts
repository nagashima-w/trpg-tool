export type LoopMode = 'single' | 'playlist' | 'none';

export interface Track {
  id: string;
  name: string;
  filePath: string;
  durationMs?: number;
}

export interface Settings {
  token: string;
  defaultVolume: number;
  lastGuildId: string;
  lastChannelId: string;
  restoreLastConnection: boolean;
  loopMode: LoopMode;
}

export interface Guild {
  id: string;
  name: string;
}

export interface VoiceChannel {
  id: string;
  name: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackState {
  status: PlaybackStatus;
  currentTrackId: string | null;
  volume: number;
  positionMs: number;
  durationMs: number;
}
