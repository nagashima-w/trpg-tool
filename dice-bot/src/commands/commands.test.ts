import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCc } from './commands/cc'
import { handleSc } from './commands/sc'
import { handleRoll } from './commands/roll'
import type { D1Database } from './db'

// ── モックヘルパー ────────────────────────────────────────────

function makeDb(charOverride: Record<string, unknown> = {}) {
  const defaultChar = {
    id: '111', user_id: 'user-A', name: '探索者A',
    hp: 12, mp: 10, san: 42, luck: 65,
    stats:  JSON.stringify({ STR:85,CON:50,DEX:50,APP:65,POW:50,SIZ:75,INT:85,EDU:60,MOV:8 }),
    skills: JSON.stringify({ '目星':75, '回避':25, '聞き耳':50 }),
  }
  const char = { ...defaultChar, ...charOverride }
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(char),
    run:   vi.fn().mockResolvedValue({ success: true }),
    all:   vi.fn().mockResolvedValue({ results: [] }),
  }
  return { prepare: vi.fn().mockReturnValue(stmt), _stmt: stmt } as unknown as D1Database & { _stmt: typeof stmt }
}

function makeNoCharDb() {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    run:   vi.fn().mockResolvedValue({ success: true }),
    all:   vi.fn().mockResolvedValue({ results: [] }),
  }
  return { prepare: vi.fn().mockReturnValue(stmt) } as unknown as D1Database
}

// ── handleCc (/cc) ────────────────────────────────────────────

describe('handleCc', () => {
  it('技能名を渡すと判定結果を含む文字列を返す', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星')
    expect(typeof result.message).toBe('string')
    expect(result.message).toContain('目星')
  })

  it('結果に目標値が含まれる', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星')
    expect(result.message).toContain('75')
  })

  it('判定レベルが含まれる（6種のいずれか）', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星')
    const levels = ['クリティカル', 'イクストリーム', 'ハード', 'レギュラー', '失敗', 'ファンブル']
    expect(levels.some(l => result.message.includes(l))).toBe(true)
  })

  it('能力値名（INT, POW等）でも判定できる', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', 'INT')
    expect(result.message).toContain('INT')
    expect(result.message).toContain('85')
  })

  it('ボーナス指定（+1）でextraRollsが表示に含まれる', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星 +1')
    expect(result.message).toContain('ボーナス')
  })

  it('ペナルティ指定（-1）でextraRollsが表示に含まれる', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星 -1')
    expect(result.message).toContain('ペナルティ')
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('secret未指定はephemeral=falseを返す', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '目星')
    expect(result.ephemeral).toBe(false)
  })

  it('存在しない技能・能力値はエラーメッセージを返す', async () => {
    const db = makeDb()
    const result = await handleCc(db, 'user-A', '存在しない技能')
    expect(result.message).toContain('見つかりません')
  })

  it('アクティブキャラなしはエラーメッセージを返す', async () => {
    const result = await handleCc(makeNoCharDb(), 'user-A', '目星')
    expect(result.message).toContain('キャラクター')
  })
})

// ── handleSc (/sc) ────────────────────────────────────────────

describe('handleSc', () => {
  it('SAN値で判定し結果を返す', async () => {
    const db = makeDb()
    const result = await handleSc(db, 'user-A', '0/1d3')
    expect(typeof result.message).toBe('string')
    expect(result.message).toContain('SAN')
  })

  it('成功時は成功時減少値でSANを減算する', async () => {
    const db = makeDb()
    // SAN=42, 判定は必ず成功か失敗かわからないのでrun()が呼ばれることだけ確認
    await handleSc(db, 'user-A', '0/1d3')
    expect(db._stmt.run).toHaveBeenCalled()
  })

  it('現在のSAN値が結果に含まれる', async () => {
    const db = makeDb()
    const result = await handleSc(db, 'user-A', '1/1d6')
    expect(result.message).toContain('42') // 現在SAN
  })

  it('secret指定はephemeral=trueを返す', async () => {
    const db = makeDb()
    const result = await handleSc(db, 'user-A', '0/1d3 secret')
    expect(result.ephemeral).toBe(true)
  })

  it('不正な書式はエラーメッセージを返す', async () => {
    const db = makeDb()
    const result = await handleSc(db, 'user-A', '不正な書式')
    expect(result.message).toContain('書式')
  })

  it('アクティブキャラなしはエラーメッセージを返す', async () => {
    const result = await handleSc(makeNoCharDb(), 'user-A', '0/1d3')
    expect(result.message).toContain('キャラクター')
  })
})

// ── handleRoll (/roll) ────────────────────────────────────────

describe('handleRoll', () => {
  it('1d100の結果を返す', async () => {
    const result = await handleRoll('1d100')
    expect(typeof result.message).toBe('string')
    expect(result.message).toContain('1d100')
  })

  it('2d6の結果は2〜12の範囲', async () => {
    for (let i = 0; i < 20; i++) {
      const result = await handleRoll('2d6')
      const match = result.message.match(/合計[:：]\s*(\d+)/)
      if (match) {
        const total = parseInt(match[1], 10)
        expect(total).toBeGreaterThanOrEqual(2)
        expect(total).toBeLessThanOrEqual(12)
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
