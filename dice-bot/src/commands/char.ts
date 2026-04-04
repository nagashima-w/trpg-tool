// ============================================================
// /char コマンド - キャラクター管理
// ============================================================

import { parseCharasheetUrl, fetchCharasheet, mapToCharacter } from '../charasheet.ts'
import {
  getActiveCharacter, upsertCharacter, setActiveCharacter, updateCharacterStat,
  getActiveSession, upsertSessionParticipant,
} from '../db.ts'
import type { D1Database } from '../db.ts'
import type { CommandResult } from './shared.ts'

export async function handleChar(
  db: D1Database,
  userId: string,
  guildId: string,
  channelId: string,
  rawArgs: string,
): Promise<CommandResult> {
  const parts = rawArgs.trim().split(/\s+/)
  const subcommand = parts[0]?.toLowerCase()

  switch (subcommand) {
    case 'set':    return handleCharSet(db, userId, guildId, channelId, parts[1] ?? '')
    case 'status': return handleCharStatus(db, userId)
    case 'update': return handleCharUpdate(db, userId, guildId, channelId, parts[1], parts[2])
    default:
      return {
        message: '使い方: `/char set <URL>` / `/char status` / `/char update <対象> <増減値>`',
        ephemeral: true,
      }
  }
}

// ── /char set ────────────────────────────────────────────────

async function handleCharSet(
  db: D1Database,
  userId: string,
  guildId: string,
  channelId: string,
  url: string,
): Promise<CommandResult> {
  const session = await getActiveSession(db, guildId, channelId)
  if (!session) {
    return { message: '進行中のセッションがありません。`/session start` でセッションを開始してから登録してください。', ephemeral: true }
  }

  if (!url) {
    return { message: 'URLを指定してください。例: `/char set https://charasheet.vampire-blood.net/4634372`', ephemeral: true }
  }

  const parsed = parseCharasheetUrl(url)
  if (!parsed) {
    return { message: '無効なURLです。キャラクター保管所のURLを指定してください。', ephemeral: true }
  }

  let data
  try {
    data = await fetchCharasheet(parsed.id)
  } catch (e) {
    return { message: `キャラクターデータの取得に失敗しました: ${(e as Error).message}`, ephemeral: true }
  }

  const char = mapToCharacter(data, userId)
  if (!char) {
    return {
      message: 'このシートはクトゥルフ神話TRPG（第6版・第7版）のキャラクターではありません。',
      ephemeral: true,
    }
  }

  await upsertCharacter(db, char)
  await setActiveCharacter(db, userId, char.id)
  await upsertSessionParticipant(db, session.id, userId, char.id)

  return {
    message: `✅ **${char.name}** を登録しました！\nHP: ${char.hp} / MP: ${char.mp} / SAN: ${char.san} / 幸運: ${char.luck}`,
    ephemeral: true,
  }
}

// ── /char status ─────────────────────────────────────────────

async function handleCharStatus(
  db: D1Database,
  userId: string,
): Promise<CommandResult> {
  const char = await getActiveCharacter(db, userId)
  if (!char) {
    return { message: 'キャラクターが設定されていません。`/char set <URL>` で登録してください。', ephemeral: true }
  }

  const lines = [
    `👤 **${char.name}**`,
    `HP: ${char.hp} | MP: ${char.mp} | SAN: ${char.san} | 幸運: ${char.luck}`,
  ]

  return { message: lines.join('\n'), ephemeral: false }
}

// ── /char update ─────────────────────────────────────────────

async function handleCharUpdate(
  db: D1Database,
  userId: string,
  guildId: string,
  channelId: string,
  target: string | undefined,
  deltaStr: string | undefined,
): Promise<CommandResult> {
  const session = await getActiveSession(db, guildId, channelId)
  if (!session) {
    return { message: '進行中のセッションがありません。セッション中のみ更新できます。', ephemeral: true }
  }

  const validTargets = ['hp', 'mp', 'san', 'luck'] as const
  const targetLower = target?.toLowerCase() as typeof validTargets[number] | undefined

  if (!targetLower || !validTargets.includes(targetLower)) {
    return {
      message: `対象は ${validTargets.join(' / ')} のいずれかを指定してください。`,
      ephemeral: true,
    }
  }

  const delta = deltaStr ? parseInt(deltaStr, 10) : NaN
  if (isNaN(delta)) {
    return { message: '増減値は数値で指定してください。例: `/char update HP -2`', ephemeral: true }
  }
  if (Math.abs(delta) > 9999) {
    return { message: '増減値は±9999以内で指定してください。', ephemeral: true }
  }

  let newVal: number
  try {
    newVal = await updateCharacterStat(db, userId, targetLower, delta)
  } catch (e) {
    return { message: (e as Error).message, ephemeral: true }
  }

  const sign = delta >= 0 ? `+${delta}` : String(delta)

  return {
    message: `✅ ${targetLower.toUpperCase()} を ${sign} しました。（現在: ${newVal}）`,
    ephemeral: false,
  }
}
