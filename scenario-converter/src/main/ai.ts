import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'fs/promises'

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

export async function extractPdfTextWithClaude(filePath: string, apiKey: string): Promise<string> {
  const buf = await readFile(filePath)
  const base64 = buf.toString('base64')

  const client = new Anthropic({ apiKey })
  // PDF対応はbeta機能のため型アサーションを使用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = await (client.beta.messages as any).create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        { type: 'text', text: PDF_EXTRACT_PROMPT },
      ],
    }],
  }) as { content: Array<{ type: string; text: string }> }

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('予期しないレスポンス形式です')
  return block.text
}

export async function reformatWithClaude(text: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: REFORMAT_PROMPT + text }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('予期しないレスポンス形式です')
  return block.text
}

export async function reformatWithGemini(text: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: REFORMAT_PROMPT + text }] }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API エラー: ${res.status} ${err}`)
  }
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  return data.candidates[0].content.parts[0].text
}
