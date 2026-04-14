import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface Settings {
  /** AI連携: 将来対応のための拡張ポイント */
  aiProvider: 'none' | 'claude' | 'gemini'
  aiApiKey: string
}

const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'none',
  aiApiKey: '',
}

export class SettingsManager {
  private settingsPath: string
  private settings: Settings

  constructor(userDataPath: string) {
    this.settingsPath = join(userDataPath, 'scenario-converter-settings.json')
    this.settings = this.load()
  }

  private load(): Settings {
    try {
      const raw = JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as Partial<Settings>
      return { ...DEFAULT_SETTINGS, ...raw }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  get(): Settings {
    return { ...this.settings }
  }

  save(settings: Settings): void {
    this.settings = { ...settings }
    try {
      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }
}
