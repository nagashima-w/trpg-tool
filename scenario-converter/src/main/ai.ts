import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'fs/promises'
import { PDFDocument } from 'pdf-lib'

const PDF_EXTRACT_PROMPT = `このTRPGシナリオのPDFからテキストを抽出してください。

以下の点を守ってください：
- 文章の内容を変えず、そのまま書き出す
- 能力値（STR/CON/SIZ等）、数値、技能名はそのまま保持
- 見出し・セクション名は独立した行にし、前後に空行を入れる
- 段落の区切りには空行（2回改行）を使う
- 文中の改行は繋げて1つの段落にまとめる
- 能力値ブロック（STR XX CON XX...）はそのままの形式で保持する
- マークダウン記法（#や**等）は使わない
- 余計な説明や前置きなしに、抽出テキストのみを返す`

const REFORMAT_PROMPT = `以下はPDFから抽出したTRPGシナリオのテキストです。文字間の余分なスペースや途中改行などのPDF抽出アーティファクトを修正し、自然な日本語テキストに整形してください。

重要な制約：
- 能力値（STR/CON/SIZ/INT/POW/DEX/APP/EDU/MOV/HP/MP/SAN等）の数値は変更しない
- 技能名・技能値（パーセンテージ）は変更しない
- 固有名詞・呪文名は変更しない
- 文の内容・意味は変更しない
- 能力値ブロックのレイアウト構造は保持する
- 整形後のテキストのみを返す（前置き・説明文は不要）

テキスト:
`

const CHUNK_PAGES = 10

type ProgressCallback = (msg: string) => void

async function waitForRateLimit(headers: Record<string, string> | Headers | undefined, onProgress: ProgressCallback | undefined): Promise<void> {
  const raw = headers instanceof Headers
    ? headers.get('retry-after')
    : headers?.['retry-after']
  const seconds = Math.min(parseInt(raw ?? '60', 10), 120)
  for (let remaining = seconds; remaining > 0; remaining--) {
    onProgress?.(`レート制限のため ${remaining} 秒待機中...`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  onProgress?.('再試行中...')
}

async function splitPdfBufferByPages(buf: Buffer, chunkSize: number): Promise<{ chunks: Buffer[]; totalPages: number }> {
  const doc = await PDFDocument.load(buf)
  const totalPages = doc.getPageCount()
  const chunks: Buffer[] = []
  for (let start = 0; start < totalPages; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalPages)
    const chunk = await PDFDocument.create()
    const indices = Array.from({ length: end - start }, (_, i) => start + i)
    const copied = await chunk.copyPages(doc, indices)
    copied.forEach(p => chunk.addPage(p))
    chunks.push(Buffer.from(await chunk.save()))
  }
  return { chunks, totalPages }
}

async function callWithClaudeRetry<T>(
  apiCall: () => Promise<T>,
  onProgress: ProgressCallback | undefined,
): Promise<T> {
  try {
    return await apiCall()
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      await waitForRateLimit(err.headers, onProgress)
      return apiCall()
    }
    throw err
  }
}

async function extractChunkWithClaude(buf: Buffer, apiKey: string, onProgress: ProgressCallback | undefined): Promise<string> {
  const client = new Anthropic({ apiKey, maxRetries: 0 })
  const base64 = buf.toString('base64')
  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: PDF_EXTRACT_PROMPT },
      ],
    }],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callApi = () => (client.beta.messages as any).create(requestBody) as Promise<{ content: Array<{ type: string; text: string }> }>

  const message = await callWithClaudeRetry(callApi, onProgress)
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('予期しないレスポンス形式です')
  return block.text
}

async function extractPdfInChunks(buf: Buffer, apiKey: string, onProgress: ProgressCallback | undefined): Promise<string> {
  const { chunks, totalPages } = await splitPdfBufferByPages(buf, CHUNK_PAGES)
  const results: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const pageStart = i * CHUNK_PAGES + 1
    const pageEnd = Math.min((i + 1) * CHUNK_PAGES, totalPages)
    onProgress?.(`ページ ${pageStart}〜${pageEnd} / ${totalPages} を処理中...`)
    results.push(await extractChunkWithClaude(chunks[i], apiKey, onProgress))
  }
  return results.join('\n\n')
}

export async function extractPdfTextWithClaude(filePath: string, apiKey: string, onProgress?: ProgressCallback): Promise<string> {
  const buf = await readFile(filePath)

  try {
    return await extractChunkWithClaude(buf, apiKey, onProgress)
  } catch (err) {
    const status = (err != null && typeof err === 'object' && 'status' in err)
      ? (err as { status: unknown }).status
      : undefined
    const shouldChunk = err instanceof Anthropic.RateLimitError || status === 413
    if (shouldChunk) {
      onProgress?.('PDFを分割して再処理します...')
      return extractPdfInChunks(buf, apiKey, onProgress)
    }
    throw err
  }
}

export async function reformatWithClaude(text: string, apiKey: string, onProgress?: ProgressCallback): Promise<string> {
  const client = new Anthropic({ apiKey, maxRetries: 0 })
  const requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: REFORMAT_PROMPT + text }],
  }
  const message = await callWithClaudeRetry(() => client.messages.create(requestBody), onProgress)
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('予期しないレスポンス形式です')
  return block.text
}

const GEMINI_INLINE_LIMIT = 10 * 1024 * 1024  // 10MB 未満はインライン、以上は Files API

async function geminiGenerate(
  parts: unknown[],
  apiKey: string,
  onProgress: ProgressCallback | undefined,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const body = JSON.stringify({ contents: [{ parts }] })
  const call = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

  let res = await call()
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-requests') ?? '60'
    await waitForRateLimit({ 'retry-after': retryAfter }, onProgress)
    res = await call()
  }
  if (!res.ok) throw new Error(`Gemini API エラー: ${res.status} ${await res.text()}`)

  const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> }
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!result) throw new Error('Gemini API からの応答が空です（安全フィルターでブロックされた可能性があります）')
  return result
}

async function uploadPdfToGemini(buf: Buffer, apiKey: string): Promise<string> {
  const boundary = `part_${Date.now().toString(16)}`
  const meta = JSON.stringify({ file: { displayName: 'document.pdf' } })
  const bodyBuf = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const res = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}`, 'X-Goog-Upload-Protocol': 'multipart' },
    body: bodyBuf,
  })
  if (!res.ok) throw new Error(`Gemini Files API アップロードエラー: ${res.status} ${await res.text()}`)
  const data = await res.json() as { file: { uri: string } }
  return data.file.uri
}

async function deleteGeminiFile(fileUri: string, apiKey: string): Promise<void> {
  const m = fileUri.match(/\/(files\/[^?/]+)/)
  if (!m) return
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${m[1]}?key=${apiKey}`, { method: 'DELETE' })
}

export async function extractPdfTextWithGemini(filePath: string, apiKey: string, onProgress?: ProgressCallback): Promise<string> {
  const buf = await readFile(filePath)

  if (buf.length <= GEMINI_INLINE_LIMIT) {
    onProgress?.('GeminiでPDFを解析中...')
    return geminiGenerate([
      { inlineData: { mimeType: 'application/pdf', data: buf.toString('base64') } },
      { text: PDF_EXTRACT_PROMPT },
    ], apiKey, onProgress)
  }

  onProgress?.('PDFをGeminiにアップロード中...')
  const fileUri = await uploadPdfToGemini(buf, apiKey)
  try {
    onProgress?.('GeminiでPDFを解析中...')
    return await geminiGenerate([
      { fileData: { mimeType: 'application/pdf', fileUri } },
      { text: PDF_EXTRACT_PROMPT },
    ], apiKey, onProgress)
  } finally {
    await deleteGeminiFile(fileUri, apiKey).catch(() => {})
  }
}

export async function reformatWithGemini(text: string, apiKey: string, onProgress?: ProgressCallback): Promise<string> {
  return geminiGenerate([{ text: REFORMAT_PROMPT + text }], apiKey, onProgress)
}
