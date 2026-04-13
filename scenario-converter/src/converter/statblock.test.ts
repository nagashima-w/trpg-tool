import { describe, it, expect } from 'vitest'
import { detectStatBlocks, detectEdition } from './statblock'

// ──────────────────────────────────────────────────────────────────────────────
// detectStatBlocks
// ──────────────────────────────────────────────────────────────────────────────

describe('detectStatBlocks', () => {
  it('シンプルな1行形式を検出できる', () => {
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

  it('複数行にまたがる場合でも検出できる', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      'HP 14  MP 13',
    ].join('\n')
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].derived.HP).toBe(14)
    expect(blocks[0].derived.MP).toBe(13)
  })

  it('ダッシュ値（APP -）は undefined として扱う', () => {
    const text = 'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11  APP -  EDU -'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].abilities.APP).toBeUndefined()
  })

  it('2つのNPCのstatブロックを別々に検出できる', () => {
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

  it('3未満の能力値しかない行はstatブロックとして検出しない', () => {
    const text = 'STR 14  CON 12'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(0)
  })

  it('通常のテキスト（数字入り）はstatブロックとして検出しない', () => {
    const text = 'シナリオ開始から1d6時間後、3名のNPCが登場する。2回目の判定では難易度が上がる。'
    const blocks = detectStatBlocks(text)
    expect(blocks).toHaveLength(0)
  })

  it('技能値を含むstatブロックを検出できる', () => {
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
})

// ──────────────────────────────────────────────────────────────────────────────
// detectEdition
// ──────────────────────────────────────────────────────────────────────────────

describe('detectEdition', () => {
  it('能力値が低い（3〜18スケール）→ 6版と判定', () => {
    const abilities = { STR: 14, CON: 12, DEX: 11, POW: 13, SIZ: 15 }
    expect(detectEdition(abilities)).toBe('coc6')
  })

  it('能力値が高い（×5スケール）→ 7版と判定', () => {
    const abilities = { STR: 70, CON: 60, DEX: 55, POW: 65, SIZ: 75 }
    expect(detectEdition(abilities)).toBe('coc7')
  })

  it('能力値が不足している場合は unknown', () => {
    const abilities = { HP: 14 }
    expect(detectEdition(abilities)).toBe('unknown')
  })

  it('境界値: STR 30 以下なら6版', () => {
    const abilities = { STR: 20, CON: 18, DEX: 16, POW: 14, SIZ: 22 }
    expect(detectEdition(abilities)).toBe('coc6')
  })

  it('境界値: STR 40 以上なら7版', () => {
    const abilities = { STR: 40, CON: 45, DEX: 50, POW: 55, SIZ: 60 }
    expect(detectEdition(abilities)).toBe('coc7')
  })
})
