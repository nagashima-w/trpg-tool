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

async function waitForRateLimit(headers: Record<string, string> | Headers, onProgress: ProgressCallback | undefined): Promise<void> {
  const raw = headers instanceof Headers
    ? headers.get('retry-after')
    : (headers as Record<string, string>)['retry-after']
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
    const copied = await chunk.copyPagesFrom(doc, indices)
    copied.forEach(p => chunk.addPage(p))
    chunks.push(Buffer.from(await chunk.save()))
  }
  return { chunks, totalPages }
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

  let message: { content: Array<{ type: string; text: string }> }
  try {
    message = await callApi()
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      await waitForRateLimit(err.headers as Headers, onProgress)
      message = await callApi()
    } else {
      throw err
    }
  }
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
    const shouldChunk =
      err instanceof Anthropic.RateLimitError ||
      (err instanceof Anthropic.APIStatusError && err.status === 413)
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

  const callApi = () => client.messages.create(requestBody)

  let message: Awaited<ReturnType<typeof callApi>>
  try {
    message = await callApi()
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      await waitForRateLimit(err.headers as Headers, onProgress)
      message = await callApi()
    } else {
      throw err
    }
  }

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('予期しないレスポンス形式です')
  return block.text
}

export async function reformatWithGemini(text: string, apiKey: string, onProgress?: ProgressCallback): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
  const body = JSON.stringify({
    contents: [{ parts: [{ text: REFORMAT_PROMPT + text }] }],
  })

  const callApi = () => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  let res = await callApi()
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset-requests') ?? '60'
    await waitForRateLimit({ 'retry-after': retryAfterHeader }, onProgress)
    res = await callApi()
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API エラー: ${res.status} ${err}`)
  }
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  return data.candidates[0].content.parts[0].text
}
