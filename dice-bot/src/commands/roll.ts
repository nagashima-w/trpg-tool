// ============================================================
// /roll コマンド - 汎用ダイスロール
// ============================================================

import { evalRollExpression } from '../dice.ts'
import { extractSecret, type CommandResult } from './shared.ts'

export async function handleRoll(rawArgs: string): Promise<CommandResult> {
  const { args, isSecret } = extractSecret(rawArgs)

  const result = evalRollExpression(args)
  if (!result) {
    return {
      message: '書式が正しくありません。例: `/roll 1d100`、`/roll 2d6+3`',
      ephemeral: true,
    }
  }

  const lines: string[] = []
  lines.push(`🎲 **${args}**`)
  if (result.rolls.length > 1) {
    lines.push(`内訳：[${result.rolls.join(', ')}]`)
  }
  lines.push(`合計：**${result.total}**`)

  return { message: lines.join('\n'), ephemeral: isSecret }
}
