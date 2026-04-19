import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { Worker } from 'worker_threads'

const PDF_PARSE_TIMEOUT_MS = 30_000

// pdf-parse を Worker Thread で実行することで、メインの event loop のブロックを防ぐ
const WORKER_SCRIPT = `
const { parentPort, workerData } = require('worker_threads')
require(workerData.pdfParsePath)(Buffer.from(workerData.data))
  .then(data => parentPort.postMessage({ text: data.text }))
  .catch(err => parentPort.postMessage({ error: String(err) }))
`

type ProgressCallback = (msg: string) => void

async function parsePdfInWorker(buf: Buffer, onProgress?: ProgressCallback): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParsePath = require.resolve('pdf-parse')
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { pdfParsePath, data: new Uint8Array(buf) },
    })

    onProgress?.('PDFを解析中...')
    let elapsed = 0
    const progressInterval = setInterval(() => {
      elapsed += 3
      onProgress?.(`PDFを解析中... (${elapsed}秒経過)`)
    }, 3000)

    const cleanup = () => { clearInterval(progressInterval) }

    const timeoutTimer = setTimeout(() => {
      cleanup()
      void worker.terminate()
      reject(new Error(`PDFの解析がタイムアウトしました（${PDF_PARSE_TIMEOUT_MS / 1000}秒）。ファイルが破損しているか、非対応の形式の可能性があります。`))
    }, PDF_PARSE_TIMEOUT_MS)

    worker.on('message', ({ text, error }: { text?: string; error?: string }) => {
      cleanup()
      clearTimeout(timeoutTimer)
      void worker.terminate()
      text !== undefined ? resolve(text) : reject(new Error(error ?? 'PDF解析エラー'))
    })
    worker.on('error', err => { cleanup(); clearTimeout(timeoutTimer); reject(err) })
  })
}

/**
 * PDFファイルからテキストを抽出する。
 */
export async function extractTextFromPdf(filePath: string, onProgress?: ProgressCallback): Promise<string> {
  const buf = await readFile(filePath)
  const rawText = await parsePdfInWorker(buf, onProgress)
  if (!rawText || rawText.trim().length === 0) {
    throw new Error(
      'PDFからテキストを抽出できませんでした。\n' +
      'スキャン画像のみのPDFはテキスト抽出に非対応です。\n' +
      'テキストレイヤー付きのPDFをご利用ください。'
    )
  }
  // CJK文字間の余分なスペース（PDF抽出アーティファクト）を除去
  return rawText.replace(/(?<=[\u3000-\u9FFF\uFF00-\uFFEF]) (?=[\u3000-\u9FFF\uFF00-\uFFEF])/g, '')
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
