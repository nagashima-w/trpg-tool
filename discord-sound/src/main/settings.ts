import { readFileSync, writeFileSync } from 'fs';
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
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as Partial<Settings> };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): Settings {
    return { ...this.settings };
  }

  update(patch: Partial<Settings>): void {
    this.save({ ...this.settings, ...patch });
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
