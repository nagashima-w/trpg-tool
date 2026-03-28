export interface Track {
  id: string;
  name: string;
  filePath: string;
}

export interface Settings {
  token: string;
  defaultVolume: number;
  lastGuildId: string;
  lastChannelId: string;
  restoreLastConnection: boolean;
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
}
