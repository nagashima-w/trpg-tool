import type { ConversionResult } from '../../converter/types'
import type { Settings } from '../../main/settings'

interface ConverterAPI {
  openFile(): Promise<{ text: string; filePath: string; warning?: string } | null>
  openFileByPath(filePath: string): Promise<{ text: string; filePath: string; warning?: string } | null>
  extractPdfWithAI(filePath: string): Promise<{ text: string; filePath: string; warning?: string }>
  getPathForFile(file: File): string
  convert(text: string): Promise<ConversionResult>
  saveFile(text: string): Promise<boolean>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  reformatWithAI(text: string): Promise<string>
  onLoadingProgress(callback: (msg: string) => void): () => void
}

declare global {
  interface Window {
    converterAPI: ConverterAPI
  }
}

export {}
