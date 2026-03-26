// ============================================================
// Cloudflare Worker エントリーポイント
// Discord Interactions Endpoint（署名検証 + コマンドルーティング）
// ============================================================

import { handleCc } from './commands/cc.ts'
import { handleSc } from './commands/sc.ts'
import { handleRoll } from './commands/roll.ts'
import { handleChar } from './commands/char.ts'
import { handleSession } from './commands/session.ts'
import { insertDiceLog, getActiveSession, getActiveCharacter } from './db.ts'
import type { D1Database } from './db.ts'

export interface Env {
  DB: D1Database
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_BOT_TOKEN: string
}

const PING = 1
const APPLICATION_COMMAND = 2
const PONG = 1
const CHANNEL_MESSAGE_WITH_SOURCE = 4
const EPHEMERAL_FLAG = 64

// ── 署名検証 ─────────────────────────────────────────────────

async function verifySignature(
  request: Request,
  publicKey: string,
  body: string,
): Promise<boolean> {
  const signature = request.headers.get('x-signature-ed25519')
  const timestamp  = request.headers.get('x-signature-timestamp')
  if (!signature || !timestamp) return false

  const key = await crypto.subtle.importKey(
    'raw',
    hexToUint8Array(publicKey),
    { name: 'Ed25519', namedCurve: 'Ed25519' },
    false,
    ['verify'],
  )

  return crypto.subtle.verify(
    'Ed25519',
    key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + body),
  )
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

// ── レスポンスヘルパー ────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function messageResponse(content: string, ephemeral: boolean): Response {
  return jsonResponse({
    type: CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? EPHEMERAL_FLAG : 0,
    },
  })
}

// ── ダイスログの自動記録 ─────────────────────────────────────

async function tryRecordDiceLog(
  db: D1Database,
  guildId: string,
  userId: string,
  skillName: string,
  targetValue: number,
  finalDice: number,
  resultLevel: Parameters<typeof insertDiceLog>[1]['result_level'],
  isSecret: boolean,
): Promise<void> {
  try {
    const session = await getActiveSession(db, guildId)
    if (!session) return

    const char = await getActiveCharacter(db, userId)
    if (!char) return

    await insertDiceLog(db, {
      session_id:     session.id,
      user_id:        userId,
      character_name: char.name,
      skill_name:     skillName,
      target_value:   targetValue,
      final_dice:     finalDice,
      result_level:   resultLevel,
      is_secret:      isSecret,
    })
  } catch {
    // ログ記録失敗は無視（本体の返答を妨げない）
  }
}

// ── セッションレポートのフォローアップ送信 ───────────────────

async function sendFollowupFile(
  appId: string,
  interactionToken: string,
  file: { name: string; content: string },
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}`

  const blob = new Blob([file.content], { type: 'text/markdown' })
  const form = new FormData()
  form.append('file[0]', blob, file.name)
  form.append('payload_json', JSON.stringify({ content: '' }))

  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    console.error(`[report] followup failed: ${res.status} ${await res.text()}`)
  }
}

// ── コマンドルーター ──────────────────────────────────────────

async function routeCommand(
  env: Env,
  commandName: string,
  userId: string,
  guildId: string,
  args: string,
  interactionToken: string,
): Promise<Response> {
  switch (commandName) {
    case 'cc': {
      const result = await handleCc(env.DB, userId, args)
      if (result.diceLog) {
        await tryRecordDiceLog(
          env.DB, guildId, userId,
          result.diceLog.skillName,
          result.diceLog.targetValue,
          result.diceLog.finalDice,
          result.diceLog.resultLevel,
          result.diceLog.isSecret,
        )
      }
      return messageResponse(result.message, result.ephemeral)
    }
    case 'sc': {
      const result = await handleSc(env.DB, userId, args)
      if (result.diceLog) {
        await tryRecordDiceLog(
          env.DB, guildId, userId,
          result.diceLog.skillName,
          result.diceLog.targetValue,
          result.diceLog.finalDice,
          result.diceLog.resultLevel,
          result.diceLog.isSecret,
        )
      }
      return messageResponse(result.message, result.ephemeral)
    }
    case 'roll': {
      const result = await handleRoll(args)
      return messageResponse(result.message, result.ephemeral)
    }
    case 'char': {
      const result = await handleChar(env.DB, userId, args)
      return messageResponse(result.message, result.ephemeral)
    }
    case 'session': {
      // サブコマンド構造からargs文字列を再構築
      // Discord送信形式: options[0] = { name: "start"|"end", options?: [{name: "name", value: "..."}] }
      const sessionOpts = (interaction.data as Record<string, unknown>)?.options as Array<Record<string, unknown>> | undefined
      const subCmd      = sessionOpts?.[0]?.name as string ?? ''
      const subCmdOpts  = sessionOpts?.[0]?.options as Array<Record<string, unknown>> | undefined
      const sessionName = subCmdOpts?.[0]?.value as string ?? ''
      const sessionArgs = sessionName ? `${subCmd} ${sessionName}` : subCmd
      const result = await handleSession(env.DB, userId, guildId, sessionArgs)
      if (result.file) {
        await sendFollowupFile(env.DISCORD_APPLICATION_ID, interactionToken, result.file)
      }
      return messageResponse(result.message, result.ephemeral)
    }
    default:
      return messageResponse('未知のコマンドです。', true)
  }
}

// ── メインハンドラ ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.text()

    const valid = await verifySignature(request, env.DISCORD_PUBLIC_KEY, body)
    if (!valid) {
      return new Response('Unauthorized', { status: 401 })
    }

    let interaction: Record<string, unknown>
    try {
      interaction = JSON.parse(body)
    } catch {
      return new Response('Bad Request', { status: 400 })
    }

    if (interaction.type === PING) {
      return jsonResponse({ type: PONG })
    }

    if (interaction.type === APPLICATION_COMMAND) {
      const commandName      = (interaction.data as Record<string, unknown>)?.name as string
      const userId           = (interaction.member as Record<string, Record<string, string>> | undefined)?.user?.id
                               ?? (interaction.user as Record<string, string> | undefined)?.id
                               ?? ''
      if (!userId) {
        return new Response('Bad Request', { status: 400 })
      }
      const guildId          = (interaction.guild_id as string) ?? ''
      const args             = ((interaction.data as Record<string, unknown>)?.options as Array<Record<string, unknown>> | undefined)?.[0]?.value as string ?? ''
      const interactionToken = interaction.token as string

      return routeCommand(env, commandName, userId, guildId, args, interactionToken)
    }

    return new Response('Bad Request', { status: 400 })
  },
}
