// ============================================================
// CoC 第7版 ダイスロジック
// ============================================================

// 第7版: critical / extreme / hard / regular / failure / fumble
// 第6版: critical / special / success / failure / fumble
export type ResultLevel = 'critical' | 'extreme' | 'hard' | 'regular' | 'failure' | 'fumble' | 'special' | 'success'
export type JudgeResult = ResultLevel // alias for readability in tests

/** rollD100(false) → number、rollD100(true) → D100Detail */
export interface D100Detail {
  tens: number  // 0, 10, 20, ..., 90
  ones: number  // 1〜10
  total: number // 1〜100
}

export interface BonusPenaltyResult {
  final: number
  extraRolls: number[] // 追加で振った10の位の値
}

export interface RollExpression {
  count: number
  sides: number
  modifier: number
}

export interface EvalResult {
  rolls: number[]
  total: number
}

// ── 内部ユーティリティ ─────────────────────────────────────────

/** min以上max以下の整数乱数 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 10の位ダイス（0, 10, 20, ..., 90）を1個振る */
function rollTens(): number {
  return randInt(0, 9) * 10
}

/** 1の位ダイス（1〜10）を1個振る */
function rollOnes(): number {
  return randInt(1, 10)
}

// ── 公開API ───────────────────────────────────────────────────

/**
 * D100を振る。
 * detailed=false（デフォルト）→ number
 * detailed=true → D100Detail
 */
export function rollD100(detailed?: false): number
export function rollD100(detailed: true): D100Detail
export function rollD100(detailed?: boolean): number | D100Detail {
  const tens = rollTens()
  const ones = rollOnes()
  const total = tens === 90 && ones === 10 ? 100 : tens + ones

  if (detailed) {
    return { tens, ones, total }
  }
  return total
}

/**
 * 第7版の判定レベルを返す。
 * @param dice  最終出目（1〜100）
 * @param target 目標値
 */
export function judgeResult(dice: number, target: number): ResultLevel {
  // クリティカル: 出目1
  if (dice === 1) return 'critical'

  // ファンブル: 目標値49以下なら96〜100、50以上なら100のみ
  if (target <= 49 && dice >= 96) return 'fumble'
  if (target >= 50 && dice === 100) return 'fumble'

  // イクストリーム: 目標値の1/5以下（端数切り捨て）
  if (dice <= Math.floor(target / 5)) return 'extreme'

  // ハード: 目標値の1/2以下（端数切り捨て）
  if (dice <= Math.floor(target / 2)) return 'hard'

  // レギュラー: 目標値以下
  if (dice <= target) return 'regular'

  // 失敗
  return 'failure'
}

/**
 * 第6版の判定レベルを返す。
 * @param dice  出目（1〜100）
 * @param target 目標値
 *
 * 判定順:
 *   ファンブル: 96以上（目標値によらず）
 *   クリティカル: 出目1
 *   スペシャル: 目標値の1/5以下（端数切り捨て）
 *   成功: 目標値以下
 *   失敗: それ以外
 */
export function judgeResult6(dice: number, target: number): ResultLevel {
  if (dice >= 96) return 'fumble'
  if (dice === 1) return 'critical'
  if (dice <= Math.floor(target / 5)) return 'special'
  if (dice <= target) return 'success'
  return 'failure'
}

/**
 * ボーナス・ペナルティダイスを適用して最終出目を返す。
 * @param base       ベースのD100詳細
 * @param modifier   正=ボーナス個数、負=ペナルティ個数、0=なし
 * @param extraTens  テスト用の追加10の位ダイス結果（省略時はランダム）
 */
export function applyBonusPenalty(
  base: D100Detail,
  modifier: number,
  extraTens?: number[],
): BonusPenaltyResult {
  if (modifier === 0) {
    return { final: base.total, extraRolls: [] }
  }

  const count = Math.abs(modifier)
  const extras = extraTens ?? Array.from({ length: count }, () => rollTens())

  // 全候補の tens をリストアップ
  const allTens = [base.tens, ...extras]

  // ボーナス → 最小の tens を採用、ペナルティ → 最大の tens を採用
  const chosenTens = modifier > 0
    ? Math.min(...allTens)
    : Math.max(...allTens)

  // ones はベースのまま
  const final = chosenTens === 90 && base.ones === 10 ? 100 : chosenTens + base.ones

  return { final, extraRolls: extras }
}

/**
 * "NdM+K" 形式の文字列をパースする。
 * 不正な式は null を返す。
 */
export function parseRollExpression(expr: string): RollExpression | null {
  const m = expr.trim().match(/^(\d+)[dD](\d+)([+-]\d+)?$/)
  if (!m) return null
  const count = parseInt(m[1], 10)
  const sides = parseInt(m[2], 10)
  const modifier = m[3] ? parseInt(m[3], 10) : 0
  if (count < 1 || sides < 1) return null
  return { count, sides, modifier }
}

/**
 * "NdM+K" 形式のダイス式を評価して結果を返す。
 * 不正な式は null を返す。
 */
export function evalRollExpression(expr: string): EvalResult | null {
  const parsed = parseRollExpression(expr)
  if (!parsed) return null

  const rolls = Array.from({ length: parsed.count }, () => randInt(1, parsed.sides))
  const sum = rolls.reduce((a, b) => a + b, 0)
  return {
    rolls,
    total: sum + parsed.modifier,
  }
}
