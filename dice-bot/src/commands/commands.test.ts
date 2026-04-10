import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCc } from './cc'
import { handleSc } from './sc'
import { handleRoll } from './roll'
import { handleChar } from './char'
import { handleSession } from './session'
import type { D1Database } from '../db'
import * as charasheeetModule from '../charasheet'
import type { CharasheetData } from '../charasheet'

// fetchCharasheet のみ部分的にモック（parseCharasheetUrl・mapToCharacter は実装を維持）
vi.mock('../charasheet', async () => {
  const actual = await vi.importActual<typeof import('../charasheet')>('../charasheet')
  return { ...actual, fetchCharasheet: vi.fn() }
})

// ── モックヘルパー ────────────────────────────────────────────

const MOCK_CHAR_ROW = {
  id: '111', user_id: 'user-A', name: '探索者A', hp: 12, mp: 10, san: 42, luck: 65,
  stats:  JSON.stringify({ STR:85,CON:50,DEX:50,APP:65,POW:50,SIZ:75,INT:85,EDU:60,MOV:8 }),
  skills: JSON.stringify({ '目星':75, '回避':25, '聞き耳':50 }),
}
const MOCK_SESSION_ROW = {
  id: 's1', guild_id: 'guild-1', channel_id: 'channel-1', name: '呪われた村', kp_user_id: 'kp-user',
  status: 'active' as const, system: 'coc7' as const, started_at: '2024-01-01T10:00:00Z', ended_at: null,
}

function makeDb(char = MOCK_CHAR_ROW as unknown) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(char),
    run:   vi.fn().mockResolvedValue({ success: true }),
    all:   vi.fn().mockResolvedValue({ results: [] }),
  }
  return { prepare: vi.fn().mockReturnValue(stmt), _stmt: stmt } as unknown as D1Database & { _stmt: typeof stmt }
}

function makeSessionDb({ session = null as unknown, char = MOCK_CHAR_ROW as unknown, logs = [] as unknown[] } = {}) {
  return {
    prepare: (sql: string) => ({
      bind: function() { return this },
      first: async () => sql.includes("status = 'active'") ? session : char,
      run:   async () => ({ success: true }),
      all:   async () => ({ results: logs }),
    })
  } as unknown as D1Database
}

const noCharDb = makeDb(null)

// ── handleCc (/cc) ────────────────────────────────────────────

describe('handleCc', () => {
  it('技能名を渡すと判定結果を含む文字列を返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星')
    expect(result.message).toContain('目星')
  })

  it('結果に目標値が含まれる', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星')
    expect(result.message).toContain('75')
  })

  it('判定レベルが含まれる（7版の6種のいずれか）', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星')
    const levels = ['クリティカル', 'イクストリーム', 'ハード', 'レギュラー', '失敗', 'ファンブル']
    expect(levels.some(l => result.message.includes(l))).toBe(true)
  })

  it('能力値名（INT）でも判定できる', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', 'INT')
    expect(result.message).toContain('INT')
    expect(result.message).toContain('85')
  })

  it('ボーナス指定（+1）でボーナスが表示に含まれる', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星 +1')
    expect(result.message).toContain('ボーナス')
  })

  it('ペナルティ指定（-1）でペナルティが表示に含まれる', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星 -1')
    expect(result.message).toContain('ペナルティ')
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('secret未指定はephemeral=falseを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星')
    expect(result.ephemeral).toBe(false)
  })

  it('幸運で判定できる（char.luckを使用）', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '幸運')
    expect(result.message).toContain('65') // MOCK_CHAR_ROW.luck = 65
    expect(result.diceLog?.targetValue).toBe(65)
  })

  it('LUCK（英語）で判定できる', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', 'LUCK')
    expect(result.diceLog?.targetValue).toBe(65)
  })

  it('HPで判定できる（char.hpを使用）', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', 'HP')
    expect(result.diceLog?.targetValue).toBe(12) // MOCK_CHAR_ROW.hp = 12
  })

  it('SANで判定できる（char.sanを使用）', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', 'SAN')
    expect(result.diceLog?.targetValue).toBe(42) // MOCK_CHAR_ROW.san = 42
  })

  it('存在しない技能はエラーメッセージを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '存在しない技能')
    expect(result.message).toContain('見つかりません')
  })

  it('アクティブキャラなしはエラーメッセージを返す', async () => {
    const result = await handleCc(noCharDb, 'user-A', 'guild-1', 'channel-1', '目星')
    expect(result.message).toContain('キャラクター')
  })

  it('diceLogを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星')
    expect(result.diceLog).toBeDefined()
    expect(result.diceLog?.skillName).toBe('目星')
    expect(result.diceLog?.targetValue).toBe(75)
  })

  it('secret指定時diceLog.isSecret=true', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'guild-1', 'channel-1', '目星 secret')
    expect(result.diceLog?.isSecret).toBe(true)
  })

  it('第6版セッションでは判定レベルが6版種のいずれか', async () => {
    const db = makeSessionDb({ session: { ...MOCK_SESSION_ROW, system: 'coc6' } })
    const result = await handleCc(db, 'user-A', 'guild-1', 'channel-1', '目星')
    const levels = ['クリティカル', 'スペシャル', '成功', '失敗', 'ファンブル']
    expect(levels.some(l => result.message.includes(l))).toBe(true)
  })

  it('第6版セッションでボーナスダイス指定はエラーを返す', async () => {
    const db = makeSessionDb({ session: { ...MOCK_SESSION_ROW, system: 'coc6' } })
    const result = await handleCc(db, 'user-A', 'guild-1', 'channel-1', '目星 +1')
    expect(result.message).toContain('第6版')
    expect(result.ephemeral).toBe(true)
  })

  // 付記付き技能の多段階ルックアップ
  const charWithOneAnnotation = {
    ...MOCK_CHAR_ROW,
    skills: JSON.stringify({ '目星': 75, '運転（自動車）': 40 }),
  }
  const charWithMultipleAnnotations = {
    ...MOCK_CHAR_ROW,
    skills: JSON.stringify({ '運転（自動車）': 40, '運転（バイク）': 30 }),
  }

  it('付記部分のみ入力で該当技能を判定できる', async () => {
    const result = await handleCc(makeDb(charWithOneAnnotation), 'user-A', 'guild-1', 'channel-1', '自動車')
    expect(result.diceLog?.targetValue).toBe(40)
    expect(result.diceLog?.skillName).toBe('運転（自動車）')
  })

  it('完全な技能名（付記込み）でも判定できる', async () => {
    const result = await handleCc(makeDb(charWithOneAnnotation), 'user-A', 'guild-1', 'channel-1', '運転（自動車）')
    expect(result.diceLog?.targetValue).toBe(40)
  })

  it('ベース名入力・1件一致でその技能を判定できる', async () => {
    const result = await handleCc(makeDb(charWithOneAnnotation), 'user-A', 'guild-1', 'channel-1', '運転')
    expect(result.diceLog?.targetValue).toBe(40)
    expect(result.diceLog?.skillName).toBe('運転（自動車）')
  })

  it('ベース名入力・複数一致でエラーメッセージを返す', async () => {
    const result = await handleCc(makeDb(charWithMultipleAnnotations), 'user-A', 'guild-1', 'channel-1', '運転')
    expect(result.message).toContain('複数')
    expect(result.message).toContain('運転（自動車）')
    expect(result.message).toContain('運転（バイク）')
    expect(result.ephemeral).toBe(true)
  })
})

// ── handleCc KPターゲット指定ロール ──────────────────────────

describe('handleCc KPターゲット指定', () => {
  it('KPが対象PLの技能値でロールできる', async () => {
    const db = makeSessionDb({ session: MOCK_SESSION_ROW })
    const result = await handleCc(db, 'kp-user', 'guild-1', 'channel-1', '目星', 'user-A')
    expect(result.message).toContain('目星')
    expect(result.message).toContain('75') // MOCK_CHAR_ROW の目星値
    expect(result.message).toContain('探索者A') // 対象キャラ名
    expect(result.ephemeral).toBe(true) // 常にエフェメラル
    expect(result.diceLog).toBeUndefined() // KPターゲットはログ記録なし
  })

  it('KP以外がターゲット指定するとエラー', async () => {
    const db = makeSessionDb({ session: MOCK_SESSION_ROW })
    const result = await handleCc(db, 'user-A', 'guild-1', 'channel-1', '目星', 'user-B')
    expect(result.message).toContain('KP')
    expect(result.ephemeral).toBe(true)
  })

  it('セッションなしでターゲット指定するとエラー', async () => {
    const db = makeSessionDb({ session: null })
    const result = await handleCc(db, 'kp-user', 'guild-1', 'channel-1', '目星', 'user-A')
    expect(result.message).toContain('セッション')
    expect(result.ephemeral).toBe(true)
  })

  it('対象PLにキャラクターがない場合エラー', async () => {
    const db = makeSessionDb({ session: MOCK_SESSION_ROW, char: null })
    const result = await handleCc(db, 'kp-user', 'guild-1', 'channel-1', '目星', 'user-A')
    expect(result.message).toContain('キャラクター')
    expect(result.ephemeral).toBe(true)
  })

  it('対象PLの技能が見つからない場合エラー', async () => {
    const db = makeSessionDb({ session: MOCK_SESSION_ROW })
    const result = await handleCc(db, 'kp-user', 'guild-1', 'channel-1', '存在しない技能', 'user-A')
    expect(result.message).toContain('見つかりません')
    expect(result.ephemeral).toBe(true)
  })

  it('第6版セッションでボーナスダイス指定はエラー', async () => {
    const db = makeSessionDb({ session: { ...MOCK_SESSION_ROW, system: 'coc6' } })
    const result = await handleCc(db, 'kp-user', 'guild-1', 'channel-1', '目星 +1', 'user-A')
    expect(result.message).toContain('第6版')
    expect(result.ephemeral).toBe(true)
  })
})

// ── handleSc (/sc) ────────────────────────────────────────────

describe('handleSc', () => {
  it('SAN値で判定し結果を返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', 'guild-1', 'channel-1', '0/1d3')
    expect(result.message).toContain('SAN')
  })

  it('現在のSAN値が結果に含まれる', async () => {
    const result = await handleSc(makeDb(), 'user-A', 'guild-1', 'channel-1', '1/1d6')
    expect(result.message).toContain('42')
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', 'guild-1', 'channel-1', '0/1d3 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('不正な書式はエラーメッセージを返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', 'guild-1', 'channel-1', '不正な書式')
    expect(result.message).toContain('書式')
  })

  it('アクティブキャラなしはエラーメッセージを返す', async () => {
    const result = await handleSc(noCharDb, 'user-A', 'guild-1', 'channel-1', '0/1d3')
    expect(result.message).toContain('キャラクター')
  })

  it('diceLogを返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', 'guild-1', 'channel-1', '0/1d3')
    expect(result.diceLog).toBeDefined()
    expect(result.diceLog?.skillName).toBe('SANチェック')
    expect(result.diceLog?.targetValue).toBe(42)
  })

  it('第6版セッションでもSANチェックが動作する', async () => {
    const db = makeSessionDb({ session: { ...MOCK_SESSION_ROW, system: 'coc6' } })
    const result = await handleSc(db, 'user-A', 'guild-1', 'channel-1', '0/1d3')
    expect(result.message).toContain('SANチェック')
    expect(result.diceLog?.targetValue).toBe(42)
  })

  it('diceLogにextraValue（SAN減少量）が含まれる', async () => {
    const result = await handleSc(makeDb(), 'user-A', 'guild-1', 'channel-1', '0/1d3')
    expect(result.diceLog?.extraValue).toBeDefined()
    expect(typeof result.diceLog?.extraValue).toBe('number')
    expect(result.diceLog!.extraValue!).toBeGreaterThanOrEqual(0)
  })
})

// ── handleRoll (/roll) ────────────────────────────────────────

describe('handleRoll', () => {
  it('1d100の結果を返す', async () => {
    const result = await handleRoll('1d100')
    expect(result.message).toContain('1d100')
  })

  it('2d6の合計は2〜12の範囲', async () => {
    for (let i = 0; i < 20; i++) {
      const result = await handleRoll('2d6')
      const match = result.message.match(/合計：\*\*(\d+)\*\*/)
      if (match) {
        expect(parseInt(match[1])).toBeGreaterThanOrEqual(2)
        expect(parseInt(match[1])).toBeLessThanOrEqual(12)
      }
    }
  })

  it('修正値付き（1d6+3）の結果が含まれる', async () => {
    const result = await handleRoll('1d6+3')
    expect(result.message).toContain('1d6+3')
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const result = await handleRoll('1d6 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('不正な式はエラーメッセージを返す', async () => {
    const result = await handleRoll('abc')
    expect(result.message).toContain('書式')
  })
})

// ── handleChar (/char) ────────────────────────────────────────

describe('handleChar set', () => {
  it('セッションなしはエラーを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: null }), 'u', 'guild-1', 'channel-1', 'set https://charasheet.vampire-blood.net/123')
    expect(result.message).toContain('セッション')
  })

  it('URL未指定はエラーを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: MOCK_SESSION_ROW }), 'u', 'guild-1', 'channel-1', 'set')
    expect(result.message).toContain('URL')
  })

  it('無効なURLはエラーを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: MOCK_SESSION_ROW }), 'u', 'guild-1', 'channel-1', 'set https://example.com/123')
    expect(result.message).toContain('無効')
  })
})

describe('handleChar status', () => {
  it('キャラ名・HPが含まれる', async () => {
    const result = await handleChar(makeDb(), 'u', 'guild-1', 'channel-1', 'status')
    expect(result.message).toContain('探索者A')
    expect(result.message).toContain('12')
  })

  it('ephemeral=false（公開）', async () => {
    const result = await handleChar(makeDb(), 'u', 'guild-1', 'channel-1', 'status')
    expect(result.ephemeral).toBe(false)
  })

  it('キャラなしはエラーを返す', async () => {
    const result = await handleChar(noCharDb, 'u', 'guild-1', 'channel-1', 'status')
    expect(result.message).toContain('キャラクター')
  })
})

describe('handleChar update', () => {
  it('セッションなしはエラーを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: null }), 'u', 'guild-1', 'channel-1', 'update HP -2')
    expect(result.message).toContain('セッション')
  })

  it('HP更新のメッセージを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: MOCK_SESSION_ROW }), 'u', 'guild-1', 'channel-1', 'update HP -2')
    expect(result.message).toContain('HP')
    expect(result.message).toContain('-2')
  })

  it('無効なターゲットはエラーを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: MOCK_SESSION_ROW }), 'u', 'guild-1', 'channel-1', 'update XP -2')
    expect(result.message).toContain('hp')
  })

  it('無効な増減値はエラーを返す', async () => {
    const result = await handleChar(makeSessionDb({ session: MOCK_SESSION_ROW }), 'u', 'guild-1', 'channel-1', 'update HP abc')
    expect(result.message).toContain('数値')
  })

  it('不明なサブコマンドは使い方を返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'guild-1', 'channel-1', 'unknown')
    expect(result.message).toContain('使い方')
  })
})

describe('handleChar refresh', () => {
  const MOCK_FRESH_DATA: CharasheetData = {
    game: 'coc7',
    data_id: 111,
    phrase: 'abc',
    pc_name: '探索者A',
    NP1: '85', NP2: '50', NP3: '50', NP4: '65',
    NP5: '50', NP6: '75', NP7: '85', NP8: '60', NP9: '8',
    NP10: '99', NP11: '99', // HP・MP（保管所の値 ← 現在値と意図的に違う値）
    SAN_Left: '1',           // SAN（保管所の値 ← 現在値と意図的に違う値）
    Luck_Left: '1',          // LUCK（同上）
    SKAN: ['目星', '夢見'],
    SKAP: ['75',   '22'],
    SKAM: ['',     ''],
  }

  beforeEach(() => {
    vi.mocked(charasheeetModule.fetchCharasheet).mockReset()
  })

  it('キャラなしはエラーを返す', async () => {
    const result = await handleChar(noCharDb, 'u', 'guild-1', 'channel-1', 'refresh')
    expect(result.message).toContain('キャラクター')
    expect(result.ephemeral).toBe(true)
  })

  it('fetchCharasheetが失敗した場合エラーを返す', async () => {
    vi.mocked(charasheeetModule.fetchCharasheet).mockRejectedValueOnce(new Error('タイムアウト'))
    const result = await handleChar(makeDb(), 'u', 'guild-1', 'channel-1', 'refresh')
    expect(result.message).toContain('失敗')
    expect(result.ephemeral).toBe(true)
  })

  it('成功時に技能更新完了メッセージを返す', async () => {
    vi.mocked(charasheeetModule.fetchCharasheet).mockResolvedValueOnce(MOCK_FRESH_DATA)
    const result = await handleChar(makeDb(), 'u', 'guild-1', 'channel-1', 'refresh')
    expect(result.message).toContain('更新')
    expect(result.ephemeral).toBe(true)
  })

  it('成功メッセージにHP・SAN維持の旨が含まれる', async () => {
    vi.mocked(charasheeetModule.fetchCharasheet).mockResolvedValueOnce(MOCK_FRESH_DATA)
    const result = await handleChar(makeDb(), 'u', 'guild-1', 'channel-1', 'refresh')
    expect(result.message).toContain('HP')
    expect(result.message).toContain('SAN')
  })
})

// ── handleSession (/session) ──────────────────────────────────

describe('handleSession start', () => {
  it('セッション名を含む開始メッセージを返す', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'channel-1', 'start 呪われた村')
    expect(result.message).toContain('呪われた村')
    expect(result.ephemeral).toBe(false)
  })

  it('システム未指定は第7版として開始する', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'channel-1', 'start 呪われた村')
    expect(result.message).toContain('第7版')
  })

  it('coc6指定で第6版として開始する', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'channel-1', 'start 怪異の夜 coc6')
    expect(result.message).toContain('怪異の夜')
    expect(result.message).toContain('第6版')
  })

  it('coc7指定で第7版として開始する', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'channel-1', 'start 呪われた村 coc7')
    expect(result.message).toContain('呪われた村')
    expect(result.message).toContain('第7版')
  })

  it('セッション名未指定はエラーを返す', async () => {
    const result = await handleSession(makeSessionDb(), 'kp', 'guild-1', 'channel-1', 'start')
    expect(result.message).toContain('セッション名')
  })

  it('既存セッションがある場合は既存名を表示してエラー', async () => {
    const result = await handleSession(makeSessionDb({ session: MOCK_SESSION_ROW }), 'kp', 'guild-1', 'channel-1', 'start 新シナリオ')
    expect(result.message).toContain('呪われた村')
  })
})

describe('handleSession end', () => {
  it('セッションなしはエラーを返す', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'channel-1', 'end')
    expect(result.message).toContain('進行中')
  })

  it('セッションありは終了メッセージとfileを返す', async () => {
    const result = await handleSession(makeSessionDb({ session: MOCK_SESSION_ROW }), 'kp', 'guild-1', 'channel-1', 'end')
    expect(result.message).toContain('終了')
    expect(result.ephemeral).toBe(false)
    expect(result.file).toBeDefined()
    expect(result.file?.name).toContain('呪われた村')
    expect(result.file?.content).toContain('# 呪われた村')
  })

  it('ログがある場合レポートに参加者が含まれる', async () => {
    const logs = [{
      id:1, session_id:'s1', user_id:'user-A', character_name:'探索者A',
      skill_name:'目星', target_value:75, final_dice:12,
      result_level:'extreme', is_secret:false, extra_value:null, timestamp:'2024-01-01T11:00:00Z',
    }]
    const result = await handleSession(
      makeSessionDb({ session: MOCK_SESSION_ROW, logs }),
      'kp', 'guild-1', 'channel-1', 'end'
    )
    expect(result.file?.content).toContain('探索者A')
  })

  it('不明なサブコマンドは使い方を返す', async () => {
    const result = await handleSession(makeSessionDb(), 'kp', 'guild-1', 'channel-1', 'unknown')
    expect(result.message).toContain('使い方')
  })
})
