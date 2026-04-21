import { describe, it, expect } from 'vitest'
import { buildCombatContextText, parseBalanceSuggestions } from './balance'
import type { ConversionResult, ConvertedBlock } from './types'

function makeBlock(startIndex: number, endIndex: number, text: string): ConvertedBlock {
  return {
    original: {
      startIndex, endIndex, originalText: text,
      abilities: { STR: 15, CON: 12 }, derived: { HP: 10 }, skills: [], edition: 'coc7',
    },
    convertedStartIndex: startIndex,
    convertedEndIndex: startIndex + text.length,
    abilities: { STR: 75, CON: 60 }, derived: { HP: 10 }, skills: [],
    convertedText: text,
    notes: [],
  }
}

function makeResult(originalText: string, blocks: ConvertedBlock[]): ConversionResult {
  return { originalText, convertedText: originalText, blocks, warnings: [], narrativeReplacements: [] }
}

describe('buildCombatContextText', () => {
  it('ブロックがない場合は空文字を返す', () => {
    expect(buildCombatContextText(makeResult('テスト', []))).toBe('')
  })

  it('1つのブロックを含む文字列を生成する', () => {
    const blockText = 'STR 75 HP 10\n'
    const prefix = '前文\n'
    const block = makeBlock(prefix.length, prefix.length + blockText.length, blockText)
    const result = makeResult(prefix + blockText + '後文', [block])
    const ctx = buildCombatContextText(result)
    expect(ctx).toContain('敵キャラクター #1')
    expect(ctx).toContain('STR 75 HP 10')
  })

  it('前後200文字のコンテキストを含む', () => {
    const before = 'あ'.repeat(300)
    const blockText = 'STR 75\n'
    const after = 'い'.repeat(300)
    const block = makeBlock(before.length, before.length + blockText.length, blockText)
    const result = makeResult(before + blockText + after, [block])
    const ctx = buildCombatContextText(result)
    expect(ctx).toContain('あ'.repeat(200))
    expect(ctx).not.toContain('あ'.repeat(201))
  })

  it('複数ブロックに番号を付ける', () => {
    const block1 = makeBlock(0, 5, 'STR 1')
    const block2 = makeBlock(10, 15, 'STR 2')
    const result = makeResult('STR 1     STR 2', [block1, block2])
    const ctx = buildCombatContextText(result)
    expect(ctx).toContain('敵キャラクター #1')
    expect(ctx).toContain('敵キャラクター #2')
  })
})

describe('parseBalanceSuggestions', () => {
  it('正常なJSON配列をパースする', () => {
    const json = JSON.stringify([
      { blockIndex: 0, category: 'ability', key: 'STR', currentValue: 75, suggestedValue: 60, reason: 'バランス調整' },
    ])
    const result = parseBalanceSuggestions(json, 1)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('STR')
    expect(result[0].suggestedValue).toBe(60)
    expect(result[0].reason).toBe('バランス調整')
  })

  it('コードブロック（```json）で囲まれたJSONをパースする', () => {
    const inner = '[{"blockIndex":0,"category":"skill","key":"図書館","currentValue":60,"suggestedValue":50,"reason":"調整"}]'
    const json = `\`\`\`json\n${inner}\n\`\`\``
    const result = parseBalanceSuggestions(json, 1)
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('図書館')
  })

  it('コードブロック（```のみ）で囲まれたJSONをパースする', () => {
    const inner = '[{"blockIndex":0,"category":"derived","key":"HP","currentValue":10,"suggestedValue":8,"reason":"弱体化"}]'
    const json = `\`\`\`\n${inner}\n\`\`\``
    const result = parseBalanceSuggestions(json, 1)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('derived')
  })

  it('不正なJSONは空配列を返す', () => {
    expect(parseBalanceSuggestions('invalid json', 1)).toHaveLength(0)
  })

  it('配列でないJSONは空配列を返す', () => {
    expect(parseBalanceSuggestions('{}', 1)).toHaveLength(0)
  })

  it('currentValueとsuggestedValueが同じ場合はスキップする', () => {
    const json = JSON.stringify([
      { blockIndex: 0, category: 'ability', key: 'STR', currentValue: 75, suggestedValue: 75, reason: 'same' },
    ])
    expect(parseBalanceSuggestions(json, 1)).toHaveLength(0)
  })

  it('blockIndexが範囲外の場合はスキップする', () => {
    const json = JSON.stringify([
      { blockIndex: 5, category: 'ability', key: 'STR', currentValue: 75, suggestedValue: 60, reason: 'out' },
    ])
    expect(parseBalanceSuggestions(json, 2)).toHaveLength(0)
  })

  it('必須フィールドが欠けているアイテムはスキップする', () => {
    const missingReason = JSON.stringify([
      { blockIndex: 0, category: 'ability', key: 'STR', currentValue: 75, suggestedValue: 60 },
    ])
    expect(parseBalanceSuggestions(missingReason, 1)).toHaveLength(0)

    const missingKey = JSON.stringify([
      { blockIndex: 0, category: 'ability', currentValue: 75, suggestedValue: 60, reason: 'x' },
    ])
    expect(parseBalanceSuggestions(missingKey, 1)).toHaveLength(0)
  })

  it('不明なcategoryはabilityとして扱う', () => {
    const json = JSON.stringify([
      { blockIndex: 0, category: 'unknown', key: 'STR', currentValue: 75, suggestedValue: 60, reason: 'x' },
    ])
    const result = parseBalanceSuggestions(json, 1)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('ability')
  })

  it('複数の有効な提案をまとめて返す', () => {
    const json = JSON.stringify([
      { blockIndex: 0, category: 'ability', key: 'STR', currentValue: 75, suggestedValue: 60, reason: 'a' },
      { blockIndex: 0, category: 'derived', key: 'HP', currentValue: 10, suggestedValue: 8, reason: 'b' },
    ])
    const result = parseBalanceSuggestions(json, 1)
    expect(result).toHaveLength(2)
  })
})
