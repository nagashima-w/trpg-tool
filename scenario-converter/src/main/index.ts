import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { SettingsManager } from './settings'
import { readTextFile, extractTextFromPdf } from './pdf'
import { extractPdfTextWithClaude, extractPdfTextWithGemini, reformatWithClaude, reformatWithGemini, analyzeBalanceWithClaude, analyzeBalanceWithGemini } from './ai'
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

function sendProgress(msg: string): void {
  mainWindow?.webContents.send('loading-progress', msg)
}

async function loadPdf(filePath: string): Promise<{ text: string; warning?: string }> {
  const settings = settingsManager.get()
  const apiKey = settings.aiProvider === 'claude' ? settings.claudeApiKey
    : settings.aiProvider === 'gemini' ? settings.geminiApiKey : ''
  if (apiKey && settings.aiPdfExtract) {
    try {
      if (settings.aiProvider === 'claude') {
        return { text: await extractPdfTextWithClaude(filePath, apiKey, sendProgress) }
      }
      if (settings.aiProvider === 'gemini') {
        return { text: await extractPdfTextWithGemini(filePath, apiKey, sendProgress) }
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const text = await extractTextFromPdf(filePath, sendProgress)
      return { text, warning: `AIによるPDF抽出に失敗しました（${reason}）。通常のテキスト抽出を使用しています（フォントによっては文字化けが生じる場合があります）。` }
    }
  }
  return { text: await extractTextFromPdf(filePath, sendProgress) }
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
      if (filePath.toLowerCase().endsWith('.pdf')) {
        const { text, warning } = await loadPdf(filePath)
        return { text, filePath, warning }
      }
      return { text: readTextFile(filePath), filePath }
    } catch (err) {
      throw new Error(`ファイルの読み込みに失敗しました: ${err}`)
    }
  })

  // ── パスを指定してファイルを開く（ドロップ用） ───────────────────────────────
  ipcMain.handle('open-file-by-path', async (_event, filePath: string): Promise<{ text: string; filePath: string; warning?: string } | null> => {
    try {
      if (filePath.toLowerCase().endsWith('.pdf')) {
        const { text, warning } = await loadPdf(filePath)
        return { text, filePath, warning }
      }
      return { text: readTextFile(filePath), filePath }
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

  // ── AI再抽出（ボタンから明示的に呼び出し） ──────────────────────────────────
  ipcMain.handle('extract-pdf-with-ai', async (_event, filePath: string): Promise<{ text: string; filePath: string }> => {
    const settings = settingsManager.get()
    if (settings.aiProvider === 'claude') {
      if (!settings.claudeApiKey) throw new Error('Claude APIキーが設定されていません')
      return { text: await extractPdfTextWithClaude(filePath, settings.claudeApiKey, sendProgress), filePath }
    }
    if (settings.aiProvider === 'gemini') {
      if (!settings.geminiApiKey) throw new Error('Gemini APIキーが設定されていません')
      return { text: await extractPdfTextWithGemini(filePath, settings.geminiApiKey, sendProgress), filePath }
    }
    throw new Error('AIプロバイダーが設定されていません')
  })

  // ── AI整形 ──────────────────────────────────────────────────────────
  ipcMain.handle('reformat-with-ai', async (_event, text: string): Promise<string> => {
    const settings = settingsManager.get()
    if (settings.aiProvider === 'claude') {
      if (!settings.claudeApiKey) throw new Error('Claude APIキーが設定されていません')
      return reformatWithClaude(text, settings.claudeApiKey, sendProgress)
    }
    if (settings.aiProvider === 'gemini') {
      if (!settings.geminiApiKey) throw new Error('Gemini APIキーが設定されていません')
      return reformatWithGemini(text, settings.geminiApiKey, sendProgress)
    }
    throw new Error('AIプロバイダーが設定されていません')
  })

  // ── AI戦闘バランス分析 ──────────────────────────────────────────────────
  ipcMain.handle('balance-check-with-ai', async (_event, contextText: string): Promise<string> => {
    const settings = settingsManager.get()
    if (settings.aiProvider === 'claude') {
      if (!settings.claudeApiKey) throw new Error('Claude APIキーが設定されていません')
      return analyzeBalanceWithClaude(contextText, settings.claudeApiKey, sendProgress)
    }
    if (settings.aiProvider === 'gemini') {
      if (!settings.geminiApiKey) throw new Error('Gemini APIキーが設定されていません')
      return analyzeBalanceWithGemini(contextText, settings.geminiApiKey, sendProgress)
    }
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
