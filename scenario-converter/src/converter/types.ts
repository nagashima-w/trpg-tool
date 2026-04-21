// ============================================================
// 型定義
// ============================================================

export type AbilityKey = 'STR' | 'CON' | 'DEX' | 'APP' | 'POW' | 'SIZ' | 'INT' | 'EDU' | 'MOV'
export type DerivedKey = 'HP' | 'MP' | 'SAN'

export type AbilityStats = Partial<Record<AbilityKey, number>>
export type DerivedStats = Partial<Record<DerivedKey, number>> & {
  db?: string
  build?: number
}

export interface SkillEntry {
  name: string
  originalName: string
  value: number
  renamed: boolean
}

/** テキスト中から検出したstatブロック */
export interface StatBlock {
  startIndex: number
  endIndex: number
  originalText: string
  abilities: AbilityStats
  derived: DerivedStats
  skills: SkillEntry[]
  /** 警告用の版判定（変換フローでは使用しない） */
  edition: 'coc6' | 'coc7' | 'unknown'
}

/** 変換済みstatブロック */
export interface ConvertedBlock {
  original: StatBlock
  convertedStartIndex: number
  convertedEndIndex: number
  abilities: AbilityStats
  derived: DerivedStats
  skills: SkillEntry[]
  convertedText: string
  notes: string[]
}

/** 地の文で置換された用語の位置情報 */
export interface NarrativeReplacement {
  originalStart: number
  originalEnd: number
  convertedStart: number
  convertedEnd: number
  from: string
  to: string
}

/** テキスト全体の変換結果 */
export interface ConversionResult {
  originalText: string
  convertedText: string
  blocks: ConvertedBlock[]
  warnings: string[]
  narrativeReplacements: NarrativeReplacement[]
}
