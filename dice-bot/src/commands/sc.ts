// ============================================================
// /sc コマンド - 正気度チェック（第7版）
// ============================================================

import { rollD100, judgeResult, evalRollExpression } from '../dice.ts'
import { getActiveCharacter, updateCharacterStat } from '../db.ts'
import { extractSecret, resultLabel, type CommandResult } from './shared.ts'
import type { D1Database } from '../db.ts'

/**
 * "0/1d3" 形式をパース → { success: "0", failure: "1d3" }
 */
function parseSanArgs(args: string): { success: string; failure: string } | null {
  const m = args.match(/^(.+?)\/(.+)$/)
  if (!m) return null
  return { success: m[1].trim(), failure: m[2].trim() }
}

/**
 * ダイス式または固定値を評価して数値を返す
 */
function evalSanValue(expr: string): number {
  // 固定値
  if (/^\d+$/.test(expr)) return parseInt(expr, 10)
  // ダイス式
  const r = evalRollExpression(expr)
  return r?.total ?? 0
}

export async function handleSc(
  db: D1Database,
  userId: string,
  rawArgs: string,
): Promise<CommandResult> {
  const { args, isSecret } = extractSecret(rawArgs)

  const char = await getActiveCharacter(db, userId)
  if (!char) {
    return {
      message: 'キャラクターが設定されていません。`/char set <URL>` で登録してください。',
      ephemeral: true,
    }
  }

  const parsed = parseSanArgs(args)
  if (!parsed) {
    return {
      message: '書式が正しくありません。例: `/sc 0/1d3`、`/sc 1/1d6`',
      ephemeral: true,
    }
  }

  const currentSan = char.san
  const base = rollD100(true)
  const level = judgeResult(base.total, currentSan)
  const isSuccessRoll = ['critical', 'extreme', 'hard', 'regular'].includes(level)

  const lossExpr = isSuccessRoll ? parsed.success : parsed.failure
  const loss = evalSanValue(lossExpr)

  // SAN減算
  await updateCharacterStat(db, userId, 'san', -loss)
  const newSan = currentSan - loss

  const lines: string[] = []
  lines.push(`🧠 **SANチェック** (現在SAN: ${currentSan})`)
  lines.push(`出目：**${base.total}** ＞ ${resultLabel(level)}`)
  lines.push(`SAN減少：${lossExpr}${lossExpr !== String(loss) ? ` → ${loss}` : ''}`)
  lines.push(`SAN: ${currentSan} → **${newSan}**`)

  return { message: lines.join('\n'), ephemeral: isSecret }
}
