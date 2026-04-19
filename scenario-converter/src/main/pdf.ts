import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { Worker } from 'worker_threads'
import { PDFDocument } from 'pdf-lib'

const PDF_PARSE_TIMEOUT_MS = 30_000
const PAGES_PER_CHUNK = 10

// filePath か base64 のどちらかで PDF バッファを受け取る
const WORKER_SCRIPT = `
const { parentPort, workerData } = require('worker_threads')
const { readFile } = require('fs/promises')
async function getBuf() {
  if (workerData.filePath) return readFile(workerData.filePath)
  return Buffer.from(workerData.base64, 'base64')
}
getBuf()
  .then(buf => require(workerData.pdfParsePath)(buf))
  .then(data => {
    const ab = Buffer.from(data.text, 'utf-8')
    const result = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength)
    parentPort.postMessage({ textBuf: result }, [result])
  })
  .catch(err => parentPort.postMessage({ error: String(err) }))
`

type ProgressCallback = (msg: string) => void

function runWorker(workerData: Record<string, unknown>): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParsePath = require.resolve('pdf-parse')
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, { eval: true, workerData: { pdfParsePath, ...workerData } })
    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error('timeout'))
    }, PDF_PARSE_TIMEOUT_MS)
    worker.on('message', ({ textBuf, error }: { textBuf?: ArrayBuffer; error?: string }) => {
      clearTimeout(timer)
      void worker.terminate()
      textBuf !== undefined ? resolve(Buffer.from(textBuf).toString('utf-8')) : reject(new Error(error ?? 'PDF解析エラー'))
    })
    worker.on('error', err => { clearTimeout(timer); reject(err) })
  })
}

// ページ単位に分割して処理する（特定ページで止まっても残りを継続）
async function extractInChunks(buf: Buffer, onProgress?: ProgressCallback): Promise<string> {
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
  const totalPages = doc.getPageCount()
  const results: string[] = []

  for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
    const end = Math.min(start + PAGES_PER_CHUNK, totalPages)
    onProgress?.(`PDFを解析中... (${start + 1}〜${end} / ${totalPages} ページ)`)

    const chunk = await PDFDocument.create()
    const copied = await chunk.copyPages(doc, Array.from({ length: end - start }, (_, i) => start + i))
    copied.forEach(p => chunk.addPage(p))
    const base64 = Buffer.from(await chunk.save()).toString('base64')

    try {
      const text = await runWorker({ base64 })
      if (text.trim()) results.push(text)
    } catch {
      // 問題のあるチャンクをスキップして続行
    }
  }

  return results.join('\n\n')
}

function normalize(text: string): string {
  return text.replace(/(?<=[\u3000-\u9FFF\uFF00-\uFFEF]) (?=[\u3000-\u9FFF\uFF00-\uFFEF])/g, '')
}

/**
 * PDFファイルからテキストを抽出する。
 * まず全体を一括処理し、失敗またはテキストが空の場合はページ分割して再試行する。
 */
export async function extractTextFromPdf(filePath: string, onProgress?: ProgressCallback): Promise<string> {
  const buf = await readFile(filePath)

  // 全体一括処理（高速）
  onProgress?.('PDFを解析中...')
  let elapsed = 0
  const progressInterval = setInterval(() => {
    elapsed += 3
    onProgress?.(`PDFを解析中... (${elapsed}秒経過)`)
  }, 3000)

  let rawText = ''
  try {
    rawText = await runWorker({ filePath })
  } catch {
    // fall through to chunked
  } finally {
    clearInterval(progressInterval)
  }

  // テキストが取れた場合はそのまま返す
  if (rawText.trim().length > 0) return normalize(rawText)

  // 空または失敗 → ページ分割して再試行
  onProgress?.('ページ分割して再解析中...')
  try {
    rawText = await extractInChunks(buf, onProgress)
  } catch {
    // pdf-lib でも読めない場合は諦める
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new Error(
      'PDFからテキストを抽出できませんでした。\n' +
      'スキャン画像のみのPDFはテキスト抽出に非対応です。\n' +
      'テキストレイヤー付きのPDFをご利用ください。'
    )
  }
  return normalize(rawText)
}

/**
 * テキストファイルを読み込む。UTF-8とShift-JISを自動判別する。
 */
export function readTextFile(filePath: string): string {
  const buf = readFileSync(filePath)
  if (isValidUtf8(buf)) return buf.toString('utf-8')
  return decodeShiftJis(buf)
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    const str = buf.toString('utf-8')
    return !str.includes('\uFFFD')
  } catch {
    return false
  }
}

function decodeShiftJis(buf: Buffer): string {
  const decoder = new TextDecoder('shift_jis', { fatal: false })
  return decoder.decode(buf)
}
