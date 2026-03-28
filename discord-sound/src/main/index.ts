import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { SettingsManager } from './settings';
import { TrackManager } from './tracks';
import { DiscordManager } from './discord';

let mainWindow: BrowserWindow | null = null;
let settingsManager: SettingsManager;
let trackManager: TrackManager;
let discordManager: DiscordManager;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: false,
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

function setupDiscordEvents(): void {
  discordManager.on('statusChange', (status) => {
    mainWindow?.webContents.send('discord:statusChange', status);
  });
  discordManager.on('playbackChange', (state) => {
    mainWindow?.webContents.send('discord:playbackChange', state);
  });
  discordManager.on('forcedDisconnect', () => {
    mainWindow?.webContents.send('discord:forcedDisconnect');
  });
}

function setupIpcHandlers(): void {
  ipcMain.handle('get-settings', () => {
    return settingsManager.get();
  });

  ipcMain.handle('save-settings', (_event, settings) => {
    settingsManager.save(settings);
  });

  ipcMain.handle('discord-login', async (_event, token: string) => {
    await discordManager.login(token);
    const current = settingsManager.get();
    settingsManager.save({ ...current, token });
  });

  ipcMain.handle('discord-get-guilds', () => {
    return discordManager.getGuilds();
  });

  ipcMain.handle('discord-get-voice-channels', (_event, guildId: string) => {
    return discordManager.getVoiceChannels(guildId);
  });

  ipcMain.handle('discord-connect', async (_event, guildId: string, channelId: string) => {
    await discordManager.connect(guildId, channelId);
    const current = settingsManager.get();
    settingsManager.save({ ...current, lastGuildId: guildId, lastChannelId: channelId });
  });

  ipcMain.handle('discord-disconnect', () => {
    discordManager.disconnect();
  });

  ipcMain.handle('playback-play', (_event, trackId: string) => {
    const track = trackManager.getById(trackId);
    if (!track) throw new Error('Track not found');
    discordManager.play(track.id, track.filePath);
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
    return trackManager.addFiles(result.filePaths);
  });

  ipcMain.handle('tracks-add-folder', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled) return [];
    return trackManager.addFolder(result.filePaths[0]);
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

  const settings = settingsManager.get();
  if (settings.token) {
    try {
      await discordManager.login(settings.token);
      if (
        settings.restoreLastConnection &&
        settings.lastGuildId &&
        settings.lastChannelId
      ) {
        try {
          await discordManager.connect(settings.lastGuildId, settings.lastChannelId);
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
