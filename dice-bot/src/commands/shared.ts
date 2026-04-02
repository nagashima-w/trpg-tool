// ============================================================
// コマンドハンドラ共通型・ユーティリティ
// ============================================================

import type { ResultLevel } from '../dice.ts'

/** ダイスログとして記録すべき情報（/cc・/sc のみ付与） */
export interface DiceLogDetail {
  skillName: string
  targetValue: number
  finalDice: number
  resultLevel: ResultLevel
  isSecret: boolean
}

export interface CommandResult {
  message: string
  ephemeral: boolean
  diceLog?: DiceLogDetail  // セッション中にDBへ記録する情報
}

/** args文字列から "secret" キーワードを検出・除去して返す */
export function extractSecret(args: string): { args: string; isSecret: boolean } {
  const isSecret = /\bsecret\b/i.test(args)
  return {
    args: args.replace(/\bsecret\b/gi, '').trim(),
    isSecret,
  }
}

/** args文字列からボーナス/ペナルティ修正値を抽出する（例: "+1" → 1, "-2" → -2） */
export function extractModifier(args: string): { args: string; modifier: number } {
  const m = args.match(/([+-]\d+)\s*$/)
  if (!m) return { args: args.trim(), modifier: 0 }
  const modifier = parseInt(m[1], 10)
  return {
    args: args.slice(0, args.lastIndexOf(m[1])).trim(),
    modifier,
  }
}

const RESULT_LABEL: Record<ResultLevel, string> = {
  // 第7版
  critical: 'クリティカル！',
  extreme:  'イクストリーム成功！',
  hard:     'ハード成功！',
  regular:  'レギュラー成功',
  failure:  '失敗',
  fumble:   'ファンブル…',
  // 第6版
  special:  'スペシャル成功！',
  success:  '成功',
}

export function resultLabel(level: ResultLevel): string {
  return RESULT_LABEL[level]
}
