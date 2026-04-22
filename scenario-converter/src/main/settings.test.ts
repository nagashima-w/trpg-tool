import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}))
vi.mock('path', () => ({ join: (...parts: string[]) => parts.join('/') }))

import { SettingsManager } from './settings'

describe('SettingsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('デフォルト設定を返す（ファイルなし）', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.aiProvider).toBe('none')
    expect(s.claudeApiKey).toBe('')
    expect(s.geminiApiKey).toBe('')
    expect(s.aiPdfExtract).toBe(false)
  })

  it('新フォーマットをそのまま読み込む', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      aiProvider: 'claude',
      claudeApiKey: 'sk-claude',
      geminiApiKey: 'gemini-key',
      aiPdfExtract: true,
    }))
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.claudeApiKey).toBe('sk-claude')
    expect(s.geminiApiKey).toBe('gemini-key')
    expect(s.aiPdfExtract).toBe(true)
  })

  it('旧フォーマット（aiApiKey + claude）をclaudeApiKeyに移行する', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      aiProvider: 'claude',
      aiApiKey: 'sk-old-claude',
      aiPdfExtract: false,
    }))
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.claudeApiKey).toBe('sk-old-claude')
    expect(s.geminiApiKey).toBe('')
  })

  it('旧フォーマット（aiApiKey + gemini）をgeminiApiKeyに移行する', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      aiProvider: 'gemini',
      aiApiKey: 'old-gemini-key',
      aiPdfExtract: false,
    }))
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.geminiApiKey).toBe('old-gemini-key')
    expect(s.claudeApiKey).toBe('')
  })

  it('設定を保存する', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const sm = new SettingsManager('/data')
    sm.save({ aiProvider: 'gemini', claudeApiKey: 'c', geminiApiKey: 'g', aiPdfExtract: true, aiPrompts: { pdfExtract: '', reformat: '', balance: '' } })
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/data/scenario-converter-settings.json',
      expect.stringContaining('"geminiApiKey": "g"'),
      'utf-8',
    )
  })

  it('デフォルト設定にaiPromptsが含まれ空でない', () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.aiPrompts).toBeDefined()
    expect(s.aiPrompts.pdfExtract).toBeTruthy()
    expect(s.aiPrompts.reformat).toBeTruthy()
    expect(s.aiPrompts.balance).toBeTruthy()
  })

  it('aiPromptsを保存・読み込みできる', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      aiProvider: 'claude',
      claudeApiKey: 'sk-claude',
      geminiApiKey: '',
      aiPdfExtract: false,
      aiPrompts: { pdfExtract: 'custom1', reformat: 'custom2', balance: 'custom3' },
    }))
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.aiPrompts.pdfExtract).toBe('custom1')
    expect(s.aiPrompts.reformat).toBe('custom2')
    expect(s.aiPrompts.balance).toBe('custom3')
  })

  it('旧フォーマットにaiPromptsがない場合はデフォルト値を使う', () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      aiProvider: 'claude',
      claudeApiKey: 'sk-claude',
      geminiApiKey: '',
      aiPdfExtract: false,
    }))
    const sm = new SettingsManager('/data')
    const s = sm.get()
    expect(s.aiPrompts).toBeDefined()
    expect(s.aiPrompts.pdfExtract).toBeTruthy()
  })
})
