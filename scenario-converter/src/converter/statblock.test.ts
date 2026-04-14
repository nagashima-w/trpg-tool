import { describe, it, expect } from 'vitest'
import { detectStatBlocks, detectEdition } from './statblock'

// ──────────────────────────────────────────────────────────────────────────────
// detectStatBlocks
// ──────────────────────────────────────────────────────────────────────────────

describe('detectStatBlocks', () => {
  it('シンプルな1行スペース区切りを検出できる', () => {
    const text = 'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].abilities.STR).toBe(14)
    expect(blocks[0].abilities.CON).toBe(12)
    expect(blocks[0].abilities.SIZ).toBe(15)
    expect(blocks[0].abilities.INT).toBe(7)
    expect(blocks[0].abilities.POW).toBe(13)
    expect(blocks[0].abilities.DEX).toBe(11)
  })

  it('コロン区切り形式を検出できる', () => {
    const text = 'STR:14  CON:12  SIZ:15  INT:7  POW:13  DEX:11'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].abilities.STR).toBe(14)
  })

  it('全角コロン・全角スペース形式を検出できる', () => {
    const text = 'STR：14　CON：12　SIZ：15　INT：7　POW：13　DEX：11'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].abilities.STR).toBe(14)
  })

  it('派生値（HP, MP）を同一ブロックとして取り込む', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      'HP 14  MP 13',
    ].join('\n')
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].derived.HP).toBe(14)
    expect(blocks[0].derived.MP).toBe(13)
  })

  it('APP - や EDU - はundefinedとして扱う', () => {
    const text = 'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11  APP -  EDU -'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].abilities.APP).toBeUndefined()
  })

  it('技能値を含む行をブロックに取り込む', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '回避 22%  組み付き 55%  聞き耳 35%',
    ].join('\n')
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].skills).toHaveLength(3)
    expect(blocks[0].skills[0].name).toBe('回避')
    expect(blocks[0].skills[0].value).toBe(22)
  })

  it('2体のNPCを別ブロックとして検出する', () => {
    const text = [
      '【深きもの】',
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '',
      '通常のテキスト説明文がここに入ります。',
      '',
      '【グール】',
      'STR 16  CON 14  SIZ 13  INT 7  POW 11  DEX 14',
    ].join('\n')
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].abilities.STR).toBe(14)
    expect(blocks[1].abilities.STR).toBe(16)
  })

  it('能力値が2つ以下の行はブロックとして検出しない', () => {
    const text = 'STR 14  CON 12'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(0)
  })

  it('通常の日本語テキストはブロックとして検出しない', () => {
    const text = 'シナリオ開始から1d6時間後、3名のNPCが登場する。2回目の判定では難易度が上がる。'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// detectEdition（警告用ユーティリティ。変換フローでは使用しない）
// ──────────────────────────────────────────────────────────────────────────────

describe('detectEdition', () => {
  it('低い能力値（3〜18スケール）→ coc6', () => {
    const abilities = { STR: 14, CON: 12, DEX: 11, POW: 13, SIZ: 15 }
    expect(detectEdition(abilities)).toBe('coc6')
  })

  it('高い能力値（×5スケール）→ coc7', () => {
    const abilities = { STR: 70, CON: 60, DEX: 55, POW: 65, SIZ: 75 }
    expect(detectEdition(abilities)).toBe('coc7')
  })

  it('能力値が3つ未満の場合は unknown', () => {
    const abilities = { HP: 14 }
    expect(detectEdition(abilities)).toBe('unknown')
  })
})
