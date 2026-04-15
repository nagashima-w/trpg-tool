// ============================================================
// 技能リネームマップ
// ============================================================

import type { SkillEntry } from './types'

/** 統合先が同じ技能グループ。同一ブロック内に複数あれば最高値を採用する */
const MERGE_GROUPS: Record<string, string> = {
  'こぶし':           '近接戦闘（格闘）',
  'こぶし（パンチ）': '近接戦闘（格闘）',
  'パンチ':           '近接戦闘（格闘）',
  'キック':           '近接戦闘（格闘）',
  '頭突き':           '近接戦闘（格闘）',
  '組み付き':         '近接戦闘（格闘）',
  '隠れる':           '隠密',
  '忍び歩き':         '隠密',
  '潜む':             '隠密',
  '隠す':             '隠密',
  '値切り':           '言いくるめ',
  '言いくるめ':       '言いくるめ',
}

/** 1対1リネームマップ */
const RENAME_MAP: Record<string, string> = {
  'ドッジ':             '回避',
  'ハンドガン':         '射撃（ハンドガン）',
  '拳銃':               '射撃（拳銃）',
  'ライフル':           '射撃（ライフル）',
  'ショットガン':       '射撃（ショットガン）',
  'サブマシンガン':     '射撃（サブマシンガン）',
  'マシンガン':         '射撃（マシンガン）',
  '機関銃':             '射撃（機関銃）',
  '火炎放射器':         '射撃（火炎放射器）',
  'ロケット/ミサイル':  '射撃（ロケット）',
  '機関砲':             '射撃（機関砲）',
  'ナイフ':             '近接戦闘（ナイフ）',
  'こん棒':             '近接戦闘（こん棒）',
  '斧':                 '近接戦闘（斧）',
  '剣':                 '近接戦闘（剣）',
  '槍':                 '近接戦闘（槍）',
  '刀':                 '近接戦闘（刀）',
  'チェーンソー':       '近接戦闘（チェーンソー）',
  '鞭':                 '近接戦闘（鞭）',
  '飛行機操縦':         '操縦（航空機）',
}

/**
 * 技能名を7版の名前にマッピングする。
 * マッピングがない場合はそのまま返す。
 */
export function mapSkillName(name: string): string {
  return MERGE_GROUPS[name] ?? RENAME_MAP[name] ?? name
}

/**
 * 技能リストを変換する。
 * - 統合グループ（格闘・隠密）は最高値の1エントリにまとめる
 * - 1対1リネームはそのまま適用
 * - マッピングなしはそのまま維持
 */
export function convertSkills(skills: Array<{ name: string; value: number }>): SkillEntry[] {
  // 統合グループの最高値を先にまとめる（どの技能が統合代表になるか確定させる）
  const mergeMax = new Map<string, { originalName: string; value: number; firstIndex: number }>()

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i]
    const mergeTarget = MERGE_GROUPS[skill.name]
    if (mergeTarget === undefined) continue
    const existing = mergeMax.get(mergeTarget)
    if (!existing || skill.value > existing.value) {
      mergeMax.set(mergeTarget, { originalName: skill.name, value: skill.value, firstIndex: i })
    }
  }

  // 入力順を保ちながら出力を構築
  const emitted = new Set<string>() // 統合済みターゲット名

  const result: SkillEntry[] = []

  for (const skill of skills) {
    const mergeTarget = MERGE_GROUPS[skill.name]
    if (mergeTarget !== undefined) {
      if (!emitted.has(mergeTarget)) {
        emitted.add(mergeTarget)
        const best = mergeMax.get(mergeTarget)!
        result.push({
          name: mergeTarget,
          originalName: best.originalName,
          value: best.value,
          renamed: mergeTarget !== best.originalName,
        })
      }
      // 統合済みの技能（最高値以外）はスキップ
    } else {
      const newName = RENAME_MAP[skill.name] ?? skill.name
      result.push({
        name: newName,
        originalName: skill.name,
        value: skill.value,
        renamed: newName !== skill.name,
      })
    }
  }

  return result
}
