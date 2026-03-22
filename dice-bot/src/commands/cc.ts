// ============================================================
// /cc コマンド - 技能・能力値ロール（第7版）
// ============================================================

import { rollD100, judgeResult, applyBonusPenalty } from '../dice.ts'
import { getActiveCharacter } from '../db.ts'
import { extractSecret, extractModifier, resultLabel, type CommandResult } from './shared.ts'
import type { D1Database } from '../db.ts'

const STAT_KEYS = ['STR','CON','DEX','APP','POW','SIZ','INT','EDU','MOV','HP','MP'] as const

export async function handleCc(
  db: D1Database,
  userId: string,
  rawArgs: string,
): Promise<CommandResult> {
  // secret抽出
  const { args: argsNoSecret, isSecret } = extractSecret(rawArgs)
  // modifier抽出
  const { args: skillName, modifier } = extractModifier(argsNoSecret)

  // キャラクター取得
  const char = await getActiveCharacter(db, userId)
  if (!char) {
    return {
      message: 'キャラクターが設定されていません。`/char set <URL>` で登録してください。',
      ephemeral: true,
    }
  }

  // 目標値を解決（技能 or 能力値）
  const upperKey = skillName.toUpperCase()
  let targetValue: number | undefined
  let resolvedName = skillName

  // 能力値チェック
  if (STAT_KEYS.includes(upperKey as typeof STAT_KEYS[number])) {
    const statKey = upperKey as keyof typeof char.stats
    targetValue = (char.stats as Record<string, number>)[statKey]
    resolvedName = upperKey
  } else {
    // 技能チェック（部分一致なし・完全一致）
    targetValue = char.skills[skillName]
  }

  if (targetValue === undefined) {
    return {
      message: `技能・能力値「${skillName}」が見つかりません。`,
      ephemeral: true,
    }
  }

  // ダイスロール
  const base = rollD100(true)
  const { final, extraRolls } = applyBonusPenalty(base, modifier)
  const level = judgeResult(final, targetValue)

  // メッセージ組み立て
  const lines: string[] = []
  lines.push(`🎲 **${resolvedName}** (目標値: ${targetValue})`)
  lines.push(`ベース出目：${base.total}（10の位: ${base.tens}, 1の位: ${base.ones}）`)

  if (modifier !== 0) {
    const label = modifier > 0 ? 'ボーナス' : 'ペナルティ'
    lines.push(`${label}出目（10の位）：${extraRolls.join(', ')}`)
    lines.push(`最終結果：**${final}** ＞ ${resultLabel(level)}`)
  } else {
    lines.push(`結果：**${final}** ＞ ${resultLabel(level)}`)
  }

  return { message: lines.join('\n'), ephemeral: isSecret }
}
