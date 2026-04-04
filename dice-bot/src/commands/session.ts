// ============================================================
// /session コマンド - セッション管理
// ============================================================

import {
  getActiveSession, startSession, endSession,
  getDiceLogsForSession, getSessionParticipants,
} from '../db.ts'
import type { SessionParticipantWithChar } from '../db.ts'
import { generateReport } from '../report.ts'
import type { D1Database } from '../db.ts'
import type { CommandResult } from './shared.ts'
import type { CharacterRecord } from '../charasheet.ts'

export interface SessionCommandResult extends CommandResult {
  file?: { name: string; content: string }
}

export async function handleSession(
  db: D1Database,
  userId: string,
  guildId: string,
  channelId: string,
  rawArgs: string,
): Promise<SessionCommandResult> {
  const parts = rawArgs.trim().split(/\s+/)
  const subcommand = parts[0]?.toLowerCase()

  switch (subcommand) {
    case 'start': return handleSessionStart(db, userId, guildId, channelId, parts.slice(1).join(' '))
    case 'end':   return handleSessionEnd(db, guildId, channelId)
    case 'pc':    return handleSessionPc(db, guildId, channelId, parts[1] ?? '')
    default:
      return {
        message: '使い方: `/session start <セッション名>` / `/session end` / `/session pc <param>`',
        ephemeral: true,
      }
  }
}

// ── /session start ────────────────────────────────────────────

async function handleSessionStart(
  db: D1Database,
  kpUserId: string,
  guildId: string,
  channelId: string,
  rawName: string,
): Promise<SessionCommandResult> {
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

  const existing = await getActiveSession(db, guildId, channelId)
  if (existing) {
    return {
      message: `既にセッション「${existing.name}」が進行中です。先に \`/session end\` で終了してください。`,
      ephemeral: true,
    }
  }

  await startSession(db, guildId, channelId, name, kpUserId, system)

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
  channelId: string,
): Promise<SessionCommandResult> {
  const session = await getActiveSession(db, guildId, channelId)
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

// ── /session pc ───────────────────────────────────────────────

// CoC7版で使用可能なパラメータ（大文字正規化後）
const COC7_PARAMS = new Set(['STR', 'CON', 'DEX', 'APP', 'POW', 'SIZ', 'INT', 'EDU', 'HP', 'MP', 'SAN', 'LUCK'])
// CoC6版のみで使用可能な追加パラメータ
const COC6_ONLY_PARAMS = new Set(['IDEA', 'KNOWLEDGE'])

function normalizeParam(raw: string): string {
  // 日本語エイリアス → 英語正規化
  const aliases: Record<string, string> = {
    '幸運': 'LUCK',
    'アイデア': 'IDEA',
    '知識': 'KNOWLEDGE',
    'list': 'LIST',
  }
  return aliases[raw] ?? raw.toUpperCase()
}

function getStatValue(char: CharacterRecord, param: string): number | null {
  switch (param) {
    case 'HP':        return char.hp
    case 'MP':        return char.mp
    case 'SAN':       return char.san
    case 'LUCK':      return char.luck
    case 'IDEA':      return char.stats.INT * 5
    case 'KNOWLEDGE': return char.stats.EDU * 5
    default: {
      const val = char.stats[param as keyof typeof char.stats]
      return val !== undefined ? val : null
    }
  }
}

async function handleSessionPc(
  db: D1Database,
  guildId: string,
  channelId: string,
  rawParam: string,
): Promise<SessionCommandResult> {
  if (!rawParam) {
    return {
      message: '使い方: `/session pc list` または `/session pc <能力値名>`\n例: `/session pc DEX` / `/session pc 幸運`',
      ephemeral: true,
    }
  }

  const session = await getActiveSession(db, guildId, channelId)
  if (!session) {
    return { message: '進行中のセッションがありません。', ephemeral: true }
  }

  const param = normalizeParam(rawParam)

  // システムに応じたパラメータ検証
  if (param !== 'LIST') {
    const isValidCoc7 = COC7_PARAMS.has(param)
    const isValidCoc6Only = COC6_ONLY_PARAMS.has(param)

    if (!isValidCoc7 && !isValidCoc6Only) {
      const validList = [...COC7_PARAMS, ...(session.system === 'coc6' ? COC6_ONLY_PARAMS : [])].join(' / ')
      return {
        message: `無効なパラメータです。使用可能: \`list\` / ${validList}`,
        ephemeral: true,
      }
    }

    if (isValidCoc6Only && session.system !== 'coc6') {
      return {
        message: `\`${rawParam}\` は第6版専用のパラメータです。このセッションは第7版です。`,
        ephemeral: true,
      }
    }
  }

  const participants = await getSessionParticipants(db, session.id)
  if (participants.length === 0) {
    return {
      message: `セッション「**${session.name}**」にはまだ参加者がいません。\`/char set\` でキャラクターを登録してください。`,
      ephemeral: true,
    }
  }

  if (param === 'LIST') {
    return formatList(session.name, participants)
  } else {
    return formatStatRanking(session.name, participants, param, rawParam)
  }
}

function formatList(
  sessionName: string,
  participants: SessionParticipantWithChar[],
): SessionCommandResult {
  const lines = [`📋 **セッション「${sessionName}」参加者一覧**\n`]
  for (const p of participants) {
    const c = p.character
    lines.push(`**${c.name}** — HP: ${c.hp} / MP: ${c.mp} / SAN: ${c.san} / 幸運: ${c.luck}`)
  }
  return { message: lines.join('\n'), ephemeral: false }
}

function formatStatRanking(
  sessionName: string,
  participants: SessionParticipantWithChar[],
  param: string,
  rawParam: string,
): SessionCommandResult {
  const withValues = participants.map(p => ({
    name: p.character.name,
    value: getStatValue(p.character, param),
  }))

  // 値が取得できないキャラは末尾に（通常は起こらないが念のため）
  withValues.sort((a, b) => {
    if (a.value === null && b.value === null) return 0
    if (a.value === null) return 1
    if (b.value === null) return -1
    return b.value - a.value
  })

  const label = rawParam.toUpperCase() === param ? param : `${rawParam}(${param})`
  const lines = [`📊 **セッション「${sessionName}」${label} 一覧**（高い順）\n`]
  for (const entry of withValues) {
    const valStr = entry.value !== null ? String(entry.value) : '―'
    lines.push(`**${entry.name}** — ${valStr}`)
  }
  return { message: lines.join('\n'), ephemeral: false }
}
