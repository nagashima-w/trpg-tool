import log from 'electron-log/main';
log.initialize();
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';
log.info('[app] starting up');

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { SettingsManager } from './settings';
import { TrackManager } from './tracks';
import { DiscordManager, ffmpegBin } from './discord';
import type { Bot, LoopMode } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let settingsManager: SettingsManager;
let trackManager: TrackManager;
let discordManager: DiscordManager;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function detectAndStoreDuration(trackId: string, filePath: string): void {
  const ffmpeg = spawn(ffmpegBin, ['-i', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr!.on('data', (d: Buffer) => { stderr += d.toString(); });
  ffmpeg.on('close', () => {
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(stderr);
    if (m) {
      const ms = Math.round((parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])) * 1000);
      trackManager.updateDuration(trackId, ms);
      log.info(`[app] duration detected for ${trackId}: ${ms}ms`);
    }
  });
}

function setupDiscordEvents(): void {
  discordManager.on('statusChange', (status) => {
    mainWindow?.webContents.send('discord:statusChange', status);
  });
  discordManager.on('playbackChange', (state) => {
    mainWindow?.webContents.send('discord:playbackChange', state);
  });
  discordManager.on('loggedIn', () => {
    mainWindow?.webContents.send('discord:loggedIn');
  });
  discordManager.on('forcedDisconnect', () => {
    mainWindow?.webContents.send('discord:forcedDisconnect');
  });
  discordManager.on('positionUpdate', (pos) => {
    mainWindow?.webContents.send('discord:positionUpdate', pos);
  });
  discordManager.on('trackEnded', (endedId: string) => {
    const tracks = trackManager.getAll();
    const idx = tracks.findIndex(t => t.id === endedId);
    const next = tracks[(idx + 1) % tracks.length];
    if (next) {
      discordManager.play(next.id, next.filePath, 0, next.durationMs ?? 0);
    }
  });
}

function setupIpcHandlers(): void {
  ipcMain.handle('get-settings', () => {
    return settingsManager.get();
  });

  ipcMain.handle('save-settings', (_event, settings) => {
    settingsManager.save(settings);
  });

  // Bot management
  ipcMain.handle('bots-get-all', () => {
    return settingsManager.get().bots;
  });

  ipcMain.handle('bots-add', async (_event, name: string, token: string) => {
    const settings = settingsManager.get();
    const bot: Bot = { id: randomUUID(), name, token, lastGuildId: '', lastChannelId: '' };
    settings.bots.push(bot);
    if (!settings.activeBotId) settings.activeBotId = bot.id;
    settingsManager.save(settings);
    return bot;
  });

  ipcMain.handle('bots-remove', (_event, id: string) => {
    const settings = settingsManager.get();
    settings.bots = settings.bots.filter(b => b.id !== id);
    if (settings.activeBotId === id) {
      settings.activeBotId = settings.bots[0]?.id ?? '';
    }
    settingsManager.save(settings);
  });

  ipcMain.handle('bots-set-active', async (_event, id: string) => {
    const settings = settingsManager.get();
    const bot = settings.bots.find(b => b.id === id);
    if (!bot) throw new Error('Bot not found');
    settings.activeBotId = id;
    settingsManager.save(settings);
    discordManager.disconnect();
    await discordManager.login(bot.token);
  });

  ipcMain.handle('discord-get-guilds', () => {
    return discordManager.getGuilds();
  });

  ipcMain.handle('discord-get-voice-channels', (_event, guildId: string) => {
    return discordManager.getVoiceChannels(guildId);
  });

  ipcMain.handle('discord-connect', async (_event, guildId: string, channelId: string) => {
    await discordManager.connect(guildId, channelId);
    // Save last connection per active bot
    const settings = settingsManager.get();
    const bot = settings.bots.find(b => b.id === settings.activeBotId);
    if (bot) {
      bot.lastGuildId = guildId;
      bot.lastChannelId = channelId;
      settingsManager.save(settings);
    }
  });

  ipcMain.handle('discord-disconnect', () => {
    discordManager.disconnect();
  });

  ipcMain.handle('playback-play', (_event, trackId: string) => {
    const track = trackManager.getById(trackId);
    if (!track) throw new Error('Track not found');
    discordManager.play(track.id, track.filePath, 0, track.durationMs ?? 0);
  });

  ipcMain.handle('playback-seek', (_event, ms: number) => {
    discordManager.seekTo(ms);
  });

  ipcMain.handle('playback-set-loop-mode', (_event, mode: LoopMode) => {
    discordManager.setLoopMode(mode);
    settingsManager.update({ loopMode: mode });
  });

  ipcMain.handle('playback-pause', () => {
    discordManager.pause();
  });

  ipcMain.handle('playback-resume', () => {
    discordManager.resume();
  });

  ipcMain.handle('playback-stop', () => {
    discordManager.stop();
  });

  ipcMain.handle('playback-set-volume', (_event, volume: number) => {
    discordManager.setVolume(volume);
    settingsManager.update({ defaultVolume: volume });
  });

  ipcMain.handle('playback-get-state', () => {
    return discordManager.getState();
  });

  ipcMain.handle('tracks-get-all', () => {
    return trackManager.getAll();
  });

  ipcMain.handle('tracks-add', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'ogg', 'wav', 'flac'] }],
    });
    if (result.canceled) return [];
    const added = trackManager.addFiles(result.filePaths);
    for (const track of added) {
      if (!track.durationMs) {
        detectAndStoreDuration(track.id, track.filePath);
      }
    }
    return added;
  });

  ipcMain.handle('tracks-add-folder', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled) return [];
    const added = trackManager.addFolder(result.filePaths[0]);
    for (const track of added) {
      if (!track.durationMs) {
        detectAndStoreDuration(track.id, track.filePath);
      }
    }
    return added;
  });

  ipcMain.handle('tracks-reorder', (_event, ids: string[]) => {
    trackManager.reorder(ids);
  });

  ipcMain.handle('tracks-remove', (_event, id: string) => {
    trackManager.remove(id);
  });

  ipcMain.handle('tracks-rename', (_event, id: string, name: string) => {
    trackManager.rename(id, name);
  });
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  settingsManager = new SettingsManager(userDataPath);
  trackManager = new TrackManager(userDataPath);
  discordManager = new DiscordManager();

  setupDiscordEvents();
  setupIpcHandlers();
  createWindow();

  // Detect durations for existing tracks that don't have one yet
  for (const track of trackManager.getAll()) {
    if (!track.durationMs) {
      detectAndStoreDuration(track.id, track.filePath);
    }
  }

  const settings = settingsManager.get();
  discordManager.setVolume(settings.defaultVolume);
  if (settings.loopMode) {
    discordManager.setLoopMode(settings.loopMode);
  }

  const activeBot = settingsManager.getActiveBot();
  if (activeBot) {
    try {
      await discordManager.login(activeBot.token);
      if (
        settings.restoreLastConnection &&
        activeBot.lastGuildId &&
        activeBot.lastChannelId
      ) {
        try {
          await discordManager.connect(activeBot.lastGuildId, activeBot.lastChannelId, true);
        } catch (err) {
          console.error('Failed to auto-connect:', err);
        }
      }
    } catch (err) {
      console.error('Failed to auto-login:', err);
    }
  }
});

app.on('window-all-closed', () => {
  discordManager?.destroy();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
