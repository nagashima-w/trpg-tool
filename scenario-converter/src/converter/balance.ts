import type { ConversionResult, BalanceSuggestion } from './types'

const CONTEXT_CHARS = 200

/** ConversionResultからAIに送る戦闘コンテキスト文字列を生成 */
export function buildCombatContextText(result: ConversionResult): string {
  const { originalText, blocks } = result
  if (blocks.length === 0) return ''

  return blocks.map((block, i) => {
    const ctxStart = Math.max(0, block.original.startIndex - CONTEXT_CHARS)
    const ctxEnd = Math.min(originalText.length, block.original.endIndex + CONTEXT_CHARS)
    const before = originalText.slice(ctxStart, block.original.startIndex).trim()
    const after = originalText.slice(block.original.endIndex, ctxEnd).trim()

    const lines: string[] = [`=== 敵キャラクター #${i + 1} ===`]
    if (before) lines.push(`[前後の文脈（前）]\n${before}`)
    lines.push(`[ステータスブロック]\n${block.convertedText.trim()}`)
    if (after) lines.push(`[前後の文脈（後）]\n${after}`)
    return lines.join('\n')
  }).join('\n\n')
}

/** AIのJSON応答をBalanceSuggestion[]に変換 */
export function parseBalanceSuggestions(response: string, blockCount: number): BalanceSuggestion[] {
  const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = codeBlock ? codeBlock[1].trim() : response.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const suggestions: BalanceSuggestion[] = []
  for (const item of parsed) {
    if (
      typeof item !== 'object' || item === null ||
      typeof (item as Record<string, unknown>).blockIndex !== 'number' ||
      typeof (item as Record<string, unknown>).key !== 'string' ||
      typeof (item as Record<string, unknown>).currentValue !== 'number' ||
      typeof (item as Record<string, unknown>).suggestedValue !== 'number' ||
      typeof (item as Record<string, unknown>).reason !== 'string'
    ) continue

    const it = item as Record<string, unknown>
    if ((it.blockIndex as number) < 0 || (it.blockIndex as number) >= blockCount) continue
    if (it.currentValue === it.suggestedValue) continue

    const rawCategory = it.category
    const category: BalanceSuggestion['category'] =
      rawCategory === 'ability' || rawCategory === 'skill' || rawCategory === 'derived'
        ? rawCategory : 'ability'

    suggestions.push({
      blockIndex: it.blockIndex as number,
      category,
      key: it.key as string,
      currentValue: it.currentValue as number,
      suggestedValue: it.suggestedValue as number,
      reason: it.reason as string,
    })
  }
  return suggestions
}
