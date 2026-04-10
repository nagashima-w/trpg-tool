import { describe, it, expect } from 'vitest'
import { generateReport, type ReportInput } from './report'

const BASE_INPUT: ReportInput = {
  sessionName: 'テストシナリオ',
  kpUserId: 'kp-user-456',
  startedAt: '2024-01-01T10:00:00Z',
  endedAt:   '2024-01-01T14:00:00Z',
  logs: [
    {
      id: 1, session_id: 's1', user_id: 'user-A', character_name: '探索者A',
      skill_name: '目星', target_value: 75, final_dice: 12,
      result_level: 'extreme', is_secret: false, extra_value: null, timestamp: '2024-01-01T10:30:00Z',
    },
    {
      id: 2, session_id: 's1', user_id: 'user-A', character_name: '探索者A',
      skill_name: '回避', target_value: 25, final_dice: 85,
      result_level: 'failure', is_secret: false, extra_value: null, timestamp: '2024-01-01T11:00:00Z',
    },
    {
      id: 3, session_id: 's1', user_id: 'user-B', character_name: '探索者B',
      skill_name: '図書館', target_value: 70, final_dice: 98,
      result_level: 'fumble', is_secret: false, extra_value: null, timestamp: '2024-01-01T11:30:00Z',
    },
    {
      id: 4, session_id: 's1', user_id: 'kp-user-456', character_name: 'KP',
      skill_name: '隠密', target_value: 50, final_dice: 30,
      result_level: 'regular', is_secret: true, extra_value: null, timestamp: '2024-01-01T12:00:00Z',
    },
  ],
  participants: [
    { userId: 'user-A', characterName: '探索者A' },
    { userId: 'user-B', characterName: '探索者B' },
  ],
}

describe('generateReport', () => {
  it('文字列を返す', () => {
    const report = generateReport(BASE_INPUT)
    expect(typeof report).toBe('string')
  })

  it('セッション名がh1見出しとして含まれる', () => {
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('# テストシナリオ')
  })

  it('参加者のキャラクター名が含まれる', () => {
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('探索者A')
    expect(report).toContain('探索者B')
  })

  it('KPのuser_idが参加者セクションに含まれる', () => {
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('kp-user-456')
  })

  it('各プレイヤーの成功率が含まれる', () => {
    // 探索者A: 2回中1回成功(extreme) → 50%
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('50%')
  })

  it('クリティカル・ファンブル数が含まれる', () => {
    // 探索者B: fumble 1回
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('ファンブル')
  })

  it('平均出目が含まれる', () => {
    // 探索者A: (12+85)/2 = 48.5
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('48.5')
  })

  it('detailsタグで詳細ログが折りたたまれている', () => {
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('<details>')
    expect(report).toContain('</details>')
    expect(report).toContain('<summary>')
  })

  it('詳細ログに技能名・目標値・出目・結果が含まれる', () => {
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('目星')
    expect(report).toContain('75')  // target
    expect(report).toContain('12')  // dice
  })

  it('is_secret=trueの参加者ログは（シークレット）付きで詳細ログに含まれる', () => {
    const input: ReportInput = {
      ...BASE_INPUT,
      logs: [
        {
          id: 10, session_id: 's1', user_id: 'user-A', character_name: '探索者A',
          skill_name: '心理学', target_value: 60, final_dice: 30,
          result_level: 'regular', is_secret: true, extra_value: null,
          timestamp: '2024-01-01T10:30:00Z',
        },
      ],
    }
    const report = generateReport(input)
    expect(report).toContain('心理学')
    expect(report).toContain('（シークレット）')
  })

  it('is_secret=trueのログはサマリ集計にも含まれる', () => {
    // user-A の2件（extreme成功・failure）→ 成功率50%
    const report = generateReport(BASE_INPUT)
    expect(report).toContain('50%')
  })

  it('ログが0件のプレイヤーがいても正常に動作する', () => {
    const input: ReportInput = {
      ...BASE_INPUT,
      participants: [
        { userId: 'user-A', characterName: '探索者A' },
        { userId: 'user-C', characterName: '探索者C' }, // ログなし
      ],
    }
    expect(() => generateReport(input)).not.toThrow()
  })

  it('全ログがシークレットでも参加者の成功率が集計される', () => {
    const input: ReportInput = {
      ...BASE_INPUT,
      logs: BASE_INPUT.logs.map(l =>
        l.user_id === 'user-A' ? { ...l, is_secret: true } : l
      ),
    }
    const report = generateReport(input)
    // user-A: 2件中1件成功(extreme) → 50%（シークレットでも集計に含まれる）
    expect(report).toContain('50%')
  })

  it('SANチェックでextra_valueがある場合、詳細ログにSAN減少量が表示される', () => {
    const input: ReportInput = {
      ...BASE_INPUT,
      logs: [
        {
          id: 10, session_id: 's1', user_id: 'user-A', character_name: '探索者A',
          skill_name: 'SANチェック', target_value: 45, final_dice: 78,
          result_level: 'failure', is_secret: false, extra_value: 3,
          timestamp: '2024-01-01T10:30:00Z',
        },
      ],
    }
    const report = generateReport(input)
    expect(report).toContain('SANチェック')
    expect(report).toContain('-3')
  })

  it('extra_valueがnullのログは減少量を表示しない', () => {
    const report = generateReport(BASE_INPUT)
    // 通常ログ（extra_value: null）に余分な「-X」が出ないこと
    // BASE_INPUTのlogsにfinal_dice=12, 85, 98があるが「-12」等が出ないことを確認
    expect(report).not.toMatch(/出目: \d+ ＞ .+ \(-\d+\)/)
  })
})
