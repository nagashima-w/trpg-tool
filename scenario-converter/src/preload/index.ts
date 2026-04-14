import { contextBridge, ipcRenderer } from 'electron'
import type { ConversionResult } from '../converter/types'
import type { Settings } from '../main/settings'

const api = {
  openFile: (): Promise<{ text: string; filePath: string } | null> =>
    ipcRenderer.invoke('open-file'),

  convert: (text: string): Promise<ConversionResult> =>
    ipcRenderer.invoke('convert', text),

  saveFile: (text: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file', text),

  getSettings: (): Promise<Settings> =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: Settings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),
}

contextBridge.exposeInMainWorld('converterAPI', api)
