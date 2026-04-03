import { describe, it, expect } from 'vitest'
import {
  parseCharasheetUrl,
  fetchCharasheet,
  mapToCharacter,
  type CharasheetData,
  type CharacterRecord,
} from './charasheet'

// ── parseCharasheetUrl ────────────────────────────────────────

describe('parseCharasheetUrl', () => {
  it('数値IDのURLからIDを抽出する', () => {
    const result = parseCharasheetUrl('https://charasheet.vampire-blood.net/4634372')
    expect(result).toEqual({ id: '4634372', type: 'numeric' })
  })

  it('ハッシュIDのURLからIDを抽出する（mプレフィックスを保持）', () => {
    const result = parseCharasheetUrl('https://charasheet.vampire-blood.net/m5581dda6da39fc547e6014f994c3bc86')
    expect(result).toEqual({ id: 'm5581dda6da39fc547e6014f994c3bc86', type: 'hash' })
  })

  it('末尾スラッシュ付きでも動作する', () => {
    const result = parseCharasheetUrl('https://charasheet.vampire-blood.net/4634372/')
    expect(result).toEqual({ id: '4634372', type: 'numeric' })
  })

  it('無効なURLはnullを返す', () => {
    expect(parseCharasheetUrl('https://example.com/12345')).toBeNull()
    expect(parseCharasheetUrl('not-a-url')).toBeNull()
    expect(parseCharasheetUrl('')).toBeNull()
  })

  it('vampire-blood.net以外のドメインはnullを返す', () => {
    expect(parseCharasheetUrl('https://charasheet.evil.net/4634372')).toBeNull()
  })
})

// ── mapToCharacter ────────────────────────────────────────────
// fetchCharasheetはネットワークアクセスが必要なためmapToCharacterを重点的にテスト

const VALID_COC7_DATA: CharasheetData = {
  game: 'coc7',
  data_id: 4634372,
  phrase: '5581dda6da39fc547e6014f994c3bc86',
  pc_name: '遠山 陽子(とおやま ようこ)',
  // 能力値: NP1=STR, NP2=CON, NP3=DEX, NP4=APP, NP5=POW, NP6=SIZ, NP7=INT, NP8=EDU, NP9=MOV
  NP1: '85', NP2: '50', NP3: '50', NP4: '65',
  NP5: '50', NP6: '75', NP7: '85', NP8: '60', NP9: '8',
  // HP/MP
  NP10: '12', NP11: '10',
  // SAN・幸運
  SAN_Left: '42',
  Luck_Left: '65',
  // 技能（配列）
  SKAN: ['威圧', '聞き耳', '目星', '回避', '図書館'],
  SKAP: ['15',   '59',     '75',   '25',   '70'],
}

const VALID_COC6_DATA: CharasheetData = {
  ...VALID_COC7_DATA,
  game: 'coc6',
}

const NON_COC_DATA: CharasheetData = {
  ...VALID_COC7_DATA,
  game: 'sw2.5', // 違うゲームシステム
}

describe('mapToCharacter', () => {
  it('coc7のデータを正しくマッピングする', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')
    expect(char).not.toBeNull()
    expect(char?.game).toBe('coc7')
  })

  it('coc6のデータも受け入れる', () => {
    const char = mapToCharacter(VALID_COC6_DATA, 'user-discord-123')
    expect(char).not.toBeNull()
    expect(char?.game).toBe('coc6')
  })

  it('coc6・coc7以外のgameフィールドはnullを返す', () => {
    expect(mapToCharacter(NON_COC_DATA, 'user-discord-123')).toBeNull()
  })

  it('キャラクター名を正しく取得する', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')!
    expect(char.name).toBe('遠山 陽子(とおやま ようこ)')
  })

  it('HP・MP・SAN・幸運を数値で取得する', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')!
    expect(char.hp).toBe(12)
    expect(char.mp).toBe(10)
    expect(char.san).toBe(42)
    expect(char.luck).toBe(65)
  })

  it('能力値をstatsオブジェクトにマッピングする', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')!
    expect(char.stats).toEqual({
      STR: 85, CON: 50, DEX: 50, APP: 65,
      POW: 50, SIZ: 75, INT: 85, EDU: 60, MOV: 8,
    })
  })

  it('技能をskillsオブジェクトにマッピングする（名前→合計値）', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')!
    expect(char.skills).toEqual({
      '威圧': 15,
      '聞き耳': 59,
      '目星': 75,
      '回避': 25,
      '図書館': 70,
    })
  })

  it('user_idを正しくセットする', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')!
    expect(char.user_id).toBe('user-discord-123')
  })

  it('idはdata_idの文字列表現になる', () => {
    const char = mapToCharacter(VALID_COC7_DATA, 'user-discord-123')!
    expect(char.id).toBe('4634372')
  })

  it('技能値が空文字の項目はスキップされる', () => {
    const data: CharasheetData = {
      ...VALID_COC7_DATA,
      SKAN: ['目星', '医学', '図書館'],
      SKAP: ['75',   '',    '70'],    // 医学は未割り振り
    }
    const char = mapToCharacter(data, 'user-discord-123')!
    expect(char.skills).not.toHaveProperty('医学')
    expect(char.skills).toHaveProperty('目星')
    expect(char.skills).toHaveProperty('図書館')
  })

  it('技能値が"0"の項目も含める', () => {
    const data: CharasheetData = {
      ...VALID_COC7_DATA,
      SKAN: ['クトゥルフ神話'],
      SKAP: ['0'],
    }
    const char = mapToCharacter(data, 'user-discord-123')!
    expect(char.skills).toHaveProperty('クトゥルフ神話', 0)
  })
})

// ── fetchCharasheet ───────────────────────────────────────────
// ネットワーク依存のため型チェックのみ

describe('fetchCharasheet (型シグネチャ)', () => {
  it('関数としてエクスポートされている', () => {
    expect(typeof fetchCharasheet).toBe('function')
  })

  it('Promiseを返す', () => {
    // 存在しないIDで呼んでもPromiseが返ること（rejectはOK）
    const result = fetchCharasheet('0000000')
    expect(result).toBeInstanceOf(Promise)
    result.catch(() => {}) // unhandled rejection を防ぐ
  })
})
