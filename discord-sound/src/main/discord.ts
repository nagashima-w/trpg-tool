import ffmpegPath from 'ffmpeg-static';
import { sep } from 'path';
if (ffmpegPath) {
  // In a packaged Electron app, ffmpeg-static is unpacked from the asar archive.
  // Replace app.asar with app.asar.unpacked so the binary can actually be executed.
  const resolvedPath = ffmpegPath.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  const dir = resolvedPath.substring(0, resolvedPath.lastIndexOf(sep));
  process.env.PATH = dir + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? '');
}

import { EventEmitter } from 'events';
import { createReadStream } from 'fs';
import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  type VoiceConnection,
  type AudioPlayer,
  type AudioResource,
} from '@discordjs/voice';
import type { Guild, VoiceChannel, PlaybackState } from '../shared/types';

export class DiscordManager extends EventEmitter {
  private client: Client | null = null;
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private currentResource: AudioResource | null = null;
  private currentTrackId: string | null = null;
  private currentFilePath: string | null = null;
  private volume: number = 80;
  private looping: boolean = true;
  private playbackStatus: 'idle' | 'playing' | 'paused' = 'idle';
  private isDestroyingIntentionally = false;

  async login(token: string): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    await client.login(token);
    this.client = client;
  }

  getGuilds(): Guild[] {
    if (!this.client) return [];
    return this.client.guilds.cache.map((g) => ({ id: g.id, name: g.name }));
  }

  getVoiceChannels(guildId: string): VoiceChannel[] {
    if (!this.client) return [];
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return [];
    return guild.channels.cache
      .filter((c) => c.isVoiceBased())
      .map((c) => ({ id: c.id, name: c.name }));
  }

  async connect(guildId: string, channelId: string): Promise<void> {
    if (!this.client) throw new Error('Not logged in');
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    this.emit('statusChange', 'connecting');

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      connection.destroy();
      this.emit('statusChange', 'disconnected');
      throw err;
    }

    this.connection = connection;
    this.player = createAudioPlayer();
    connection.subscribe(this.player);

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.looping && this.currentTrackId && this.currentFilePath) {
        this.play(this.currentTrackId, this.currentFilePath);
      } else {
        this.playbackStatus = 'idle';
        this.currentTrackId = null;
        this.currentFilePath = null;
        this.emit('playbackChange', this.getState());
      }
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.isDestroyingIntentionally) {
        this.isDestroyingIntentionally = false;
        return;
      }
      this._handleForcedDisconnect();
    });

    this.emit('statusChange', 'connected');
  }

  disconnect(): void {
    this._resetState();
    if (this.connection) {
      this.isDestroyingIntentionally = true;
      this.connection.destroy();
      this.connection = null;
    }
    this.emit('statusChange', 'disconnected');
    this.emit('playbackChange', this.getState());
  }

  private _resetState(): void {
    if (this.player) {
      this.player.stop(true);
      this.player = null;
    }
    this.currentResource = null;
    this.currentTrackId = null;
    this.currentFilePath = null;
    this.playbackStatus = 'idle';
  }

  private _handleForcedDisconnect(): void {
    this._resetState();
    this.connection = null;
    this.emit('statusChange', 'disconnected');
    this.emit('playbackChange', this.getState());
    this.emit('forcedDisconnect');
  }

  play(trackId: string, filePath: string): void {
    if (!this.player || !this.connection) return;

    this.currentTrackId = trackId;
    this.currentFilePath = filePath;

    const resource = createAudioResource(createReadStream(filePath), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
    resource.volume?.setVolume(this.volume / 100);
    this.currentResource = resource;

    this.player.play(resource);
    this.playbackStatus = 'playing';
    this.emit('playbackChange', this.getState());
  }

  pause(): void {
    if (this.player && this.playbackStatus === 'playing') {
      this.player.pause();
      this.playbackStatus = 'paused';
      this.emit('playbackChange', this.getState());
    }
  }

  resume(): void {
    if (this.player && this.playbackStatus === 'paused') {
      this.player.unpause();
      this.playbackStatus = 'playing';
      this.emit('playbackChange', this.getState());
    }
  }

  stop(): void {
    this.currentTrackId = null;
    this.currentFilePath = null;
    if (this.player) {
      this.player.stop(true);
    }
    this.currentResource = null;
    this.playbackStatus = 'idle';
    this.emit('playbackChange', this.getState());
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.currentResource?.volume) {
      this.currentResource.volume.setVolume(volume / 100);
    }
    this.emit('playbackChange', this.getState());
  }

  getState(): PlaybackState {
    return {
      status: this.playbackStatus,
      currentTrackId: this.currentTrackId,
      volume: this.volume,
    };
  }

  destroy(): void {
    this.disconnect();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}
