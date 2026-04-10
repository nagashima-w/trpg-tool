import { describe, it, expect } from 'vitest'
import { parseCommandOptions } from './parseCommandOptions'

// Discord interaction の options 配列を簡単に組み立てるヘルパー
function opt(name: string, value: unknown) {
  return { name, value }
}
function subCmd(name: string, options?: Array<{ name: string; value: unknown }>) {
  return { name, options }
}

describe('parseCommandOptions', () => {
  // ── /cc ──────────────────────────────────────────────────────

  describe('/cc', () => {
    it('args のみ指定 → args が取れ ccTargetUserId は undefined', () => {
      const result = parseCommandOptions('cc', [opt('args', '目星')])
      expect(result.args).toBe('目星')
      expect(result.ccTargetUserId).toBeUndefined()
    })

    it('args + target 指定 → 両方取れる', () => {
      const result = parseCommandOptions('cc', [opt('args', '目星'), opt('target', 'user-123')])
      expect(result.args).toBe('目星')
      expect(result.ccTargetUserId).toBe('user-123')
    })

    it('target だけ先に来ても args を正しく取れる', () => {
      // Discord はオプション順が保証されないケースがある
      const result = parseCommandOptions('cc', [opt('target', 'user-123'), opt('args', '回避')])
      expect(result.args).toBe('回避')
      expect(result.ccTargetUserId).toBe('user-123')
    })

    it('options が undefined → args は空文字、ccTargetUserId は undefined', () => {
      const result = parseCommandOptions('cc', undefined)
      expect(result.args).toBe('')
      expect(result.ccTargetUserId).toBeUndefined()
    })

    it('secret や modifier を含む args 文字列もそのまま返す', () => {
      const result = parseCommandOptions('cc', [opt('args', '目星 +1 secret')])
      expect(result.args).toBe('目星 +1 secret')
    })
  })

  // ── /session ─────────────────────────────────────────────────

  describe('/session', () => {
    it('start name のみ → "start <name>"', () => {
      const result = parseCommandOptions('session', [
        subCmd('start', [opt('name', '呪われた村')]),
      ])
      expect(result.args).toBe('start 呪われた村')
      expect(result.ccTargetUserId).toBeUndefined()
    })

    it('start name + system → "start <name> <system>"', () => {
      const result = parseCommandOptions('session', [
        subCmd('start', [opt('name', '怪異の夜'), opt('system', 'coc6')]),
      ])
      expect(result.args).toBe('start 怪異の夜 coc6')
    })

    it('end → "end"', () => {
      const result = parseCommandOptions('session', [subCmd('end')])
      expect(result.args).toBe('end')
    })

    it('pc param → "pc <param>"', () => {
      const result = parseCommandOptions('session', [
        subCmd('pc', [opt('param', 'list')]),
      ])
      expect(result.args).toBe('pc list')
    })

    it('options が undefined → args は空文字', () => {
      const result = parseCommandOptions('session', undefined)
      expect(result.args).toBe('')
    })
  })

  // ── その他のコマンド（/sc, /roll, /char など）─────────────────

  describe('その他コマンド', () => {
    it('/sc → options[0].value を返す', () => {
      const result = parseCommandOptions('sc', [opt('args', '0/1d3')])
      expect(result.args).toBe('0/1d3')
      expect(result.ccTargetUserId).toBeUndefined()
    })

    it('/roll → options[0].value を返す', () => {
      const result = parseCommandOptions('roll', [opt('args', '2d6+3')])
      expect(result.args).toBe('2d6+3')
    })

    it('/char → options[0].value を返す', () => {
      const result = parseCommandOptions('char', [opt('args', 'status')])
      expect(result.args).toBe('status')
    })

    it('options が undefined → args は空文字', () => {
      const result = parseCommandOptions('dicehelp', undefined)
      expect(result.args).toBe('')
    })
  })
})
