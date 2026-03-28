import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Settings } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  token: '',
  defaultVolume: 80,
  lastGuildId: '',
  lastChannelId: '',
  restoreLastConnection: true,
};

export class SettingsManager {
  private settingsPath: string;
  private settings: Settings;

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'settings.json');
    this.settings = this.load();
  }

  private load(): Settings {
    try {
      if (existsSync(this.settingsPath)) {
        const raw = readFileSync(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<Settings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  get(): Settings {
    return { ...this.settings };
  }

  save(settings: Settings): void {
    this.settings = { ...settings };
    try {
      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }
}
