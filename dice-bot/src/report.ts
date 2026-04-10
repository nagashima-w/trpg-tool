// ============================================================
// セッションレポート生成（Markdown）
// ============================================================

import type { DiceLogRow } from './db'
import type { ResultLevel } from './dice'
import { isSuccess } from './commands/shared.ts'

export interface Participant {
  userId: string
  characterName: string
}

export interface ReportInput {
  sessionName: string
  kpUserId: string
  startedAt: string
  endedAt: string
  logs: DiceLogRow[]
  participants: Participant[]
}

interface PlayerStats {
  total: number
  successCount: number  // 成功回数合計（第6版・第7版共通）
  critical: number
  extreme: number       // 第7版
  hard: number          // 第7版
  regular: number       // 第7版
  special: number       // 第6版
  success: number       // 第6版 'success' レベル
  failure: number
  fumble: number
  diceSum: number
}

const RESULT_LABEL: Record<ResultLevel, string> = {
  // 第7版
  critical: '**クリティカル**',
  extreme:  '**イクストリーム成功**',
  hard:     '**ハード成功**',
  regular:  '**レギュラー成功**',
  failure:  '失敗',
  fumble:   '**ファンブル**',
  // 第6版
  special:  '**スペシャル成功**',
  success:  '成功',
}

function formatTimestamp(iso: string): string {
  // "2024-01-01T10:30:00Z" → "19:30"（JST=UTC+9）
  const d = new Date(iso)
  return d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false })
}

function calcAverage(sum: number, count: number): string {
  if (count === 0) return '-'
  const avg = sum / count
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
}

export function generateReport(input: ReportInput): string {
  const { sessionName, kpUserId, startedAt, endedAt, logs, participants } = input

  // プレイヤーごとにログを集計（シークレットも含める）
  const statsByUser = new Map<string, PlayerStats>()
  const logsByUser  = new Map<string, DiceLogRow[]>()

  for (const p of participants) {
    statsByUser.set(p.userId, {
      total: 0, successCount: 0, critical: 0, extreme: 0,
      hard: 0, regular: 0, special: 0, success: 0, failure: 0, fumble: 0, diceSum: 0,
    })
    logsByUser.set(p.userId, [])
  }

  for (const log of logs) {
    const stats = statsByUser.get(log.user_id)
    const userLogs = logsByUser.get(log.user_id)
    if (!stats || !userLogs) continue

    stats.total++
    stats.diceSum += log.final_dice
    if (isSuccess(log.result_level)) stats.successCount++
    stats[log.result_level]++
    userLogs.push(log)
  }

  const lines: string[] = []

  // ── ヘッダー ──
  lines.push(`# ${sessionName}`)
  lines.push('')
  lines.push(`- **開始**: ${new Date(startedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)
  lines.push(`- **終了**: ${new Date(endedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`)
  lines.push('')

  // ── 参加者 ──
  lines.push('## 参加者')
  lines.push('')
  lines.push(`- **KP**: @${kpUserId}`)
  for (const p of participants) {
    lines.push(`- **探索者**: @${p.userId}（${p.characterName}）`)
  }
  lines.push('')

  // ── サマリ ──
  lines.push('## ダイスログ')
  lines.push('')
  lines.push('### サマリ')
  lines.push('')
  lines.push('#### 判定成功率')
  lines.push('')

  for (const p of participants) {
    const stats = statsByUser.get(p.userId)!
    const rate = stats.total === 0
      ? '-'
      : `${Math.round((stats.successCount / stats.total) * 100)}%`

    lines.push(`**@${p.userId}（${p.characterName}）**：成功率 ${rate}`)
    if (stats.total === 0) {
      lines.push('- ダイスロールなし')
    } else {
      lines.push(
        `- 成功：${stats.successCount}回` +
        `（うちハード ${stats.hard}回、` +
        `イクストリーム ${stats.extreme}回、` +
        `クリティカル ${stats.critical}回）`
      )
      lines.push(
        `- 失敗：${stats.failure + stats.fumble}回` +
        `（うちファンブル ${stats.fumble}回）`
      )
    }
    lines.push('')
  }

  lines.push('#### 平均出目')
  lines.push('')
  for (const p of participants) {
    const stats = statsByUser.get(p.userId)!
    lines.push(`- **${p.characterName}**：${calcAverage(stats.diceSum, stats.total)}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // ── プレイヤー別詳細ログ ──
  lines.push('### プレイヤー別詳細ログ')
  lines.push('')

  for (const p of participants) {
    const userLogs = logsByUser.get(p.userId)!
    lines.push('<details>')
    lines.push(`<summary>${p.characterName} のダイスログを開く</summary>`)
    lines.push('')

    if (userLogs.length === 0) {
      lines.push('ダイスロールなし')
    } else {
      for (const log of userLogs) {
        const time = formatTimestamp(log.timestamp)
        const label = RESULT_LABEL[log.result_level]
        const safeSkillName = log.skill_name.replace(/`/g, '\\`')
        const extraStr = (log.extra_value !== null && log.extra_value !== 0) ? ` (-${log.extra_value})` : ''
        const secretMark = log.is_secret ? ' （シークレット）' : ''
        lines.push(
          `- \`${time}\`：${safeSkillName}(${log.target_value})` +
          ` ＞ 出目: ${log.final_dice} ＞ ${label}${extraStr}${secretMark}`
        )
      }
    }

    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  return lines.join('\n')
}
