import ffmpegPath from 'ffmpeg-static';
import { sep } from 'path';
import { spawn, type ChildProcess } from 'child_process';

// Resolve ffmpeg binary path. In a packaged Electron app the binary is unpacked
// from the asar archive, so replace app.asar with app.asar.unpacked.
let ffmpegBin = 'ffmpeg';
if (ffmpegPath) {
  ffmpegBin = ffmpegPath.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  const dir = ffmpegBin.substring(0, ffmpegBin.lastIndexOf(sep));
  process.env.PATH = dir + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? '');
}

import { EventEmitter } from 'events';
import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  type VoiceConnection,
  type AudioPlayer,
} from '@discordjs/voice';
import type { Guild, VoiceChannel, PlaybackState } from '../shared/types';

export class DiscordManager extends EventEmitter {
  private client: Client | null = null;
  private connection: VoiceConnection | null = null;
  private player: AudioPlayer | null = null;
  private currentTrackId: string | null = null;
  private currentFilePath: string | null = null;
  private currentFfmpeg: ChildProcess | null = null;
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

  // quiet=true suppresses the intermediate 'connecting' event (used for startup auto-connect)
  async connect(guildId: string, channelId: string, quiet = false): Promise<void> {
    if (!this.client) throw new Error('Not logged in');
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    if (!quiet) this.emit('statusChange', 'connecting');

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      // Prevent the Destroyed event from triggering _handleForcedDisconnect
      // (which would wrongly show the "kicked from channel" alert on a failed connect).
      this.isDestroyingIntentionally = true;
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

  private _killFfmpeg(): void {
    if (this.currentFfmpeg) {
      try { this.currentFfmpeg.kill(); } catch { /* already exited */ }
      this.currentFfmpeg = null;
    }
  }

  private _resetState(): void {
    this._killFfmpeg();
    if (this.player) {
      this.player.stop(true);
      this.player = null;
    }
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

    // Kill any previously running ffmpeg process before starting a new one.
    this._killFfmpeg();

    this.currentTrackId = trackId;
    this.currentFilePath = filePath;

    // Spawn ffmpeg to decode the audio file and re-encode as OGG Opus.
    // This bypasses prism-media's Node.js Opus encoder entirely, avoiding
    // compatibility issues with opusscript/node-opus in packaged Electron apps.
    // Volume is baked in here; setVolume() will restart the stream if needed.
    const ffmpeg = spawn(ffmpegBin, [
      '-i', filePath,
      '-af', `volume=${this.volume / 100}`,
      '-f', 'ogg',
      '-c:a', 'libopus',
      '-b:a', '96k',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    this.currentFfmpeg = ffmpeg;

    const resource = createAudioResource(ffmpeg.stdout!, {
      inputType: StreamType.OggOpus,
    });

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
    this._killFfmpeg();
    this.currentTrackId = null;
    this.currentFilePath = null;
    if (this.player) {
      this.player.stop(true);
    }
    this.playbackStatus = 'idle';
    this.emit('playbackChange', this.getState());
  }

  setVolume(volume: number): void {
    this.volume = volume;
    // Restart stream with the new volume baked into ffmpeg.
    // This causes a brief restart but applies the change immediately.
    if (this.playbackStatus === 'playing' && this.currentTrackId && this.currentFilePath) {
      this.play(this.currentTrackId, this.currentFilePath);
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
