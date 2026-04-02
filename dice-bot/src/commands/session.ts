// ============================================================
// /session コマンド - セッション管理
// ============================================================

import {
  getActiveSession, startSession, endSession,
  getDiceLogsForSession,
} from '../db.ts'
import { generateReport } from '../report.ts'
import type { D1Database } from '../db.ts'
import type { CommandResult } from './shared.ts'

export interface SessionCommandResult extends CommandResult {
  file?: { name: string; content: string }
}

export async function handleSession(
  db: D1Database,
  userId: string,
  guildId: string,
  rawArgs: string,
): Promise<SessionCommandResult> {
  const parts = rawArgs.trim().split(/\s+/)
  const subcommand = parts[0]?.toLowerCase()

  switch (subcommand) {
    case 'start': return handleSessionStart(db, userId, guildId, parts.slice(1).join(' '))
    case 'end':   return handleSessionEnd(db, guildId)
    default:
      return {
        message: '使い方: `/session start <セッション名>` / `/session end`',
        ephemeral: true,
      }
  }
}

// ── /session start ────────────────────────────────────────────

async function handleSessionStart(
  db: D1Database,
  kpUserId: string,
  guildId: string,
  rawName: string,
): Promise<SessionCommandResult> {
  if (!rawName) {
    return { message: 'セッション名を指定してください。例: `/session start 呪われた村`', ephemeral: true }
  }

  // 末尾に "coc6" または "coc7" があればシステムとして解釈
  const tokens = rawName.trim().split(/\s+/)
  let system: 'coc7' | 'coc6' = 'coc7'
  let name = rawName.trim()
  const lastToken = tokens[tokens.length - 1]?.toLowerCase()
  if (lastToken === 'coc6' || lastToken === 'coc7') {
    system = lastToken as 'coc7' | 'coc6'
    name = tokens.slice(0, -1).join(' ')
  }

  if (!name) {
    return { message: 'セッション名を指定してください。例: `/session start 呪われた村`', ephemeral: true }
  }

  const existing = await getActiveSession(db, guildId)
  if (existing) {
    return {
      message: `既にセッション「${existing.name}」が進行中です。先に \`/session end\` で終了してください。`,
      ephemeral: true,
    }
  }

  await startSession(db, guildId, name, kpUserId, system)

  const systemLabel = system === 'coc6'
    ? 'クトゥルフ神話TRPG（第6版）'
    : '新クトゥルフ神話TRPG（第7版）'

  return {
    message: `🎮 セッション「**${name}**」を開始しました！（システム: ${systemLabel}）\nこれ以降のダイスロールはログに記録されます。`,
    ephemeral: false,
  }
}

// ── /session end ─────────────────────────────────────────────

async function handleSessionEnd(
  db: D1Database,
  guildId: string,
): Promise<SessionCommandResult> {
  const session = await getActiveSession(db, guildId)
  if (!session) {
    return { message: '進行中のセッションがありません。', ephemeral: true }
  }

  await endSession(db, session.id)

  const logs = await getDiceLogsForSession(db, session.id)

  // 参加者を集計（シークレット除外・KP除く）
  const participantMap = new Map<string, string>()
  for (const log of logs) {
    if (!log.is_secret && log.user_id !== session.kp_user_id) {
      participantMap.set(log.user_id, log.character_name)
    }
  }
  const participants = Array.from(participantMap.entries()).map(
    ([userId, characterName]) => ({ userId, characterName })
  )

  const report = generateReport({
    sessionName: session.name,
    kpUserId:    session.kp_user_id,
    startedAt:   session.started_at,
    endedAt:     new Date().toISOString(),
    logs,
    participants,
  })

  const safeName = session.name
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'session'
  const fileName = `${safeName}_report.md`

  return {
    message: `✅ セッション「**${session.name}**」を終了しました。レポートを添付します。`,
    ephemeral: false,
    file: { name: fileName, content: report },
  }
}
