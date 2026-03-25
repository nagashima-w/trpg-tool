import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCc } from './cc'
import { handleSc } from './sc'
import { handleRoll } from './roll'
import { handleChar } from './char'
import { handleSession } from './session'
import type { D1Database } from '../db'

// ── モックヘルパー ────────────────────────────────────────────

const MOCK_CHAR_ROW = {
  id: '111', user_id: 'user-A', name: '探索者A', hp: 12, mp: 10, san: 42, luck: 65,
  stats:  JSON.stringify({ STR:85,CON:50,DEX:50,APP:65,POW:50,SIZ:75,INT:85,EDU:60,MOV:8 }),
  skills: JSON.stringify({ '目星':75, '回避':25, '聞き耳':50 }),
}
const MOCK_SESSION_ROW = {
  id: 's1', guild_id: 'guild-1', name: '呪われた村', kp_user_id: 'kp-user',
  status: 'active' as const, started_at: '2024-01-01T10:00:00Z', ended_at: null,
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

function makeSessionDb({ session = null as unknown, char = MOCK_CHAR_ROW as unknown, logs = [] } = {}) {
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
    const result = await handleCc(makeDb(), 'user-A', '目星')
    expect(result.message).toContain('目星')
  })

  it('結果に目標値が含まれる', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星')
    expect(result.message).toContain('75')
  })

  it('判定レベルが含まれる（6種のいずれか）', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星')
    const levels = ['クリティカル', 'イクストリーム', 'ハード', 'レギュラー', '失敗', 'ファンブル']
    expect(levels.some(l => result.message.includes(l))).toBe(true)
  })

  it('能力値名（INT）でも判定できる', async () => {
    const result = await handleCc(makeDb(), 'user-A', 'INT')
    expect(result.message).toContain('INT')
    expect(result.message).toContain('85')
  })

  it('ボーナス指定（+1）でボーナスが表示に含まれる', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星 +1')
    expect(result.message).toContain('ボーナス')
  })

  it('ペナルティ指定（-1）でペナルティが表示に含まれる', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星 -1')
    expect(result.message).toContain('ペナルティ')
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('secret未指定はephemeral=falseを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星')
    expect(result.ephemeral).toBe(false)
  })

  it('存在しない技能はエラーメッセージを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', '存在しない技能')
    expect(result.message).toContain('見つかりません')
  })

  it('アクティブキャラなしはエラーメッセージを返す', async () => {
    const result = await handleCc(noCharDb, 'user-A', '目星')
    expect(result.message).toContain('キャラクター')
  })

  it('diceLogを返す', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星')
    expect(result.diceLog).toBeDefined()
    expect(result.diceLog?.skillName).toBe('目星')
    expect(result.diceLog?.targetValue).toBe(75)
  })

  it('secret指定時diceLog.isSecret=true', async () => {
    const result = await handleCc(makeDb(), 'user-A', '目星 secret')
    expect(result.diceLog?.isSecret).toBe(true)
  })
})

// ── handleSc (/sc) ────────────────────────────────────────────

describe('handleSc', () => {
  it('SAN値で判定し結果を返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', '0/1d3')
    expect(result.message).toContain('SAN')
  })

  it('現在のSAN値が結果に含まれる', async () => {
    const result = await handleSc(makeDb(), 'user-A', '1/1d6')
    expect(result.message).toContain('42')
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', '0/1d3 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('不正な書式はエラーメッセージを返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', '不正な書式')
    expect(result.message).toContain('書式')
  })

  it('アクティブキャラなしはエラーメッセージを返す', async () => {
    const result = await handleSc(noCharDb, 'user-A', '0/1d3')
    expect(result.message).toContain('キャラクター')
  })

  it('diceLogを返す', async () => {
    const result = await handleSc(makeDb(), 'user-A', '0/1d3')
    expect(result.diceLog).toBeDefined()
    expect(result.diceLog?.skillName).toBe('SANチェック')
    expect(result.diceLog?.targetValue).toBe(42)
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
  it('URL未指定はエラーを返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'set')
    expect(result.message).toContain('URL')
  })

  it('無効なURLはエラーを返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'set https://example.com/123')
    expect(result.message).toContain('無効')
  })
})

describe('handleChar status', () => {
  it('キャラ名・HPが含まれる', async () => {
    const result = await handleChar(makeDb(), 'u', 'status')
    expect(result.message).toContain('探索者A')
    expect(result.message).toContain('12')
  })

  it('ephemeral=true', async () => {
    const result = await handleChar(makeDb(), 'u', 'status')
    expect(result.ephemeral).toBe(true)
  })

  it('キャラなしはエラーを返す', async () => {
    const result = await handleChar(noCharDb, 'u', 'status')
    expect(result.message).toContain('キャラクター')
  })
})

describe('handleChar update', () => {
  it('HP更新のメッセージを返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'update HP -2')
    expect(result.message).toContain('HP')
    expect(result.message).toContain('-2')
  })

  it('無効なターゲットはエラーを返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'update XP -2')
    expect(result.message).toContain('hp')
  })

  it('無効な増減値はエラーを返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'update HP abc')
    expect(result.message).toContain('数値')
  })

  it('不明なサブコマンドは使い方を返す', async () => {
    const result = await handleChar(makeDb(), 'u', 'unknown')
    expect(result.message).toContain('使い方')
  })
})

// ── handleSession (/session) ──────────────────────────────────

describe('handleSession start', () => {
  it('セッション名を含む開始メッセージを返す', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'start 呪われた村')
    expect(result.message).toContain('呪われた村')
    expect(result.ephemeral).toBe(false)
  })

  it('セッション名未指定はエラーを返す', async () => {
    const result = await handleSession(makeSessionDb(), 'kp', 'guild-1', 'start')
    expect(result.message).toContain('セッション名')
  })

  it('既存セッションがある場合は既存名を表示してエラー', async () => {
    const result = await handleSession(makeSessionDb({ session: MOCK_SESSION_ROW }), 'kp', 'guild-1', 'start 新シナリオ')
    expect(result.message).toContain('呪われた村')
  })
})

describe('handleSession end', () => {
  it('セッションなしはエラーを返す', async () => {
    const result = await handleSession(makeSessionDb({ session: null }), 'kp', 'guild-1', 'end')
    expect(result.message).toContain('進行中')
  })

  it('セッションありは終了メッセージとfileを返す', async () => {
    const result = await handleSession(makeSessionDb({ session: MOCK_SESSION_ROW }), 'kp', 'guild-1', 'end')
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
      result_level:'extreme', is_secret:0, timestamp:'2024-01-01T11:00:00Z',
    }]
    const result = await handleSession(
      makeSessionDb({ session: MOCK_SESSION_ROW, logs }),
      'kp', 'guild-1', 'end'
    )
    expect(result.file?.content).toContain('探索者A')
  })

  it('不明なサブコマンドは使い方を返す', async () => {
    const result = await handleSession(makeSessionDb(), 'kp', 'guild-1', 'unknown')
    expect(result.message).toContain('使い方')
  })
})
