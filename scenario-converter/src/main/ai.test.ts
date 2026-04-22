import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class { },
  RateLimitError: class RateLimitError extends Error { },
}))

vi.mock('pdf-lib', () => ({
  PDFDocument: { load: vi.fn(), create: vi.fn() },
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'fs/promises'
import { extractPdfTextWithGemini } from './ai'

const mockFetch = vi.fn()

describe('extractPdfTextWithGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function mockGenerateOk(text: string) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    })
  }

  it('10MB未満のPDFはinlineDataで送信する', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.alloc(1024) as never)
    mockGenerateOk('抽出テキスト')

    const result = await extractPdfTextWithGemini('/dummy.pdf', 'test-key')

    expect(result).toBe('抽出テキスト')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.contents[0].parts[0]).toHaveProperty('inlineData')
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe('application/pdf')
  })

  it('10MBを超えるPDFはFiles APIを使う', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.alloc(11 * 1024 * 1024) as never)

    // アップロード
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ file: { uri: 'https://gemini/v1beta/files/abc123' } }),
    })
    // 生成
    mockGenerateOk('大きなPDFのテキスト')
    // 削除
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    const result = await extractPdfTextWithGemini('/large.pdf', 'test-key')

    expect(result).toBe('大きなPDFのテキスト')
    expect(mockFetch).toHaveBeenCalledTimes(3)

    const [uploadUrl] = mockFetch.mock.calls[0]
    expect(uploadUrl).toContain('/upload/v1beta/files')

    const generateBody = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(generateBody.contents[0].parts[0]).toHaveProperty('fileData')
    expect(generateBody.contents[0].parts[0].fileData.fileUri).toBe('https://gemini/v1beta/files/abc123')

    const [, deleteOpts] = mockFetch.mock.calls[2]
    expect(deleteOpts.method).toBe('DELETE')
  })

  it('生成エラー時もFiles APIのファイルを削除する', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.alloc(11 * 1024 * 1024) as never)

    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ file: { uri: 'https://gemini/v1beta/files/abc123' } }),
    })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Error' })
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

    await expect(extractPdfTextWithGemini('/large.pdf', 'test-key'))
      .rejects.toThrow('Gemini API エラー: 500')

    const [, deleteOpts] = mockFetch.mock.calls[2]
    expect(deleteOpts.method).toBe('DELETE')
  })

  it('429レート制限で1回リトライする', async () => {
    vi.useFakeTimers()
    vi.mocked(readFile).mockResolvedValue(Buffer.alloc(1024) as never)

    mockFetch
      .mockResolvedValueOnce({
        ok: false, status: 429,
        headers: { get: (k: string) => k === 'retry-after' ? '1' : null },
      })
    mockGenerateOk('リトライ後テキスト')

    const promise = extractPdfTextWithGemini('/dummy.pdf', 'test-key')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('リトライ後テキスト')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('APIキーをクエリパラメータに含めてリクエストする', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.alloc(1024) as never)
    mockGenerateOk('テキスト')

    await extractPdfTextWithGemini('/dummy.pdf', 'my-api-key')

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('key=my-api-key')
  })

  it('カスタムプロンプトが指定された場合はそれをリクエストに使用する', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.alloc(1024) as never)
    mockGenerateOk('カスタムプロンプト結果')

    await extractPdfTextWithGemini('/dummy.pdf', 'test-key', undefined, 'カスタムプロンプト')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.contents[0].parts[1].text).toBe('カスタムプロンプト')
  })
})
