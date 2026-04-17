import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { SettingsManager } from './settings'
import { readTextFile, extractTextFromPdf } from './pdf'
import { reformatWithClaude, reformatWithGemini } from './ai'
import { convertText } from '../converter/convert6to7'
import type { ConversionResult } from '../converter/types'
import type { Settings } from './settings'

let mainWindow: BrowserWindow | null = null
let settingsManager: SettingsManager

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function setupIpcHandlers(): void {
  // ── ファイルを開く ──────────────────────────────────────────────────
  ipcMain.handle('open-file', async (): Promise<{ text: string; filePath: string } | null> => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'シナリオファイル', extensions: ['txt', 'pdf'] },
        { name: 'テキスト', extensions: ['txt'] },
        { name: 'PDF', extensions: ['pdf'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    try {
      const text = filePath.toLowerCase().endsWith('.pdf')
        ? await extractTextFromPdf(filePath)
        : readTextFile(filePath)
      return { text, filePath }
    } catch (err) {
      throw new Error(`ファイルの読み込みに失敗しました: ${err}`)
    }
  })

  // ── 変換実行 ────────────────────────────────────────────────────────
  ipcMain.handle('convert', (_event, text: string): ConversionResult => {
    return convertText(text)
  })

  // ── テキスト書き出し ─────────────────────────────────────────────────
  ipcMain.handle('save-file', async (_event, text: string): Promise<boolean> => {
    if (!mainWindow) return false
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'テキスト', extensions: ['txt'] }],
      defaultPath: 'converted.txt',
    })
    if (result.canceled || !result.filePath) return false
    writeFileSync(result.filePath, text, 'utf-8')
    return true
  })

  // ── AI整形 ──────────────────────────────────────────────────────────
  ipcMain.handle('reformat-with-ai', async (_event, text: string): Promise<string> => {
    const settings = settingsManager.get()
    if (!settings.aiApiKey) throw new Error('APIキーが設定されていません')
    if (settings.aiProvider === 'claude') return reformatWithClaude(text, settings.aiApiKey)
    if (settings.aiProvider === 'gemini') return reformatWithGemini(text, settings.aiApiKey)
    throw new Error('AIプロバイダーが設定されていません')
  })

  // ── 設定 ────────────────────────────────────────────────────────────
  ipcMain.handle('get-settings', () => settingsManager.get())
  ipcMain.handle('save-settings', (_event, settings: Settings) => settingsManager.save(settings))
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  settingsManager = new SettingsManager(userDataPath)

  setupIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
