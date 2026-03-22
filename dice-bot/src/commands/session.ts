// ============================================================
// /session コマンド - セッション管理
// ============================================================

import {
  getActiveSession, startSession, endSession,
  getDiceLogsForSession, getActiveCharacter,
} from '../db.ts'
import { generateReport } from '../report.ts'
import type { D1Database } from '../db.ts'
import type { CommandResult } from './shared.ts'

export interface SessionCommandResult extends CommandResult {
  file?: { name: string; content: string } // /session end 時のレポートファイル
}

export async function handleSession(
  db: D1Database,
  userId: string,
  rawArgs: string,
): Promise<SessionCommandResult> {
  const parts = rawArgs.trim().split(/\s+/)
  const subcommand = parts[0]?.toLowerCase()

  switch (subcommand) {
    case 'start': return handleSessionStart(db, userId, parts.slice(1).join(' '))
    case 'end':   return handleSessionEnd(db, userId)
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
  name: string,
): Promise<SessionCommandResult> {
  if (!name) {
    return { message: 'セッション名を指定してください。例: `/session start 呪われた村`', ephemeral: true }
  }

  const existing = await getActiveSession(db)
  if (existing) {
    return {
      message: `既にセッション「${existing.name}」が進行中です。先に \`/session end\` で終了してください。`,
      ephemeral: true,
    }
  }

  await startSession(db, name, kpUserId)

  return {
    message: `🎮 セッション「**${name}**」を開始しました！\nこれ以降のダイスロールはログに記録されます。`,
    ephemeral: false,
  }
}

// ── /session end ─────────────────────────────────────────────

async function handleSessionEnd(
  db: D1Database,
  userId: string,
): Promise<SessionCommandResult> {
  const session = await getActiveSession(db)
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

  const fileName = `${session.name.replace(/\s+/g, '_')}_report.md`

  return {
    message: `✅ セッション「**${session.name}**」を終了しました。レポートを添付します。`,
    ephemeral: false,
    file: { name: fileName, content: report },
  }
}
