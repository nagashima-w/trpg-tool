import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface Settings {
  aiProvider: 'none' | 'claude' | 'gemini'
  claudeApiKey: string
  geminiApiKey: string
  aiPdfExtract: boolean
}

const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'none',
  claudeApiKey: '',
  geminiApiKey: '',
  aiPdfExtract: false,
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
      const raw = JSON.parse(readFileSync(this.settingsPath, 'utf-8')) as Record<string, unknown>
      // 旧フォーマット（aiApiKey）からの移行
      const legacy = typeof raw['aiApiKey'] === 'string' ? raw['aiApiKey'] : ''
      return {
        ...DEFAULT_SETTINGS,
        ...raw,
        claudeApiKey: typeof raw['claudeApiKey'] === 'string' ? raw['claudeApiKey']
          : (raw['aiProvider'] === 'claude' ? legacy : ''),
        geminiApiKey: typeof raw['geminiApiKey'] === 'string' ? raw['geminiApiKey']
          : (raw['aiProvider'] === 'gemini' ? legacy : ''),
      }
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
