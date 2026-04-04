import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getActiveCharacter,
  upsertCharacter,
  setActiveCharacter,
  updateCharacterStat,
  getActiveSession,
  startSession,
  endSession,
  insertDiceLog,
  getDiceLogsForSession,
  type D1Database,
} from './db'

// ── D1のモック ────────────────────────────────────────────────
function makeDb(firstResult: unknown = null, allResult: unknown[] = []) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstResult),
    run:   vi.fn().mockResolvedValue({ success: true }),
    all:   vi.fn().mockResolvedValue({ results: allResult }),
  }
  return {
    prepare: vi.fn().mockReturnValue(stmt),
    _stmt: stmt,
  } as unknown as D1Database & { _stmt: typeof stmt }
}

const MOCK_CHAR = {
  id: '4634372',
  user_id: 'user-123',
  name: '遠山 陽子',
  hp: 12, mp: 10, san: 42, luck: 65,
  stats:  JSON.stringify({ STR: 85, CON: 50, DEX: 50 }),
  skills: JSON.stringify({ '目星': 75, '回避': 25 }),
  updated_at: '2024-01-01T00:00:00Z',
}

const MOCK_SESSION = {
  id: 'session-uuid-1',
  guild_id: 'guild-123',
  channel_id: 'channel-789',
  name: 'テストセッション',
  kp_user_id: 'kp-user-456',
  status: 'active',
  started_at: '2024-01-01T00:00:00Z',
  ended_at: null,
}

// ── getActiveCharacter ────────────────────────────────────────

describe('getActiveCharacter', () => {
  it('アクティブキャラがある場合はCharacterRecordを返す', async () => {
    const db = makeDb(MOCK_CHAR)
    const result = await getActiveCharacter(db, 'user-123')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('遠山 陽子')
  })

  it('stats・skillsをJSONパースして返す', async () => {
    const db = makeDb(MOCK_CHAR)
    const result = await getActiveCharacter(db, 'user-123')
    expect(result?.stats).toEqual({ STR: 85, CON: 50, DEX: 50 })
    expect(result?.skills).toEqual({ '目星': 75, '回避': 25 })
  })

  it('アクティブキャラがない場合はnullを返す', async () => {
    const db = makeDb(null)
    const result = await getActiveCharacter(db, 'user-999')
    expect(result).toBeNull()
  })

  it('user_idをbindして呼ぶ', async () => {
    const db = makeDb(MOCK_CHAR)
    await getActiveCharacter(db, 'user-123')
    expect(db._stmt.bind).toHaveBeenCalledWith('user-123')
  })
})

// ── upsertCharacter ───────────────────────────────────────────

describe('upsertCharacter', () => {
  it('INSERT OR REPLACEを実行する', async () => {
    const db = makeDb()
    await upsertCharacter(db, {
      id: '4634372', user_id: 'user-123', game: 'coc7', name: '遠山 陽子',
      hp: 12, mp: 10, san: 42, luck: 65,
      stats: { STR: 85, CON: 50, DEX: 50, APP: 65, POW: 50, SIZ: 75, INT: 85, EDU: 60, MOV: 8 },
      skills: { '目星': 75 },
    })
    expect(db._stmt.run).toHaveBeenCalled()
  })

  it('stats・skillsをJSON文字列にシリアライズしてbindする', async () => {
    const db = makeDb()
    await upsertCharacter(db, {
      id: '111', user_id: 'u1', game: 'coc7', name: 'テスト',
      hp: 1, mp: 1, san: 1, luck: 1,
      stats: { STR: 10, CON: 10, DEX: 10, APP: 10, POW: 10, SIZ: 10, INT: 10, EDU: 10, MOV: 7 },
      skills: { '目星': 50 },
    })
    const calls = db._stmt.bind.mock.calls[0]
    // stats と skills が JSON 文字列で渡されている (id, user_id, game, name, hp, mp, san, luck, stats, skills)
    expect(typeof calls[8]).toBe('string') // stats
    expect(typeof calls[9]).toBe('string') // skills
    expect(JSON.parse(calls[8])).toHaveProperty('STR')
    expect(JSON.parse(calls[9])).toHaveProperty('目星')
  })
})

// ── setActiveCharacter ────────────────────────────────────────

describe('setActiveCharacter', () => {
  it('INSERT OR REPLACEを実行する', async () => {
    const db = makeDb()
    await setActiveCharacter(db, 'user-123', '4634372')
    expect(db._stmt.run).toHaveBeenCalled()
    expect(db._stmt.bind).toHaveBeenCalledWith('user-123', '4634372')
  })
})

// ── updateCharacterStat ───────────────────────────────────────

describe('updateCharacterStat', () => {
  it('HPを増減できる', async () => {
    const db = makeDb(MOCK_CHAR)
    await updateCharacterStat(db, 'user-123', 'hp', -2)
    expect(db._stmt.run).toHaveBeenCalled()
  })

  it('san・luck・mpも受け付ける', async () => {
    const db = makeDb(MOCK_CHAR)
    for (const stat of ['san', 'mp', 'luck'] as const) {
      await updateCharacterStat(db, 'user-123', stat, 1)
      expect(db._stmt.run).toHaveBeenCalled()
    }
  })

  it('アクティブキャラがない場合はエラーをthrowする', async () => {
    const db = makeDb(null)
    await expect(updateCharacterStat(db, 'user-999', 'hp', -1))
      .rejects.toThrow()
  })
})

// ── getActiveSession ──────────────────────────────────────────

describe('getActiveSession', () => {
  it('activeなセッションを返す', async () => {
    const db = makeDb(MOCK_SESSION)
    const result = await getActiveSession(db, 'guild-123', 'channel-789')
    expect(result?.id).toBe('session-uuid-1')
    expect(result?.status).toBe('active')
  })

  it('activeなセッションがない場合はnullを返す', async () => {
    const db = makeDb(null)
    expect(await getActiveSession(db, 'guild-123', 'channel-789')).toBeNull()
  })
})

// ── startSession ──────────────────────────────────────────────

describe('startSession', () => {
  it('セッションを作成してIDを返す', async () => {
    const db = makeDb()
    const id = await startSession(db, 'guild-123', 'channel-789', 'テストセッション', 'kp-user-456')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(db._stmt.run).toHaveBeenCalled()
  })
})

// ── endSession ────────────────────────────────────────────────

describe('endSession', () => {
  it('statusをcompletedにしてended_atをセットする', async () => {
    const db = makeDb()
    await endSession(db, 'session-uuid-1')
    expect(db._stmt.run).toHaveBeenCalled()
    expect(db._stmt.bind).toHaveBeenCalledWith(
      expect.anything(), // ended_at (ISO文字列)
      'session-uuid-1',
    )
  })
})

// ── insertDiceLog ─────────────────────────────────────────────

describe('insertDiceLog', () => {
  it('ダイスログを挿入する', async () => {
    const db = makeDb()
    await insertDiceLog(db, {
      session_id: 'session-uuid-1',
      user_id: 'user-123',
      character_name: '遠山 陽子',
      skill_name: '目星',
      target_value: 75,
      final_dice: 12,
      result_level: 'extreme',
      is_secret: false,
    })
    expect(db._stmt.run).toHaveBeenCalled()
  })

  it('is_secretをboolean→0/1に変換してbindする', async () => {
    const db = makeDb()
    await insertDiceLog(db, {
      session_id: 's1', user_id: 'u1', character_name: 'テスト',
      skill_name: '目星', target_value: 50, final_dice: 10,
      result_level: 'extreme', is_secret: true,
    })
    const calls = db._stmt.bind.mock.calls[0]
    expect(calls[7]).toBe(1) // is_secret=true → 1
  })
})

// ── getDiceLogsForSession ─────────────────────────────────────

describe('getDiceLogsForSession', () => {
  it('セッションIDに紐づくログを全件返す', async () => {
    const mockLogs = [
      { id: 1, session_id: 's1', user_id: 'u1', character_name: 'A',
        skill_name: '目星', target_value: 75, final_dice: 12,
        result_level: 'extreme', is_secret: 0, timestamp: '2024-01-01T00:00:00Z' },
    ]
    const db = makeDb(null, mockLogs)
    const logs = await getDiceLogsForSession(db, 's1')
    expect(logs).toHaveLength(1)
    expect(logs[0].result_level).toBe('extreme')
  })

  it('is_secretを0/1→booleanに変換して返す', async () => {
    const mockLogs = [
      { id: 2, session_id: 's1', user_id: 'u1', character_name: 'A',
        skill_name: '目星', target_value: 50, final_dice: 1,
        result_level: 'critical', is_secret: 1, timestamp: '2024-01-01T00:00:00Z' },
    ]
    const db = makeDb(null, mockLogs)
    const logs = await getDiceLogsForSession(db, 's1')
    expect(logs[0].is_secret).toBe(true)
  })
})
