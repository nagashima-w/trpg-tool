import type { ConversionResult } from '../../converter/types'
import type { Settings } from '../../main/settings'

interface ConverterAPI {
  openFile(): Promise<{ text: string; filePath: string } | null>
  convert(text: string): Promise<ConversionResult>
  saveFile(text: string): Promise<boolean>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
}

declare global {
  interface Window {
    converterAPI: ConverterAPI
  }
}

export {}
