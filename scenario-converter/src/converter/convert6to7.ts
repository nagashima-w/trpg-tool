// ============================================================
// 6版→7版 変換ロジック
// ============================================================

import type {
  AbilityStats, DerivedStats, StatBlock, ConvertedBlock, ConversionResult
} from './types'
import { recalcDerived } from './rules'
import { convertSkills } from './skills'
import { detectStatBlocks } from './statblock'
import { escapeRe } from './utils'

/** ×5しない能力値キー */
const NO_MULTIPLY: Array<keyof AbilityStats> = ['MOV']

// ──────────────────────────────────────────────────────────────────────────────
// 公開API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 能力値を×5に変換する。MOVはそのまま維持。
 */
export function convertAbilities(abilities: AbilityStats): AbilityStats {
  const result: AbilityStats = {}
  for (const [k, v] of Object.entries(abilities) as [keyof AbilityStats, number][]) {
    result[k] = NO_MULTIPLY.includes(k) ? v : v * 5
  }
  return result
}

/**
 * ×5後の能力値から派生値を再計算する。
 */
export function calcDerivedStats(abilities: AbilityStats): DerivedStats {
  return recalcDerived(abilities)
}

/**
 * statブロック1件を変換する。
 */
export function convertStatBlock(block: StatBlock): ConvertedBlock {
  const notes: string[] = []

  const convertedAbilities = convertAbilities(block.abilities)
  const convertedDerived   = recalcDerived(convertedAbilities)
  const convertedSkills    = convertSkills(block.skills)

  const convertedText = buildConvertedText(
    block.originalText,
    block.abilities,
    convertedAbilities,
    convertedDerived,
    block.skills,
    convertedSkills,
  )

  return {
    original: block,
    abilities: convertedAbilities,
    derived:   convertedDerived,
    skills:    convertedSkills,
    convertedText,
    notes,
  }
}

/**
 * テキスト全体を変換する。
 */
export function convertText(text: string): ConversionResult {
  const blocks    = detectStatBlocks(text)
  const warnings: string[] = []
  const converted: ConvertedBlock[] = []

  if (blocks.length === 0) {
    return { originalText: text, convertedText: text, blocks: [], warnings }
  }

  // テキストを前から順番に組み立て
  let result = ''
  let cursor = 0

  for (const block of blocks) {
    // ブロック前の変更なしテキスト
    result += text.slice(cursor, block.startIndex)

    const cb = convertStatBlock(block)
    converted.push(cb)
    result += cb.convertedText
    cursor = block.endIndex
  }

  // 最後のブロック以降
  result += text.slice(cursor)

  return {
    originalText:  text,
    convertedText: result,
    blocks:        converted,
    warnings,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ブロックテキスト内の能力値・技能名を置換した新しいテキストを生成する。
 */
function buildConvertedText(
  original: string,
  oldAbilities: AbilityStats,
  newAbilities: AbilityStats,
  newDerived: DerivedStats,
  oldSkills: Array<{ name: string; value: number }>,
  newSkills: Array<{ name: string; originalName: string; value: number }>,
): string {
  let text = original

  // 1. 能力値の数値を×5に置換（"STR 14" → "STR 70"）
  for (const [k, oldVal] of Object.entries(oldAbilities) as [keyof AbilityStats, number][]) {
    const newVal = newAbilities[k]
    if (newVal === undefined) continue
    // "STAT数値" / "STAT:数値" / "STAT：数値" / "STAT|数値" 等にマッチして値部分だけ置換
    const re = new RegExp(`(\\b${k}\\s*[：:／|｜]?\\s*)${oldVal}\\b`, 'g')
    text = text.replace(re, `$1${newVal}`)
  }

  // 2. 派生値（HP/MP/SAN）を再計算値に置換
  const derivedMap: Record<string, number | undefined> = {
    HP: newDerived.HP, MP: newDerived.MP, SAN: newDerived.SAN,
  }
  for (const [k, newVal] of Object.entries(derivedMap)) {
    if (newVal === undefined) continue
    const re = new RegExp(`(\\b${k}\\s*[：:／|｜]?\\s*)\\d+`, 'g')
    text = text.replace(re, `$1${newVal}`)
  }

  // 3. DB を置換（例: "DB:+1D4" → "DB:+1D4" または "-1D6" → "-2"）
  if (newDerived.db !== undefined) {
    text = text.replace(
      /\b(DB\s*[：:／|｜]?\s*)[-+]?(?:\d+D\d+|\d+)/gi,
      `$1${newDerived.db}`,
    )
  }

  // 4. 技能名を置換（旧名→新名）
  // マージで除外された敗者技能をテキストから削除（先に処理）
  const winnerOriginalNames = new Set(newSkills.map(s => s.originalName))
  for (const oldSkill of oldSkills) {
    if (winnerOriginalNames.has(oldSkill.name)) continue
    const re = new RegExp(`[《〈]?${escapeRe(oldSkill.name)}[》〉]?[|｜]?\\s*\\d{1,3}%?`, 'g')
    text = text.replace(re, '')
  }
  // 勝者の技能名を置換（《》〈〉括弧・%有無・パイプ区切りを保持）
  for (const newSkill of newSkills) {
    if (!newSkill.renamed) continue
    const re = new RegExp(`([《〈]?)${escapeRe(newSkill.originalName)}([》〉]?)([|｜]?\\s*\\d{1,3}%?)`, 'g')
    text = text.replace(re, `$1${newSkill.name}$2$3`)
  }

  return text
}
