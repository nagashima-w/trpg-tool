import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ConversionResult } from '../converter/types'
import type { Settings } from '../main/settings'

const api = {
  openFile: (): Promise<{ text: string; filePath: string } | null> =>
    ipcRenderer.invoke('open-file'),

  openFileByPath: (filePath: string): Promise<{ text: string; filePath: string; warning?: string } | null> =>
    ipcRenderer.invoke('open-file-by-path', filePath),

  extractPdfWithAI: (filePath: string): Promise<{ text: string; filePath: string }> =>
    ipcRenderer.invoke('extract-pdf-with-ai', filePath),

  getPathForFile: (file: File): string =>
    webUtils.getPathForFile(file),

  convert: (text: string): Promise<ConversionResult> =>
    ipcRenderer.invoke('convert', text),

  saveFile: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file', text),

  getSettings: (): Promise<Settings> =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  reformatWithAI: (text: string): Promise<string> =>
    ipcRenderer.invoke('reformat-with-ai', text),

  onLoadingProgress: (callback: (msg: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: string) => callback(msg)
    ipcRenderer.on('loading-progress', handler)
    return () => ipcRenderer.removeListener('loading-progress', handler)
  },
}

contextBridge.exposeInMainWorld('converterAPI', api)
