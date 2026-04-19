import { readFileSync } from 'fs'
import { Worker } from 'worker_threads'

const PDF_PARSE_TIMEOUT_MS = 60_000

// pdfjs-dist v3 legacy build を使ってページ単位でテキスト抽出する
// pdf-parse (内部 pdfjs v2.0.550) より新しく、ページ単位エラーハンドリングが可能
const WORKER_SCRIPT = `
const { parentPort, workerData } = require('worker_threads')
const { readFile } = require('fs/promises')

async function run() {
  const pdfjsLib = require(workerData.pdfjsPath)
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const buf = await readFile(workerData.filePath)
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    disableRange: true,
    disableStream: true,
  }).promise

  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .filter(item => 'str' in item)
        .map(item => item.str + (item.hasEOL ? '\\n' : ''))
        .join('')
      if (text.trim()) pages.push(text)
    } catch {
      // 問題のあるページをスキップして継続
    }
  }
  return pages.join('\\n')
}

run()
  .then(text => {
    const ab = Buffer.from(text, 'utf-8')
    const result = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength)
    parentPort.postMessage({ textBuf: result }, [result])
  })
  .catch(err => parentPort.postMessage({ error: String(err) }))
`

type ProgressCallback = (msg: string) => void

export async function extractTextFromPdf(filePath: string, onProgress?: ProgressCallback): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.js')

  const rawText = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, { eval: true, workerData: { pdfjsPath, filePath } })

    onProgress?.('PDFを解析中...')
    let elapsed = 0
    const progressInterval = setInterval(() => {
      elapsed += 3
      onProgress?.(`PDFを解析中... (${elapsed}秒経過)`)
    }, 3000)

    const cleanup = () => clearInterval(progressInterval)

    const timer = setTimeout(() => {
      cleanup()
      void worker.terminate()
      reject(new Error(`PDFの解析がタイムアウトしました（${PDF_PARSE_TIMEOUT_MS / 1000}秒）。`))
    }, PDF_PARSE_TIMEOUT_MS)

    worker.on('message', ({ textBuf, error }: { textBuf?: ArrayBuffer; error?: string }) => {
      cleanup()
      clearTimeout(timer)
      void worker.terminate()
      textBuf !== undefined
        ? resolve(Buffer.from(textBuf).toString('utf-8'))
        : reject(new Error(error ?? 'PDF解析エラー'))
    })
    worker.on('error', err => { cleanup(); clearTimeout(timer); reject(err) })
  })

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
    return !buf.toString('utf-8').includes('\uFFFD')
  } catch {
    return false
  }
}

function decodeShiftJis(buf: Buffer): string {
  const decoder = new TextDecoder('shift_jis', { fatal: false })
  return decoder.decode(buf)
}
