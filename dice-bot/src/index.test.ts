// ============================================================
// index.ts 統合テスト - Discord インタラクションレスポンス検証
// ============================================================

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import worker from './index'
import type { Env } from './index'

// ── crypto.subtle のモック（署名検証をスキップ） ───────────────
// Cloudflare Workers では Ed25519 検証が行われるが、テスト環境では
// verify を常に true を返すモックに差し替えて検証をバイパスする。
const originalCrypto = globalThis.crypto
beforeAll(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () => originalCrypto.randomUUID(),
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      verify:    vi.fn().mockResolvedValue(true),
    },
  })
})
afterAll(() => {
  vi.stubGlobal('crypto', originalCrypto)
})

// ── モックデータ ──────────────────────────────────────────────

const MOCK_CHAR = {
  id: '111', user_id: 'player-user', name: '探索者A',
  hp: 12, mp: 10, san: 42, luck: 65,
  stats:  JSON.stringify({ STR:85, CON:50, DEX:50, APP:65, POW:50, SIZ:75, INT:85, EDU:60, MOV:8 }),
  skills: JSON.stringify({ '目星': 75, '心理学': 55 }),
  game: 'coc7',
  updated_at: '2024-01-01T00:00:00Z',
}

const MOCK_SESSION = {
  id: 's1', guild_id: 'guild-1', channel_id: 'channel-1',
  name: '呪われた村', kp_user_id: 'kp-user',
  status: 'active', system: 'coc7',
  started_at: '2024-01-01T10:00:00Z', ended_at: null,
}

function makeDb() {
  return {
    prepare: (sql: string) => ({
      bind: function(this: unknown) { return this },
      first: async () => sql.includes("status = 'active'") ? MOCK_SESSION : MOCK_CHAR,
      run:   async () => ({ success: true }),
      all:   async () => ({ results: [] }),
    }),
  }
}

function makeEnv(): Env {
  return {
    DB: makeDb() as unknown as Env['DB'],
    DISCORD_PUBLIC_KEY: 'deadbeef01234567890123456789012345678901234567890123456789012345',
    DISCORD_APPLICATION_ID: 'app-123',
    DISCORD_BOT_TOKEN: 'bot-token',
  }
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext
}

function makeInteractionRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature-ed25519': 'deadbeef',
      'x-signature-timestamp': '1234567890',
    },
    body: JSON.stringify(body),
  })
}

// ── ヘルパー ─────────────────────────────────────────────────

const EPHEMERAL_FLAG = 64

function ccInteraction(options: Array<{ name: string; value: unknown; type: number }>, userId = 'kp-user') {
  return makeInteractionRequest({
    type: 2, // APPLICATION_COMMAND
    data: { name: 'cc', options },
    member: { user: { id: userId } },
    guild_id:   'guild-1',
    channel_id: 'channel-1',
    token: 'test-token',
  })
}

// ── テスト ────────────────────────────────────────────────────

describe('index: KPターゲット指定ロールのレスポンス', () => {
  it('KPターゲット指定ロールは flags=64 (ephemeral) のレスポンスを返す', async () => {
    const req = ccInteraction([
      { name: 'args',   value: '目星',        type: 3 },
      { name: 'target', value: 'player-user', type: 6 },
    ])
    const res = await worker.fetch(req, makeEnv(), makeCtx())
    const body = await res.json() as { type: number; data: { flags: number; content: string } }

    expect(res.status).toBe(200)
    expect(body.type).toBe(4)               // CHANNEL_MESSAGE_WITH_SOURCE
    expect(body.data.flags).toBe(EPHEMERAL_FLAG)
  })

  it('KPターゲット指定ロールは結果メッセージに技能名とキャラ名が含まれる', async () => {
    const req = ccInteraction([
      { name: 'args',   value: '目星',        type: 3 },
      { name: 'target', value: 'player-user', type: 6 },
    ])
    const res = await worker.fetch(req, makeEnv(), makeCtx())
    const body = await res.json() as { data: { content: string } }

    expect(body.data.content).toContain('目星')
    expect(body.data.content).toContain('探索者A')
  })

  it('通常ロール（targetなし）は secret 未指定時に flags=0（公開）', async () => {
    const req = ccInteraction([
      { name: 'args', value: '目星', type: 3 },
    ], 'user-A')
    const res = await worker.fetch(req, makeEnv(), makeCtx())
    const body = await res.json() as { data: { flags: number } }

    expect(body.data.flags).toBe(0)
  })

  it('通常ロール（targetなし、secret指定）は flags=64 (ephemeral)', async () => {
    const req = ccInteraction([
      { name: 'args', value: '目星 secret', type: 3 },
    ], 'user-A')
    const res = await worker.fetch(req, makeEnv(), makeCtx())
    const body = await res.json() as { data: { flags: number } }

    expect(body.data.flags).toBe(EPHEMERAL_FLAG)
  })
})

describe('index: PING ハンドリング', () => {
  it('PING に対して PONG を返す', async () => {
    const req = makeInteractionRequest({ type: 1 })
    const res = await worker.fetch(req, makeEnv(), makeCtx())
    const body = await res.json() as { type: number }

    expect(body.type).toBe(1) // PONG
  })
})
