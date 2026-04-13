import { describe, it, expect } from 'vitest'
import { convertAbilities, calcDerivedStats, convertStatBlock, convertText } from './convert6to7'

// ──────────────────────────────────────────────────────────────────────────────
// convertAbilities: 能力値を×5に変換
// ──────────────────────────────────────────────────────────────────────────────

describe('convertAbilities', () => {
  it('全能力値を×5に変換する', () => {
    const result = convertAbilities({ STR: 14, CON: 12, SIZ: 15, INT: 7, POW: 13, DEX: 11 })
    expect(result.STR).toBe(70)
    expect(result.CON).toBe(60)
    expect(result.SIZ).toBe(75)
    expect(result.INT).toBe(35)
    expect(result.POW).toBe(65)
    expect(result.DEX).toBe(55)
  })

  it('MOVは変換しない（別途再計算）', () => {
    const result = convertAbilities({ STR: 14, DEX: 11, SIZ: 15, MOV: 8 })
    // MOVは×5しない
    expect(result.MOV).toBe(8)
  })

  it('undefinedの値はそのまま', () => {
    const result = convertAbilities({ STR: 14 })
    expect(result.STR).toBe(70)
    expect(result.CON).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// calcDerivedStats: 派生値を再計算
// ──────────────────────────────────────────────────────────────────────────────

describe('calcDerivedStats', () => {
  // ×5後の値で渡す
  it('HPを再計算する: (CON×5 + SIZ×5)/10 切り捨て', () => {
    const result = calcDerivedStats({ STR: 70, CON: 60, SIZ: 75, INT: 35, POW: 65, DEX: 55 })
    // (60+75)/10 = 13.5 → 13
    expect(result.HP).toBe(13)
  })

  it('MPを再計算する: POW×5 / 5 = POW', () => {
    const result = calcDerivedStats({ STR: 70, CON: 60, SIZ: 75, INT: 35, POW: 65, DEX: 55 })
    // POW=65 → MP=65/5=13
    expect(result.MP).toBe(13)
  })

  it('SANを再計算する: POW×5（6版のPOW×5と同値）', () => {
    const result = calcDerivedStats({ STR: 70, CON: 60, SIZ: 75, INT: 35, POW: 65, DEX: 55 })
    // POW=65 → SAN=65
    expect(result.SAN).toBe(65)
  })

  it('ダメージボーナスを再計算: STR+SIZ=145 → +1D4, Build 1', () => {
    // STR70 + SIZ75 = 145
    const result = calcDerivedStats({ STR: 70, CON: 60, SIZ: 75, INT: 35, POW: 65, DEX: 55 })
    expect(result.db).toBe('+1D4')
    expect(result.build).toBe(1)
  })

  it('ダメージボーナス: STR+SIZ=130 → +1D4, Build 1', () => {
    // STR50 + SIZ80 = 130
    const result = calcDerivedStats({ STR: 50, SIZ: 80 })
    expect(result.db).toBe('+1D4')
    expect(result.build).toBe(1)
  })

  it('ダメージボーナス: STR+SIZ=100 → 0, Build 0', () => {
    // STR50 + SIZ50 = 100
    const result = calcDerivedStats({ STR: 50, SIZ: 50 })
    expect(result.db).toBe('0')
    expect(result.build).toBe(0)
  })

  it('ダメージボーナス: STR+SIZ=50 → -1, Build -1', () => {
    // STR25 + SIZ25 = 50
    const result = calcDerivedStats({ STR: 25, SIZ: 25 })
    expect(result.db).toBe('-1')
    expect(result.build).toBe(-1)
  })

  it('ダメージボーナス: STR+SIZ=170 → +1D6, Build 2', () => {
    // STR85 + SIZ85 = 170
    const result = calcDerivedStats({ STR: 85, SIZ: 85 })
    expect(result.db).toBe('+1D6')
    expect(result.build).toBe(2)
  })

  it('MOVを再計算: DEX<SIZ かつ STR<SIZ → MOV 7', () => {
    // STR=55 DEX=45 SIZ=75 (raw: 11, 9, 15)
    const result = calcDerivedStats({ STR: 55, DEX: 45, SIZ: 75 })
    expect(result.MOV).toBe(7)
  })

  it('MOVを再計算: STR>SIZ かつ DEX>SIZ → MOV 9', () => {
    // STR=90 DEX=80 SIZ=60 (raw: 18, 16, 12)
    const result = calcDerivedStats({ STR: 90, DEX: 80, SIZ: 60 })
    expect(result.MOV).toBe(9)
  })

  it('MOVを再計算: STR>SIZ かつ DEX<SIZ → MOV 8', () => {
    // STR=80 DEX=50 SIZ=70 (raw: 16, 10, 14)
    const result = calcDerivedStats({ STR: 80, DEX: 50, SIZ: 70 })
    expect(result.MOV).toBe(8)
  })

  it('STRまたはSIZが欠けている場合はDB/Buildを計算しない', () => {
    const result = calcDerivedStats({ STR: 70 })
    expect(result.db).toBeUndefined()
    expect(result.build).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// convertStatBlock: statブロック全体を変換
// ──────────────────────────────────────────────────────────────────────────────

describe('convertStatBlock', () => {
  it('6版statブロックを7版に変換する', () => {
    const block = {
      startIndex: 0,
      endIndex: 45,
      originalText: 'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      abilities: { STR: 14, CON: 12, SIZ: 15, INT: 7, POW: 13, DEX: 11 },
      derived: {},
      skills: [],
      edition: 'coc6' as const,
    }
    const result = convertStatBlock(block)
    expect(result.abilities.STR).toBe(70)
    expect(result.abilities.CON).toBe(60)
    expect(result.abilities.SIZ).toBe(75)
    expect(result.abilities.INT).toBe(35)
    expect(result.abilities.POW).toBe(65)
    expect(result.abilities.DEX).toBe(55)
  })

  it('技能名を変換する', () => {
    const block = {
      startIndex: 0,
      endIndex: 60,
      originalText: 'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11\nドッジ 22%  組み付き 55%',
      abilities: { STR: 14, CON: 12, SIZ: 15, INT: 7, POW: 13, DEX: 11 },
      derived: {},
      skills: [
        { name: 'ドッジ', value: 22 },
        { name: '組み付き', value: 55 },
      ],
      edition: 'coc6' as const,
    }
    const result = convertStatBlock(block)
    expect(result.skills[0].name).toBe('回避')
    expect(result.skills[1].name).toBe('格闘（組み付き）')
  })

  it('7版のブロックはそのまま返す（変換しない）', () => {
    const block = {
      startIndex: 0,
      endIndex: 45,
      originalText: 'STR 70  CON 60  SIZ 75  INT 35  POW 65  DEX 55',
      abilities: { STR: 70, CON: 60, SIZ: 75, INT: 35, POW: 65, DEX: 55 },
      derived: {},
      skills: [],
      edition: 'coc7' as const,
    }
    const result = convertStatBlock(block)
    // 変換なし → 値そのまま
    expect(result.abilities.STR).toBe(70)
    expect(result.notes).toContain('すでに7版の値です。変換をスキップしました。')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// convertText: テキスト全体を変換
// ──────────────────────────────────────────────────────────────────────────────

describe('convertText', () => {
  it('statブロックを含むテキストを変換する', () => {
    const text = [
      '【深きもの】',
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      'HP 14  MP 13',
    ].join('\n')

    const result = convertText(text)
    expect(result.blocks).toHaveLength(1)
    expect(result.convertedText).toContain('STR 70')
    expect(result.convertedText).toContain('CON 60')
    expect(result.originalText).toContain('STR 14')
  })

  it('statブロックがないテキストはそのまま返す', () => {
    const text = 'このシナリオにはstatブロックが含まれていません。普通のテキストです。'
    const result = convertText(text)
    expect(result.blocks).toHaveLength(0)
    expect(result.convertedText).toBe(text)
  })

  it('複数のstatブロックを変換する', () => {
    const text = [
      '【深きもの】',
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '',
      '説明テキスト',
      '',
      '【グール】',
      'STR 16  CON 14  SIZ 13  INT 7  POW 11  DEX 14',
    ].join('\n')

    const result = convertText(text)
    expect(result.blocks).toHaveLength(2)
    expect(result.convertedText).toContain('STR 70')
    expect(result.convertedText).toContain('STR 80')
  })
})
