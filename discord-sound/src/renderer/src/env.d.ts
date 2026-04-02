import type { Settings, Track, Guild, VoiceChannel, PlaybackState, ConnectionStatus, LoopMode } from '../../shared/types';

export interface ElectronAPI {
  // Settings
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;

  // Discord
  discordLogin: (token: string) => Promise<void>;
  discordGetGuilds: () => Promise<Guild[]>;
  discordGetVoiceChannels: (guildId: string) => Promise<VoiceChannel[]>;
  discordConnect: (guildId: string, channelId: string) => Promise<void>;
  discordDisconnect: () => Promise<void>;

  // Playback
  playbackPlay: (trackId: string) => Promise<void>;
  playbackPause: () => Promise<void>;
  playbackResume: () => Promise<void>;
  playbackStop: () => Promise<void>;
  playbackSetVolume: (volume: number) => Promise<void>;
  playbackGetState: () => Promise<PlaybackState>;
  playbackSeek: (ms: number) => Promise<void>;
  playbackSetLoopMode: (mode: LoopMode) => Promise<void>;

  // Tracks
  tracksGetAll: () => Promise<Track[]>;
  tracksAdd: () => Promise<Track[]>;
  tracksAddFolder: () => Promise<Track[]>;
  tracksRemove: (id: string) => Promise<void>;
  tracksRename: (id: string, name: string) => Promise<void>;
  tracksReorder: (ids: string[]) => Promise<void>;

  // Events
  onLoggedIn: (cb: () => void) => void;
  onStatusChange: (cb: (status: ConnectionStatus) => void) => void;
  onPlaybackChange: (cb: (state: PlaybackState) => void) => void;
  onForcedDisconnect: (cb: () => void) => void;
  onPositionUpdate: (cb: (pos: { positionMs: number; durationMs: number }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
