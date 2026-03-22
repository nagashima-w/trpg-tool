import { describe, it, expect, vi } from 'vitest'
import {
  rollD100,
  judgeResult,
  applyBonusPenalty,
  parseRollExpression,
  evalRollExpression,
  type RollResult,
  type JudgeResult,
} from './dice'

// ── rollD100 ──────────────────────────────────────────────────────────────────

describe('rollD100', () => {
  it('1以上100以下の整数を返す', () => {
    for (let i = 0; i < 100; i++) {
      const r = rollD100()
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(100)
      expect(Number.isInteger(r)).toBe(true)
    }
  })

  it('10の位ダイスと1の位ダイスの内訳を返す', () => {
    const r = rollD100()
    // tens: 0,10,20,...,90  ones: 1-10
    // final = tens + ones (100の場合はtens=90,ones=10)
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(100)
  })

  it('内訳オブジェクトを返す（tens, ones, total）', () => {
    const result = rollD100(/* detailed= */ true)
    expect(result).toHaveProperty('tens')
    expect(result).toHaveProperty('ones')
    expect(result).toHaveProperty('total')
    expect([0,10,20,30,40,50,60,70,80,90]).toContain(result.tens)
    expect(result.ones).toBeGreaterThanOrEqual(1)
    expect(result.ones).toBeLessThanOrEqual(10)
    expect(result.total).toBe(
      result.tens + result.ones === 100 ? 100 : result.tens + result.ones
    )
  })
})

// ── judgeResult ───────────────────────────────────────────────────────────────

describe('judgeResult - クリティカル', () => {
  it('出目1は常にクリティカル', () => {
    expect(judgeResult(1, 50)).toBe('critical')
    expect(judgeResult(1, 1)).toBe('critical')
    expect(judgeResult(1, 99)).toBe('critical')
  })
})

describe('judgeResult - ファンブル', () => {
  it('目標値49以下のとき出目96〜100はファンブル', () => {
    expect(judgeResult(96, 49)).toBe('fumble')
    expect(judgeResult(97, 30)).toBe('fumble')
    expect(judgeResult(100, 49)).toBe('fumble')
  })

  it('目標値50以上のとき出目100のみファンブル', () => {
    expect(judgeResult(100, 50)).toBe('fumble')
    expect(judgeResult(100, 99)).toBe('fumble')
  })

  it('目標値50以上のとき出目96〜99はファンブルではない（失敗）', () => {
    expect(judgeResult(96, 50)).toBe('failure')
    expect(judgeResult(99, 75)).toBe('failure')
  })
})

describe('judgeResult - イクストリーム', () => {
  it('出目が目標値の1/5以下（端数切り捨て）はイクストリーム', () => {
    expect(judgeResult(10, 50)).toBe('extreme')  // 50/5=10
    expect(judgeResult(1,  50)).toBe('critical')  // クリティカル優先
    expect(judgeResult(12, 60)).toBe('extreme')  // 60/5=12
    expect(judgeResult(13, 60)).not.toBe('extreme')
  })
})

describe('judgeResult - ハード', () => {
  it('出目が目標値の1/2以下（端数切り捨て）はハード', () => {
    expect(judgeResult(25, 50)).toBe('hard')  // 50/2=25
    expect(judgeResult(11, 50)).toBe('extreme') // 1/5以下なのでextreme優先
    expect(judgeResult(30, 60)).toBe('hard')  // 60/2=30
    expect(judgeResult(31, 60)).not.toBe('hard')
  })
})

describe('judgeResult - レギュラー', () => {
  it('出目が目標値以下はレギュラー', () => {
    expect(judgeResult(50, 50)).toBe('regular')
    expect(judgeResult(26, 50)).toBe('regular')
    expect(judgeResult(60, 60)).toBe('regular')
  })
})

describe('judgeResult - 失敗', () => {
  it('出目が目標値より大きいは失敗', () => {
    expect(judgeResult(51, 50)).toBe('failure')
    expect(judgeResult(99, 50)).toBe('failure')
  })
})

// ── applyBonusPenalty ─────────────────────────────────────────────────────────

describe('applyBonusPenalty', () => {
  it('ボーナスなし（modifier=0）はそのまま返す', () => {
    const base = { tens: 40, ones: 5, total: 45 }
    const result = applyBonusPenalty(base, 0)
    expect(result.final).toBe(45)
    expect(result.extraRolls).toHaveLength(0)
  })

  it('ボーナス1個: 10の位を2回振り小さい方を採用', () => {
    // base.tens=80, extraTens=20 → 20を採用 → final=25
    const base = { tens: 80, ones: 5, total: 85 }
    const result = applyBonusPenalty(base, 1, [20])
    expect(result.final).toBe(25)
    expect(result.extraRolls).toHaveLength(1)
    expect(result.extraRolls[0]).toBe(20)
  })

  it('ボーナス1個: baseの方が小さければbaseを採用', () => {
    const base = { tens: 20, ones: 5, total: 25 }
    const result = applyBonusPenalty(base, 1, [80])
    expect(result.final).toBe(25)
  })

  it('ペナルティ1個: 10の位を2回振り大きい方を採用', () => {
    // base.tens=20, extraTens=80 → 80を採用 → final=85
    const base = { tens: 20, ones: 5, total: 25 }
    const result = applyBonusPenalty(base, -1, [80])
    expect(result.final).toBe(85)
    expect(result.extraRolls).toHaveLength(1)
  })

  it('ボーナス2個: 10の位を3回振り最小を採用', () => {
    const base = { tens: 60, ones: 5, total: 65 }
    const result = applyBonusPenalty(base, 2, [40, 20])
    expect(result.final).toBe(25) // tens=20が最小 → 20+5=25
    expect(result.extraRolls).toHaveLength(2)
  })

  it('100（tens=90, ones=10）の扱い: ボーナスで置き換えられた場合も正しく計算', () => {
    // base=100(fumble想定), bonus1個, extra=0(tens=0,ones=5扱い)
    const base = { tens: 90, ones: 10, total: 100 }
    const result = applyBonusPenalty(base, 1, [0])
    // tens=0, ones=10 → total=10
    expect(result.final).toBe(10)
  })

  it('ペナルティで100になる場合: tens=90+ones=10=100として扱う', () => {
    const base = { tens: 20, ones: 10, total: 30 }
    const result = applyBonusPenalty(base, -1, [90])
    // tens=90, ones=10 → total=100
    expect(result.final).toBe(100)
  })
})

// ── parseRollExpression ───────────────────────────────────────────────────────

describe('parseRollExpression', () => {
  it('1d100をパースする', () => {
    expect(parseRollExpression('1d100')).toEqual({ count: 1, sides: 100, modifier: 0 })
  })

  it('2d6をパースする', () => {
    expect(parseRollExpression('2d6')).toEqual({ count: 2, sides: 6, modifier: 0 })
  })

  it('1d6+1をパースする', () => {
    expect(parseRollExpression('1d6+1')).toEqual({ count: 1, sides: 6, modifier: 1 })
  })

  it('1d3-1をパースする', () => {
    expect(parseRollExpression('1d3-1')).toEqual({ count: 1, sides: 3, modifier: -1 })
  })

  it('大文字Dも受け付ける', () => {
    expect(parseRollExpression('1D6')).toEqual({ count: 1, sides: 6, modifier: 0 })
  })

  it('不正な式はnullを返す', () => {
    expect(parseRollExpression('abc')).toBeNull()
    expect(parseRollExpression('')).toBeNull()
    expect(parseRollExpression('1d')).toBeNull()
  })
})

// ── evalRollExpression ────────────────────────────────────────────────────────

describe('evalRollExpression', () => {
  it('1d6の結果は1〜6', () => {
    for (let i = 0; i < 50; i++) {
      const r = evalRollExpression('1d6')
      expect(r.total).toBeGreaterThanOrEqual(1)
      expect(r.total).toBeLessThanOrEqual(6)
    }
  })

  it('2d6の結果は2〜12', () => {
    for (let i = 0; i < 50; i++) {
      const r = evalRollExpression('2d6')
      expect(r.total).toBeGreaterThanOrEqual(2)
      expect(r.total).toBeLessThanOrEqual(12)
      expect(r.rolls).toHaveLength(2)
    }
  })

  it('1d6+3の結果は4〜9、modifierが加算される', () => {
    for (let i = 0; i < 50; i++) {
      const r = evalRollExpression('1d6+3')
      expect(r.total).toBeGreaterThanOrEqual(4)
      expect(r.total).toBeLessThanOrEqual(9)
    }
  })

  it('不正な式はnullを返す', () => {
    expect(evalRollExpression('abc')).toBeNull()
  })
})
