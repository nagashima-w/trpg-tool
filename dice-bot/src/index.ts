// ============================================================
// Cloudflare Worker エントリーポイント
// Discord Interactions Endpoint（署名検証 + コマンドルーティング）
// ============================================================

import { handleCc } from './commands/cc'
import { handleSc } from './commands/sc'
import { handleRoll } from './commands/roll'
import { handleChar } from './commands/char'
import { handleSession } from './commands/session'
import { insertDiceLog, getActiveSession, getActiveCharacter } from './db'
import type { D1Database } from './db'

export interface Env {
  DB: D1Database
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  DISCORD_BOT_TOKEN: string
}

// Discord Interaction Types
const PING = 1
const APPLICATION_COMMAND = 2

// Discord Interaction Response Types
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
  env: Env,
  userId: string,
  skillName: string,
  targetValue: number,
  finalDice: number,
  resultLevel: string,
  isSecret: boolean,
): Promise<void> {
  try {
    const session = await getActiveSession(env.DB)
    if (!session) return

    const char = await getActiveCharacter(env.DB, userId)
    if (!char) return

    await insertDiceLog(env.DB, {
      session_id:     session.id,
      user_id:        userId,
      character_name: char.name,
      skill_name:     skillName,
      target_value:   targetValue,
      final_dice:     finalDice,
      result_level:   resultLevel as Parameters<typeof insertDiceLog>[1]['result_level'],
      is_secret:      isSecret,
    })
  } catch {
    // ログ記録失敗は無視（本体の返答を妨げない）
  }
}

// ── コマンドルーター ──────────────────────────────────────────

async function routeCommand(
  env: Env,
  commandName: string,
  userId: string,
  args: string,
): Promise<Response> {
  switch (commandName) {
    case 'cc': {
      const result = await handleCc(env.DB, userId, args)
      return messageResponse(result.message, result.ephemeral)
    }
    case 'sc': {
      const result = await handleSc(env.DB, userId, args)
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
      const result = await handleSession(env.DB, userId, args)
      if (result.file) {
        // レポートファイルをDiscord APIに別途送信（Webhookで添付）
        // Interactions EndpointではファイルをmultipartでPOSTする必要があるため
        // ここではメッセージのみ返し、ファイルはフォローアップで送信
        await sendFollowupFile(env, userId, result.file)
      }
      return messageResponse(result.message, result.ephemeral)
    }
    default:
      return messageResponse('未知のコマンドです。', true)
  }
}

// ── セッションレポートのフォローアップ送信 ───────────────────

async function sendFollowupFile(
  env: Env,
  _userId: string,
  file: { name: string; content: string },
): Promise<void> {
  // Discord Webhook経由でファイル添付（フォローアップメッセージ）
  // 実装: interactions/tokens を使ったフォローアップAPI
  // ここでは webhook_token は interaction token を別途持ち回す設計が必要だが、
  // Workers の context 上では interaction token を保持してフォローアップに使う
  // (現状はログに記録するのみ - 本番ではinteraction tokenを渡す設計にする)
  console.log(`[report] File ready: ${file.name} (${file.content.length} chars)`)
}

// ── メインハンドラ ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.text()

    // 署名検証
    const valid = await verifySignature(request, env.DISCORD_PUBLIC_KEY, body)
    if (!valid) {
      return new Response('Unauthorized', { status: 401 })
    }

    const interaction = JSON.parse(body)

    // PING（Discord からの疎通確認）
    if (interaction.type === PING) {
      return jsonResponse({ type: PONG })
    }

    // スラッシュコマンド
    if (interaction.type === APPLICATION_COMMAND) {
      const commandName = interaction.data.name as string
      const userId      = interaction.member?.user?.id ?? interaction.user?.id ?? ''
      const args        = (interaction.data.options?.[0]?.value as string | undefined) ?? ''

      return routeCommand(env, commandName, userId, args)
    }

    return new Response('Bad Request', { status: 400 })
  },
}
