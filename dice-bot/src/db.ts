// ============================================================
// Cloudflare D1 アクセス層
// ============================================================

import type { CharacterRecord } from './charasheet.ts'
import type { ResultLevel } from './dice.ts'

// Cloudflare Workers環境のD1型
// 本番: tsconfig の types=["@cloudflare/workers-types"] で公式型が使われる
// テスト(Node.js): src/types/d1.d.ts のシム定義を使用
import type { D1Database } from './types/d1.d.ts'
export type { D1Database }

// ── 内部型 ────────────────────────────────────────────────────

interface CharacterRow {
  id: string
  user_id: string
  name: string
  hp: number
  mp: number
  san: number
  luck: number
  stats: string   // JSON
  skills: string  // JSON
  updated_at: string
}

export type SessionStatus = 'active' | 'completed'

export interface SessionRow {
  id: string
  guild_id: string
  name: string
  kp_user_id: string
  status: SessionStatus
  started_at: string
  ended_at: string | null
}

export interface DiceLogRow {
  id: number
  session_id: string
  user_id: string
  character_name: string
  skill_name: string
  target_value: number
  final_dice: number
  result_level: ResultLevel
  is_secret: boolean
  timestamp: string
}

export interface InsertDiceLogParams {
  session_id: string
  user_id: string
  character_name: string
  skill_name: string
  target_value: number
  final_dice: number
  result_level: ResultLevel
  is_secret: boolean
}

// ── ユーティリティ ────────────────────────────────────────────

function parseCharacterRow(row: CharacterRow): CharacterRecord {
  return {
    id:      row.id,
    user_id: row.user_id,
    name:    row.name,
    hp:      row.hp,
    mp:      row.mp,
    san:     row.san,
    luck:    row.luck,
    stats:   JSON.parse(row.stats),
    skills:  JSON.parse(row.skills),
  }
}

function generateId(): string {
  return crypto.randomUUID()
}

// ── キャラクター操作 ──────────────────────────────────────────

/**
 * DiscordユーザーのアクティブキャラクターをJOINして返す。
 * なければnull。
 */
export async function getActiveCharacter(
  db: D1Database,
  userId: string,
): Promise<CharacterRecord | null> {
  const row = await db
    .prepare(`
      SELECT c.*
      FROM Characters c
      INNER JOIN Active_Characters ac ON c.id = ac.character_id
      WHERE ac.user_id = ?
    `)
    .bind(userId)
    .first<CharacterRow>()

  return row ? parseCharacterRow(row) : null
}

/**
 * キャラクターをupsertする（保管所から取得→上書き保存）。
 */
export async function upsertCharacter(
  db: D1Database,
  char: CharacterRecord,
): Promise<void> {
  await db
    .prepare(`
      INSERT OR REPLACE INTO Characters
        (id, user_id, name, hp, mp, san, luck, stats, skills, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      char.id,
      char.user_id,
      char.name,
      char.hp,
      char.mp,
      char.san,
      char.luck,
      JSON.stringify(char.stats),
      JSON.stringify(char.skills),
    )
    .run()
}

/**
 * Discordユーザーのアクティブキャラクターをセットする。
 */
export async function setActiveCharacter(
  db: D1Database,
  userId: string,
  characterId: string,
): Promise<void> {
  await db
    .prepare(`
      INSERT OR REPLACE INTO Active_Characters (user_id, character_id)
      VALUES (?, ?)
    `)
    .bind(userId, characterId)
    .run()
}

/**
 * アクティブキャラクターのステータス（hp/mp/san/luck）を増減する。
 * 更新後の値を返す。アクティブキャラがない場合はエラーをthrow。
 */
export async function updateCharacterStat(
  db: D1Database,
  userId: string,
  stat: 'hp' | 'mp' | 'san' | 'luck',
  delta: number,
): Promise<number> {
  const char = await getActiveCharacter(db, userId)
  if (!char) throw new Error('アクティブキャラクターが設定されていません。`/char set` で登録してください。')

  // カラム名ホワイトリストでSQLインジェクション対策（⑤も合わせて対応）
  const STAT_COL = { hp: 'hp', mp: 'mp', san: 'san', luck: 'luck' } as const
  const col = STAT_COL[stat]

  await db
    .prepare(`UPDATE Characters SET ${col} = ${col} + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(delta, char.id)
    .run()

  return char[stat] + delta
}

// ── セッション操作 ────────────────────────────────────────────

/**
 * guildのactiveなセッションを返す。なければnull。
 */
export async function getActiveSession(
  db: D1Database,
  guildId: string,
): Promise<SessionRow | null> {
  return db
    .prepare(`SELECT * FROM Sessions WHERE guild_id = ? AND status = 'active' LIMIT 1`)
    .bind(guildId)
    .first<SessionRow>()
}

/**
 * セッションを開始してセッションIDを返す。
 */
export async function startSession(
  db: D1Database,
  guildId: string,
  name: string,
  kpUserId: string,
): Promise<string> {
  const id = generateId()
  await db
    .prepare(`
      INSERT INTO Sessions (id, guild_id, name, kp_user_id, status, started_at)
      VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `)
    .bind(id, guildId, name, kpUserId)
    .run()
  return id
}

/**
 * セッションを終了する（status=completed, ended_atをセット）。
 */
export async function endSession(
  db: D1Database,
  sessionId: string,
): Promise<void> {
  await db
    .prepare(`
      UPDATE Sessions
      SET status = 'completed', ended_at = ?
      WHERE id = ?
    `)
    .bind(new Date().toISOString(), sessionId)
    .run()
}

// ── ダイスログ操作 ────────────────────────────────────────────

/**
 * ダイスログを1件挿入する。
 */
export async function insertDiceLog(
  db: D1Database,
  params: InsertDiceLogParams,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO Dice_Logs
        (session_id, user_id, character_name, skill_name,
         target_value, final_dice, result_level, is_secret, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
    .bind(
      params.session_id,
      params.user_id,
      params.character_name,
      params.skill_name,
      params.target_value,
      params.final_dice,
      params.result_level,
      params.is_secret ? 1 : 0,
    )
    .run()
}

/**
 * セッションに紐づくダイスログを全件返す（is_secretをbooleanに変換）。
 */
export async function getDiceLogsForSession(
  db: D1Database,
  sessionId: string,
): Promise<DiceLogRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM Dice_Logs WHERE session_id = ? ORDER BY timestamp ASC`)
    .bind(sessionId)
    .all<Omit<DiceLogRow, 'is_secret'> & { is_secret: number }>()

  return results.map(r => ({ ...r, is_secret: r.is_secret === 1 }))
}
