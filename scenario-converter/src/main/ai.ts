import Anthropic from '@anthropic-ai/sdk'

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
