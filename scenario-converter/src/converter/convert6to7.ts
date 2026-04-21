// ============================================================
// 6版→7版 変換ロジック
// ============================================================

import type {
  AbilityStats, DerivedStats, StatBlock, ConvertedBlock, ConversionResult, NarrativeReplacement
} from './types'
import { recalcDerived } from './rules'
import { convertSkills } from './skills'
import { detectStatBlocks } from './statblock'
import { escapeRe, normalizeFullWidthDigits } from './utils'

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
export function convertStatBlock(block: StatBlock): Omit<ConvertedBlock, 'convertedStartIndex' | 'convertedEndIndex'> {
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
  text = normalizeFullWidthDigits(text)
  const blocks    = detectStatBlocks(text)
  const warnings: string[] = []
  const converted: ConvertedBlock[] = []
  const narrativeReplacements: NarrativeReplacement[] = []

  // セグメント（非ブロック区間）に地の文変換を適用し、位置を追跡しながら結果を組み立てる
  let result = ''
  let origCursor = 0   // originalText 上の読み取り位置
  let convCursor = 0   // convertedText 上の書き込み位置

  const processNarrative = (origStart: number, origEnd: number) => {
    const { output, replacements } = applyNarrativeReplacementsTracked(text.slice(origStart, origEnd))
    for (const r of replacements) {
      narrativeReplacements.push({
        originalStart:  origStart + r.origStart,
        originalEnd:    origStart + r.origEnd,
        convertedStart: convCursor + r.convStart,
        convertedEnd:   convCursor + r.convEnd,
        from: r.from,
        to:   r.to,
      })
    }
    result += output
    convCursor += output.length
  }

  for (const block of blocks) {
    processNarrative(origCursor, block.startIndex)

    const cb = convertStatBlock(block)
    const convertedStartIndex = convCursor
    result += cb.convertedText
    convCursor += cb.convertedText.length
    converted.push({ ...cb, convertedStartIndex, convertedEndIndex: convCursor })
    origCursor = block.endIndex
  }

  processNarrative(origCursor, text.length)

  return {
    originalText:  text,
    convertedText: result,
    blocks:        converted,
    warnings,
    narrativeReplacements,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────────────────────────────────────

/** 6版固有の用語を7版表記に置換するマップ */
const NARRATIVE_TERM_MAP: Record<string, string> = {
  'アイデア': 'INT',
}

interface SegmentReplacement {
  origStart: number; origEnd: number
  convStart: number; convEnd: number
  from: string; to: string
}

function applyNarrativeReplacementsTracked(segment: string): { output: string; replacements: SegmentReplacement[] } {
  // 全マッチを収集してから位置順に処理
  const matches: Array<{ from: string; to: string; start: number; end: number }> = []
  for (const [from, to] of Object.entries(NARRATIVE_TERM_MAP)) {
    const re = new RegExp(escapeRe(from), 'g')
    let m
    while ((m = re.exec(segment)) !== null) {
      matches.push({ from, to, start: m.index, end: m.index + from.length })
    }
  }
  matches.sort((a, b) => a.start - b.start)

  const replacements: SegmentReplacement[] = []
  let output = ''
  let origPos = 0
  let convPos = 0

  for (const m of matches) {
    output  += segment.slice(origPos, m.start)
    convPos += m.start - origPos
    replacements.push({ origStart: m.start, origEnd: m.end, convStart: convPos, convEnd: convPos + m.to.length, from: m.from, to: m.to })
    output  += m.to
    convPos += m.to.length
    origPos  = m.end
  }
  output += segment.slice(origPos)

  return { output, replacements }
}

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
    const re = new RegExp(`(\\b${k}\\s*[：:／|｜│]?\\s*)${oldVal}\\b`, 'g')
    text = text.replace(re, `$1${newVal}`)
  }

  // 2. 派生値（HP/MP/SAN）を再計算値に置換
  const derivedMap: Record<string, number | undefined> = {
    HP: newDerived.HP, MP: newDerived.MP, SAN: newDerived.SAN,
  }
  for (const [k, newVal] of Object.entries(derivedMap)) {
    if (newVal === undefined) continue
    const re = new RegExp(`(\\b${k}\\s*[：:／|｜│]?\\s*)\\d+`, 'g')
    text = text.replace(re, `$1${newVal}`)
  }

  // 3. DB を置換（例: "DB:+1D4" → "DB:+1D4" または "-1D6" → "-2"）
  if (newDerived.db !== undefined) {
    text = text.replace(
      /\b(DB\s*[：:／|｜│]?\s*)[-+]?(?:\d+D\d+|\d+)/gi,
      `$1${newDerived.db}`,
    )
  }

  // 4. 技能名を置換（旧名→新名）
  // マージで除外された敗者技能をテキストから削除（先に処理）
  const winnerOriginalNames = new Set(newSkills.map(s => s.originalName))
  for (const oldSkill of oldSkills) {
    if (winnerOriginalNames.has(oldSkill.name)) continue
    const re = new RegExp(`[《〈]?${escapeRe(oldSkill.name)}[》〉]?\\s*[|｜│]?\\s*\\d{1,3}%?`, 'g')
    text = text.replace(re, '')
  }
  // 勝者の技能名を置換（《》〈〉括弧・%有無・パイプ区切りを保持）
  for (const newSkill of newSkills) {
    if (!newSkill.renamed) continue
    const re = new RegExp(`([《〈]?)${escapeRe(newSkill.originalName)}([》〉]?)(\\s*[|｜│]?\\s*\\d{1,3}%?)`, 'g')
    text = text.replace(re, `$1${newSkill.name}$2$3`)
  }

  return text
}
