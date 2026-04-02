// ============================================================
// /sc コマンド - 正気度チェック（第6版 / 第7版）
// ============================================================

import { rollD100, judgeResult, judgeResult6, evalRollExpression } from '../dice.ts'
import { getActiveCharacter, getActiveSession, updateCharacterStat } from '../db.ts'
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
 * ダイス式または固定値を評価して数値を返す。不正な式はnullを返す。
 */
function evalSanValue(expr: string): number | null {
  // 固定値
  if (/^\d+$/.test(expr)) return parseInt(expr, 10)
  // ダイス式
  const r = evalRollExpression(expr)
  return r?.total ?? null
}

export async function handleSc(
  db: D1Database,
  userId: string,
  guildId: string,
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

  // アクティブセッションからシステムを取得
  const session = await getActiveSession(db, guildId)
  const system = session?.system ?? 'coc7'

  const currentSan = char.san
  const base = rollD100(true)

  let isSuccessRoll: boolean
  let level: ReturnType<typeof judgeResult>

  if (system === 'coc6') {
    level = judgeResult6(base.total, currentSan)
    isSuccessRoll = ['critical', 'special', 'success'].includes(level)
  } else {
    level = judgeResult(base.total, currentSan)
    isSuccessRoll = ['critical', 'extreme', 'hard', 'regular'].includes(level)
  }

  const lossExpr = isSuccessRoll ? parsed.success : parsed.failure
  const loss = evalSanValue(lossExpr)
  if (loss === null) {
    return {
      message: `SAN減少値「${lossExpr}」のダイス式が正しくありません。`,
      ephemeral: true,
    }
  }

  // SAN減算（SAN最小値は0）
  const actualLoss = Math.min(loss, currentSan)
  await updateCharacterStat(db, userId, 'san', -actualLoss)
  const newSan = currentSan - actualLoss

  const lines: string[] = []
  lines.push(`🧠 **SANチェック** (現在SAN: ${currentSan})`)
  lines.push(`出目：**${base.total}** ＞ ${resultLabel(level)}`)
  lines.push(`SAN減少：${lossExpr}${lossExpr !== String(actualLoss) ? ` → ${actualLoss}` : ''}`)
  lines.push(`SAN: ${currentSan} → **${newSan}**`)

  return { message: lines.join('\n'), ephemeral: isSecret, diceLog: {
    skillName: 'SANチェック',
    targetValue: currentSan,
    finalDice: base.total,
    resultLevel: level,
    isSecret,
  }}
}
