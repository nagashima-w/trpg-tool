import { contextBridge, ipcRenderer } from 'electron';
import type { Settings, Track, Guild, VoiceChannel, PlaybackState, ConnectionStatus } from '../shared/types';

const electronAPI = {
  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke('save-settings', settings),

  // Discord
  discordLogin: (token: string): Promise<void> => ipcRenderer.invoke('discord-login', token),
  discordGetGuilds: (): Promise<Guild[]> => ipcRenderer.invoke('discord-get-guilds'),
  discordGetVoiceChannels: (guildId: string): Promise<VoiceChannel[]> =>
    ipcRenderer.invoke('discord-get-voice-channels', guildId),
  discordConnect: (guildId: string, channelId: string): Promise<void> =>
    ipcRenderer.invoke('discord-connect', guildId, channelId),
  discordDisconnect: (): Promise<void> => ipcRenderer.invoke('discord-disconnect'),

  // Playback
  playbackPlay: (trackId: string): Promise<void> => ipcRenderer.invoke('playback-play', trackId),
  playbackPause: (): Promise<void> => ipcRenderer.invoke('playback-pause'),
  playbackResume: (): Promise<void> => ipcRenderer.invoke('playback-resume'),
  playbackStop: (): Promise<void> => ipcRenderer.invoke('playback-stop'),
  playbackSetVolume: (volume: number): Promise<void> =>
    ipcRenderer.invoke('playback-set-volume', volume),
  playbackGetState: (): Promise<PlaybackState> => ipcRenderer.invoke('playback-get-state'),

  // Tracks
  tracksGetAll: (): Promise<Track[]> => ipcRenderer.invoke('tracks-get-all'),
  tracksAdd: (): Promise<Track[]> => ipcRenderer.invoke('tracks-add'),
  tracksAddFolder: (): Promise<Track[]> => ipcRenderer.invoke('tracks-add-folder'),
  tracksRemove: (id: string): Promise<void> => ipcRenderer.invoke('tracks-remove', id),
  tracksRename: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('tracks-rename', id, name),

  // New v1 features
  playbackSeek: (ms: number): Promise<void> => ipcRenderer.invoke('playback-seek', ms),
  tracksReorder: (ids: string[]): Promise<void> => ipcRenderer.invoke('tracks-reorder', ids),
  playbackSetLoopMode: (mode: string): Promise<void> => ipcRenderer.invoke('playback-set-loop-mode', mode),
  onPositionUpdate: (cb: (pos: { positionMs: number; durationMs: number }) => void): void => {
    ipcRenderer.removeAllListeners('discord:positionUpdate');
    ipcRenderer.on('discord:positionUpdate', (_event, pos) => cb(pos));
  },

  // Events
  onStatusChange: (cb: (status: ConnectionStatus) => void): void => {
    ipcRenderer.removeAllListeners('discord:statusChange');
    ipcRenderer.on('discord:statusChange', (_event, status) => cb(status));
  },
  onPlaybackChange: (cb: (state: PlaybackState) => void): void => {
    ipcRenderer.removeAllListeners('discord:playbackChange');
    ipcRenderer.on('discord:playbackChange', (_event, state) => cb(state));
  },
  onLoggedIn: (cb: () => void): void => {
    ipcRenderer.removeAllListeners('discord:loggedIn');
    ipcRenderer.on('discord:loggedIn', () => cb());
  },
  onForcedDisconnect: (cb: () => void): void => {
    ipcRenderer.removeAllListeners('discord:forcedDisconnect');
    ipcRenderer.on('discord:forcedDisconnect', () => cb());
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
