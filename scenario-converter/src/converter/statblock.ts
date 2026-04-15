// ============================================================
// statブロック検出
// ============================================================

import type { StatBlock, AbilityStats, DerivedStats, SkillEntry } from './types'

const ABILITY_KEYS = ['STR', 'CON', 'DEX', 'APP', 'POW', 'SIZ', 'INT', 'EDU', 'MOV'] as const
const DERIVED_KEYS = ['HP', 'MP', 'SAN'] as const
type AbilityKey = typeof ABILITY_KEYS[number]
type DerivedKey = typeof DERIVED_KEYS[number]

/** 能力値キーワード + 区切り + 数値 or ダッシュ にマッチするパターン */
const STAT_RE =
  /\b(STR|CON|DEX|APP|POW|SIZ|INT|EDU|MOV|HP|MP|SAN)\s*[：:／]?\s*(\d+|-)/g

/** 技能行: "技能名 XX%" or "技能名　XX%" */
const SKILL_RE =
  /([^\s　\n\d\-%（）【】「」『』・、。]{2,}(?:（[^）\n]+）)?)\s*(\d{1,3})%/g

/** stat間にこのパターンがあれば別ブロック扱い（1行以上の空行） */
const BLOCK_SEPARATOR_RE = /\n\s*\n/

/** statブロック末尾から何文字先まで技能行を探すか */
const SKILL_SEARCH_RANGE = 300

// ──────────────────────────────────────────────────────────────────────────────

interface RawMatch {
  key: string
  value: number | undefined  // undefined = ダッシュ
  index: number
  end: number
}

function findAllStats(text: string): RawMatch[] {
  const re = new RegExp(STAT_RE.source, 'g')
  const results: RawMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[2]
    results.push({
      key:   m[1],
      value: raw === '-' ? undefined : parseInt(raw, 10),
      index: m.index,
      end:   m.index + m[0].length,
    })
  }
  return results
}

function groupIntoBlocks(matches: RawMatch[], text: string): RawMatch[][] {
  if (matches.length === 0) return []
  const groups: RawMatch[][] = []
  let current = [matches[0]]
  for (let i = 1; i < matches.length; i++) {
    const between = text.slice(current[current.length - 1].end, matches[i].index)
    // 空行（\n\n）があれば別ブロック
    if (BLOCK_SEPARATOR_RE.test(between)) {
      groups.push(current)
      current = [matches[i]]
    } else {
      current.push(matches[i])
    }
  }
  groups.push(current)
  return groups
}

function extractSkillsFromText(text: string): SkillEntry[] {
  const re = new RegExp(SKILL_RE.source, 'g')
  const skills: SkillEntry[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim().replace(/^《|》$/g, '')
    // 能力値キーワードと誤検出しないよう除外
    if ([...ABILITY_KEYS, ...DERIVED_KEYS].includes(name as AbilityKey)) continue
    skills.push({
      name,
      originalName: name,
      value: parseInt(m[2], 10),
      renamed: false,
    })
  }
  return skills
}

// ──────────────────────────────────────────────────────────────────────────────

export function detectStatBlocks(text: string): StatBlock[] {
  const allMatches = findAllStats(text)
  const groups = groupIntoBlocks(allMatches, text)

  return groups
    .filter(group => {
      const abilityCount = group.filter(m =>
        ABILITY_KEYS.includes(m.key as AbilityKey)
      ).length
      return abilityCount >= 3
    })
    .map(group => {
      const startIndex = group[0].index
      const coreEnd    = group[group.length - 1].end

      // 技能行をブロック末尾から検索。空行が出たらそこで打ち切る
      const rawSearchEnd = Math.min(text.length, coreEnd + SKILL_SEARCH_RANGE)
      const afterCore    = text.slice(coreEnd, rawSearchEnd)
      const blankMatch   = afterCore.match(/\n\s*\n/)
      const searchEnd    = blankMatch
        ? coreEnd + (blankMatch.index ?? afterCore.length)
        : rawSearchEnd
      const blockText    = text.slice(startIndex, searchEnd)
      const skills       = extractSkillsFromText(blockText)

      // 技能行が存在すれば endIndex を延ばす（なければcoreEnd）
      const endIndex = skills.length > 0 ? searchEnd : coreEnd

      const abilities: AbilityStats = {}
      const derived:   DerivedStats  = {}

      for (const m of group) {
        if (m.value === undefined) continue
        if (ABILITY_KEYS.includes(m.key as AbilityKey)) {
          abilities[m.key as AbilityKey] = m.value
        } else if (DERIVED_KEYS.includes(m.key as DerivedKey)) {
          (derived as Record<string, number>)[m.key] = m.value
        }
      }

      return {
        startIndex,
        endIndex,
        originalText: text.slice(startIndex, endIndex),
        abilities,
        derived,
        skills,
        edition: detectEdition(abilities),
      } satisfies StatBlock
    })
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * 能力値の規模から版を推定する（警告用）。
 * STR/CON/DEX/POW/SIZ のうち3つ以上が揃っていれば判定可能。
 */
export function detectEdition(
  abilities: AbilityStats
): 'coc6' | 'coc7' | 'unknown' {
  const coreKeys: AbilityKey[] = ['STR', 'CON', 'DEX', 'POW', 'SIZ']
  const values = coreKeys
    .map(k => abilities[k])
    .filter((v): v is number => v !== undefined)

  if (values.length < 3) return 'unknown'

  const avg = values.reduce((a, b) => a + b, 0) / values.length
  if (avg <= 30) return 'coc6'
  if (avg >= 40) return 'coc7'
  return 'unknown'
}
