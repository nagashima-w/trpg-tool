import ffmpegPath from 'ffmpeg-static';
import { dirname } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import log from 'electron-log/main';

// Resolve ffmpeg binary path. In a packaged Electron app the binary is unpacked
// from the asar archive, so replace app.asar with app.asar.unpacked.
let ffmpegBin = 'ffmpeg';
if (ffmpegPath) {
  ffmpegBin = ffmpegPath.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  const dir = dirname(ffmpegBin);
  process.env.PATH = dir + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? '');
  log.info(`[discord] ffmpeg resolved: ${ffmpegBin}`);
} else {
  log.warn('[discord] ffmpeg-static returned null, falling back to system ffmpeg');
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
  type AudioResource,
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
    log.info('[discord] login called');
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    await client.login(token);
    this.client = client;
    log.info('[discord] login succeeded');
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
    log.info(`[discord] connect guildId=${guildId} channelId=${channelId} quiet=${quiet}`);
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
      log.info('[discord] voice connection ready');
    } catch (err) {
      log.error('[discord] voice connection failed:', err);
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
    log.info('[discord] audio player created and subscribed');

    // Diagnostic: report which encryption library @discordjs/voice will use.
    // Also check the subpath that @discordjs/voice actually imports.
    for (const lib of [
      'sodium-native',
      'libsodium-wrappers',
      '@noble/ciphers',
      '@noble/ciphers/chacha',
    ]) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(lib);
        log.info(`[discord] encryption library loaded: ${lib}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`[discord] encryption library not available: ${lib} — ${msg}`);
      }
    }

    this.player.on(AudioPlayerStatus.Idle, () => {
      log.info(`[discord] player Idle (looping=${this.looping}, track=${this.currentTrackId})`);
      if (this.looping && this.currentTrackId && this.currentFilePath) {
        this.play(this.currentTrackId, this.currentFilePath);
      } else {
        this.playbackStatus = 'idle';
        this.currentTrackId = null;
        this.currentFilePath = null;
        this.emit('playbackChange', this.getState());
      }
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      log.info('[discord] player Playing');
    });

    this.player.on(AudioPlayerStatus.Buffering, () => {
      log.info('[discord] player Buffering');
    });

    this.player.on(AudioPlayerStatus.AutoPaused, () => {
      log.warn('[discord] player AutoPaused (no subscribers in voice channel?)');
    });

    this.player.on('error', (err) => {
      log.error('[discord] player error:', err);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      log.warn('[discord] connection Disconnected, attempting reconnect...');
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        log.info('[discord] reconnect signalling/connecting started');
      } catch {
        log.warn('[discord] reconnect timed out, destroying connection');
        connection.destroy();
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      log.info(`[discord] connection Destroyed (intentional=${this.isDestroyingIntentionally})`);
      if (this.isDestroyingIntentionally) {
        this.isDestroyingIntentionally = false;
        return;
      }
      this._handleForcedDisconnect();
    });

    this.emit('statusChange', 'connected');
  }

  disconnect(): void {
    log.info('[discord] disconnect called');
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
      log.info('[discord] killing previous ffmpeg process');
      try { this.currentFfmpeg.kill(); } catch { /* already exited */ }
      this.currentFfmpeg = null;
    }
  }

  private _resetState(): void {
    // Clear track info before stopping the player so that the Idle event
    // handler does not trigger a looping restart mid-teardown.
    this.currentTrackId = null;
    this.currentFilePath = null;
    this.playbackStatus = 'idle';
    this._killFfmpeg();
    if (this.player) {
      this.player.stop(true);
      this.player = null;
    }
  }

  private _handleForcedDisconnect(): void {
    log.warn('[discord] forced disconnect detected');
    this._resetState();
    this.connection = null;
    this.emit('statusChange', 'disconnected');
    this.emit('playbackChange', this.getState());
    this.emit('forcedDisconnect');
  }

  play(trackId: string, filePath: string): void {
    if (!this.player || !this.connection) {
      log.warn(`[discord] play() called but player=${!!this.player} connection=${!!this.connection}`);
      return;
    }

    log.info(`[discord] play trackId=${trackId} file=${filePath}`);

    // Kill any previously running ffmpeg process before starting a new one.
    this._killFfmpeg();

    this.currentTrackId = trackId;
    this.currentFilePath = filePath;

    // Spawn ffmpeg to decode the audio file and re-encode as WebM/Opus.
    // WebM is streamable from a pipe and uses a different demuxer in
    // @discordjs/voice compared to OGG, which rules out OGG-demuxer issues.
    // Volume is baked in here; setVolume() will restart the stream if needed.
    const args = [
      '-i', filePath,
      '-vn',                              // skip any video/image streams (e.g. embedded album art)
      '-af', `volume=${this.volume / 100}`,
      '-f', 'webm',
      '-c:a', 'libopus',
      '-b:a', '96k',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ];
    log.info(`[discord] spawning ffmpeg: ${ffmpegBin} ${args.join(' ')}`);

    const ffmpeg = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.on('error', (err) => {
      log.error('[discord] ffmpeg spawn error:', err);
    });

    ffmpeg.stderr!.on('data', (data: Buffer) => {
      // ffmpeg writes progress/info to stderr; log at debug level to avoid noise
      log.debug(`[ffmpeg stderr] ${data.toString().trimEnd()}`);
    });

    ffmpeg.on('close', (code, signal) => {
      log.info(`[discord] ffmpeg exited code=${code} signal=${signal}`);
    });

    let firstData = true;
    ffmpeg.stdout!.on('data', () => {
      if (firstData) {
        log.info('[discord] ffmpeg stdout: first data chunk received');
        firstData = false;
      }
    });

    this.currentFfmpeg = ffmpeg;

    const resource: AudioResource = createAudioResource(ffmpeg.stdout!, {
      inputType: StreamType.WebmOpus,
    });

    log.info('[discord] audio resource created, calling player.play()');
    this.player.play(resource);

    // Log playbackDuration every 5s to verify Opus packets are actually being
    // dispatched. 0ms after several seconds = demuxer not producing frames.
    const durationTimer = setInterval(() => {
      if (this.playbackStatus !== 'playing') {
        clearInterval(durationTimer);
        return;
      }
      log.info(`[discord] playbackDuration=${resource.playbackDuration}ms`);
    }, 5000);
    this.playbackStatus = 'playing';
    this.emit('playbackChange', this.getState());
  }

  pause(): void {
    log.info('[discord] pause');
    if (this.player && this.playbackStatus === 'playing') {
      this.player.pause();
      this.playbackStatus = 'paused';
      this.emit('playbackChange', this.getState());
    }
  }

  resume(): void {
    log.info('[discord] resume');
    if (this.player && this.playbackStatus === 'paused') {
      this.player.unpause();
      this.playbackStatus = 'playing';
      this.emit('playbackChange', this.getState());
    }
  }

  stop(): void {
    log.info('[discord] stop');
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
    log.info(`[discord] setVolume ${volume}`);
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
    log.info('[discord] destroy');
    this.disconnect();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}
