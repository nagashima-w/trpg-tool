import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'

const PDF_PARSE_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`PDFの解析がタイムアウトしました（${ms / 1000}秒）。ファイルが破損しているか、非対応の形式の可能性があります。`)), ms)
    ),
  ])
}

/**
 * PDFファイルからテキストを抽出する。
 * pdf-parseを動的インポートして使用。
 */
export async function extractTextFromPdf(filePath: string): Promise<string> {
  // pdf-parseはCJSモジュールのため動的requireで読み込む
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
  const buf = await readFile(filePath)
  const data = await withTimeout(pdfParse(buf), PDF_PARSE_TIMEOUT_MS)
  if (!data.text || data.text.trim().length === 0) {
    throw new Error(
      'PDFからテキストを抽出できませんでした。\n' +
      'スキャン画像のみのPDFはテキスト抽出に非対応です。\n' +
      'テキストレイヤー付きのPDFをご利用ください。'
    )
  }
  // CJK文字間の余分なスペース（PDF抽出アーティファクト）を除去
  const text = data.text.replace(/(?<=[\u3000-\u9FFF\uFF00-\uFFEF]) (?=[\u3000-\u9FFF\uFF00-\uFFEF])/g, '')
  return text
}

/**
 * テキストファイルを読み込む。UTF-8とShift-JISを自動判別する。
 */
export function readTextFile(filePath: string): string {
  const buf = readFileSync(filePath)

  // Shift-JIS の BOM なしファイルを判定する簡易ヒューリスティック
  // UTF-8 として読めるかどうかを試みる
  if (isValidUtf8(buf)) {
    return buf.toString('utf-8')
  }

  // Shift-JIS として読む（Node.js では 'latin1' で読んでから変換）
  return decodeShiftJis(buf)
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    const str = buf.toString('utf-8')
    // 変換後に U+FFFD（置換文字）が含まれていないか確認
    return !str.includes('\uFFFD')
  } catch {
    return false
  }
}

function decodeShiftJis(buf: Buffer): string {
  // Node.js 標準では Shift-JIS デコードがないため
  // TextDecoder（Webほか）を使う
  const decoder = new TextDecoder('shift_jis', { fatal: false })
  return decoder.decode(buf)
}
