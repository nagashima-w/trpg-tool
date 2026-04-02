import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Settings } from '../shared/types';

const DEFAULT_SETTINGS: Settings = {
  bots: [],
  activeBotId: '',
  defaultVolume: 80,
  restoreLastConnection: false,
  loopMode: 'single',
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as any;

      // Migrate old format: { token, lastGuildId, lastChannelId, ... }
      if (typeof raw.token === 'string' && raw.token) {
        const migratedBot = {
          id: randomUUID(),
          name: 'Bot',
          token: raw.token,
          lastGuildId: raw.lastGuildId ?? '',
          lastChannelId: raw.lastChannelId ?? '',
        };
        const migrated: Settings = {
          bots: [migratedBot],
          activeBotId: migratedBot.id,
          defaultVolume: raw.defaultVolume ?? DEFAULT_SETTINGS.defaultVolume,
          restoreLastConnection: raw.restoreLastConnection ?? DEFAULT_SETTINGS.restoreLastConnection,
          loopMode: raw.loopMode ?? DEFAULT_SETTINGS.loopMode,
        };
        this.saveRaw(migrated);
        return migrated;
      }

      return { ...DEFAULT_SETTINGS, ...raw as Partial<Settings> };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveRaw(settings: Settings): void {
    try {
      writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings:', err);
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
    this.saveRaw(this.settings);
  }

  getActiveBot() {
    return this.settings.bots.find(b => b.id === this.settings.activeBotId) ?? null;
  }
}
