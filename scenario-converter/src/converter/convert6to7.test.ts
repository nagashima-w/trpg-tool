import { describe, it, expect } from 'vitest'
import { convertAbilities, calcDerivedStats, convertStatBlock, convertText } from './convert6to7'

// ──────────────────────────────────────────────────────────────────────────────
// convertAbilities: 能力値を×5に変換
// ──────────────────────────────────────────────────────────────────────────────

describe('convertAbilities', () => {
  it('主要能力値を×5に変換する', () => {
    const result = convertAbilities({ STR: 14, CON: 12, SIZ: 15, INT: 7, POW: 13, DEX: 11 })
    expect(result.STR).toBe(70)
    expect(result.CON).toBe(60)
    expect(result.SIZ).toBe(75)
    expect(result.INT).toBe(35)
    expect(result.POW).toBe(65)
    expect(result.DEX).toBe(55)
  })

  it('MOVは×5しない（再計算で別途上書き）', () => {
    const result = convertAbilities({ STR: 14, DEX: 11, SIZ: 15, MOV: 8 })
    expect(result.MOV).toBe(8)
  })

  it('undefinedの値はundefinedのまま', () => {
    const result = convertAbilities({ STR: 14 })
    expect(result.STR).toBe(70)
    expect(result.CON).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// calcDerivedStats: 派生値を再計算（×5後の値で渡す）
// ──────────────────────────────────────────────────────────────────────────────

describe('calcDerivedStats', () => {
  it('HP = (CON×5 + SIZ×5) ÷ 10 切り捨て', () => {
    // CON=12→60, SIZ=15→75  (60+75)/10 = 13.5 → 13
    const result = calcDerivedStats({ CON: 60, SIZ: 75 })
    expect(result.HP).toBe(13)
  })

  it('MP = POW×5 ÷ 5 = POW（6版と同値）', () => {
    // POW=13→65  65/5 = 13
    const result = calcDerivedStats({ POW: 65 })
    expect(result.MP).toBe(13)
  })

  it('SAN = POW×5（6版と同値）', () => {
    // POW=13→65
    const result = calcDerivedStats({ POW: 65 })
    expect(result.SAN).toBe(65)
  })

  it('DB: STR+SIZ=145(70+75) → +1D4, Build 1', () => {
    const result = calcDerivedStats({ STR: 70, SIZ: 75 })
    expect(result.db).toBe('+1D4')
    expect(result.build).toBe(1)
  })

  it('DB: STR+SIZ=100(50+50) → 0, Build 0', () => {
    const result = calcDerivedStats({ STR: 50, SIZ: 50 })
    expect(result.db).toBe('0')
    expect(result.build).toBe(0)
  })

  it('DB: STR+SIZ=75(35+40) → -1, Build -1', () => {
    // 35+40=75 → 65〜84 の範囲
    const result = calcDerivedStats({ STR: 35, SIZ: 40 })
    expect(result.db).toBe('-1')
    expect(result.build).toBe(-1)
  })

  it('DB: STR+SIZ=30(15+15) → -2, Build -2', () => {
    const result = calcDerivedStats({ STR: 15, SIZ: 15 })
    expect(result.db).toBe('-2')
    expect(result.build).toBe(-2)
  })

  it('DB: STR+SIZ=170(85+85) → +1D6, Build 2', () => {
    const result = calcDerivedStats({ STR: 85, SIZ: 85 })
    expect(result.db).toBe('+1D6')
    expect(result.build).toBe(2)
  })

  it('MOV: DEX<SIZ かつ STR<SIZ → 7', () => {
    // STR=55(11), DEX=45(9), SIZ=75(15)
    const result = calcDerivedStats({ STR: 55, DEX: 45, SIZ: 75 })
    expect(result.MOV).toBe(7)
  })

  it('MOV: DEX>SIZ かつ STR>SIZ → 9', () => {
    // STR=90(18), DEX=80(16), SIZ=60(12)
    const result = calcDerivedStats({ STR: 90, DEX: 80, SIZ: 60 })
    expect(result.MOV).toBe(9)
  })

  it('MOV: STR>SIZ かつ DEX<SIZ → 8', () => {
    // STR=80(16), DEX=50(10), SIZ=70(14)
    const result = calcDerivedStats({ STR: 80, DEX: 50, SIZ: 70 })
    expect(result.MOV).toBe(8)
  })

  it('STRまたはSIZが欠けている場合はDB/Buildを計算しない', () => {
    const result = calcDerivedStats({ STR: 70 })
    expect(result.db).toBeUndefined()
    expect(result.build).toBeUndefined()
  })

  it('STR/DEX/SIZが欠けている場合はMOVを計算しない', () => {
    const result = calcDerivedStats({ STR: 70 })
    expect(result.MOV).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// convertStatBlock: statブロック全体を変換
// ──────────────────────────────────────────────────────────────────────────────

describe('convertStatBlock', () => {
  it('6版statブロックの能力値を×5に変換する', () => {
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

  it('変換後テキストに×5後の値が反映される', () => {
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
    expect(result.convertedText).toContain('STR 70')
    expect(result.convertedText).toContain('CON 60')
    expect(result.convertedText).toContain('SIZ 75')
  })

  it('技能名を変換し、変換後テキストに反映される', () => {
    const block = {
      startIndex: 0,
      endIndex: 70,
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
    expect(result.skills[1].name).toBe('近接戦闘（格闘）')
    expect(result.convertedText).toContain('回避 22%')
    expect(result.convertedText).toContain('近接戦闘（格闘） 55%')
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

  it('statブロック以外のテキストは変更しない', () => {
    const text = [
      'これはシナリオ本文です。探索者は廃屋に踏み込んだ。',
      '',
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '',
      '【備考】このNPCは敵対的である。',
    ].join('\n')

    const result = convertText(text)
    expect(result.convertedText).toContain('これはシナリオ本文です。探索者は廃屋に踏み込んだ。')
    expect(result.convertedText).toContain('【備考】このNPCは敵対的である。')
  })

  it('%なしの技能値でも変換される', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      'キック 70  目星 55',
    ].join('\n')
    const result = convertText(text)
    expect(result.convertedText).toContain('近接戦闘（格闘） 70')
    expect(result.convertedText).toContain('目星 55')
    expect(result.convertedText).not.toContain('キック')
  })

  it('《》で囲まれた技能名を変換し、括弧を保持する', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '《キック》70%  《目星》55%',
    ].join('\n')
    const result = convertText(text)
    expect(result.blocks).toHaveLength(1)
    expect(result.convertedText).toContain('《近接戦闘（格闘）》70%')
    expect(result.convertedText).not.toContain('《キック》')
    expect(result.convertedText).toContain('《目星》55%')
  })

  it('値切りを言いくるめに変換する', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '値切り 40%  心理学 55%',
    ].join('\n')
    const result = convertText(text)
    expect(result.convertedText).toContain('言いくるめ 40%')
    expect(result.convertedText).not.toContain('値切り')
  })

  it('値切りと言いくるめが両方ある場合、高い方を採用して敗者を削除する', () => {
    const text = [
      'STR 14  CON 12  SIZ 15  INT 7  POW 13  DEX 11',
      '値切り 40%  言いくるめ 55%',
    ].join('\n')
    const result = convertText(text)
    const count = (result.convertedText.match(/言いくるめ/g) ?? []).length
    expect(count).toBe(1)
    expect(result.convertedText).toContain('言いくるめ 55%')
    expect(result.convertedText).not.toContain('値切り')
  })

  it('パイプ区切り（STR|19）形式を変換する', () => {
    const text = [
      'STR|14  CON|12  SIZ|15  INT|7  POW|13  DEX|11',
      'こぶし|75%  目星|55%',
    ].join('\n')
    const result = convertText(text)
    expect(result.blocks).toHaveLength(1)
    expect(result.convertedText).toContain('STR|70')
    expect(result.convertedText).toContain('CON|60')
    expect(result.convertedText).toContain('近接戦闘（格闘）|75%')
    expect(result.convertedText).toContain('目星|55%')
  })

  it('罫線文字パイプ（STR│19）形式を変換する', () => {
    const text = [
      'STR│14  CON│12  SIZ│15  INT│7  POW│13  DEX│11',
      'こぶし│75%  目星│55%',
    ].join('\n')
    const result = convertText(text)
    expect(result.blocks).toHaveLength(1)
    expect(result.convertedText).toContain('STR│70')
    expect(result.convertedText).toContain('近接戦闘（格闘）│75%')
  })

  it('スペースありパイプ区切り（STR | 14）形式を変換する', () => {
    const text = [
      'STR | 14  CON | 12  SIZ | 15  INT | 7  POW | 13  DEX | 11',
      'こぶし | 75%  目星 | 55%',
    ].join('\n')
    const result = convertText(text)
    expect(result.blocks).toHaveLength(1)
    expect(result.convertedText).toContain('STR | 70')
    expect(result.convertedText).toContain('近接戦闘（格闘） | 75%')
    expect(result.convertedText).toContain('目星 | 55%')
  })

  it('複数のstatブロックをそれぞれ変換する', () => {
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
    expect(result.convertedText).toContain('STR 70')   // 深きもの
    expect(result.convertedText).toContain('STR 80')   // グール
  })
})
