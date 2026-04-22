import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_PDF_EXTRACT_PROMPT, DEFAULT_REFORMAT_PROMPT, DEFAULT_BALANCE_PROMPT } from './defaultPrompts'

export interface AiPrompts {
  pdfExtract: string
  reformat: string
  balance: string
}

export interface Settings {
  aiProvider: 'none' | 'claude' | 'gemini'
  claudeApiKey: string
  geminiApiKey: string
  aiPdfExtract: boolean
  aiPrompts: AiPrompts
}

const DEFAULT_SETTINGS: Settings = {
  aiProvider: 'none',
  claudeApiKey: '',
  geminiApiKey: '',
  aiPdfExtract: false,
  aiPrompts: {
    pdfExtract: DEFAULT_PDF_EXTRACT_PROMPT,
    reformat: DEFAULT_REFORMAT_PROMPT,
    balance: DEFAULT_BALANCE_PROMPT,
  },
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
      const rawPrompts = raw['aiPrompts'] as Record<string, unknown> | undefined
      return {
        ...DEFAULT_SETTINGS,
        ...raw,
        claudeApiKey: typeof raw['claudeApiKey'] === 'string' ? raw['claudeApiKey']
          : (raw['aiProvider'] === 'claude' ? legacy : ''),
        geminiApiKey: typeof raw['geminiApiKey'] === 'string' ? raw['geminiApiKey']
          : (raw['aiProvider'] === 'gemini' ? legacy : ''),
        aiPrompts: {
          pdfExtract: typeof rawPrompts?.['pdfExtract'] === 'string' ? rawPrompts['pdfExtract'] : DEFAULT_PDF_EXTRACT_PROMPT,
          reformat: typeof rawPrompts?.['reformat'] === 'string' ? rawPrompts['reformat'] : DEFAULT_REFORMAT_PROMPT,
          balance: typeof rawPrompts?.['balance'] === 'string' ? rawPrompts['balance'] : DEFAULT_BALANCE_PROMPT,
        },
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  get(): Settings {
    return { ...this.settings, aiPrompts: { ...this.settings.aiPrompts } }
  }

  save(settings: Settings): void {
    this.settings = { ...settings, aiPrompts: { ...settings.aiPrompts } }
    try {
      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }
}
