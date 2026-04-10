// ============================================================
// /cc コマンド - 技能・能力値ロール（第6版 / 第7版）
// ============================================================

import { rollD100, judgeResult, judgeResult6, applyBonusPenalty } from '../dice.ts'
import { getActiveCharacter, getActiveSession } from '../db.ts'
import { extractSecret, extractModifier, resultLabel, type CommandResult } from './shared.ts'
import type { D1Database } from '../db.ts'
import type { CharacterRecord } from '../charasheet.ts'

// char.stats に存在する能力値キー（英語大文字）
const STAT_KEYS = ['STR','CON','DEX','APP','POW','SIZ','INT','EDU','MOV'] as const

// char 直接フィールドへのエイリアス（英語・日本語両対応）
// HP/MP/SAN/LUCK は char.stats ではなく char の直接プロパティに格納されている
const SPECIAL_FIELD_ALIASES: Record<string, 'hp' | 'mp' | 'san' | 'luck'> = {
  'HP': 'hp',
  'MP': 'mp',
  'SAN': 'san',
  'LUCK': 'luck', '幸運': 'luck',
}

// ── 技能・能力値解決ヘルパー ──────────────────────────────────

type SkillResolution =
  | { targetValue: number; resolvedName: string }
  | { error: string }

/**
 * キャラクターから技能名を多段階ルックアップして目標値を返す。
 * 見つからない場合や複数一致の場合は error を返す。
 */
function resolveSkill(char: CharacterRecord, skillName: string): SkillResolution {
  const upperKey = skillName.toUpperCase()
  let targetValue: number | undefined
  let resolvedName = skillName

  // 1. 能力値チェック (STR/CON/DEX/APP/POW/SIZ/INT/EDU/MOV)
  if (STAT_KEYS.includes(upperKey as typeof STAT_KEYS[number])) {
    targetValue = (char.stats as Record<string, number>)[upperKey]
    resolvedName = upperKey
  }
  // 2. 特殊フィールドチェック (HP/MP/SAN/LUCK/幸運)
  else if (SPECIAL_FIELD_ALIASES[upperKey] !== undefined || SPECIAL_FIELD_ALIASES[skillName] !== undefined) {
    const field = SPECIAL_FIELD_ALIASES[upperKey] ?? SPECIAL_FIELD_ALIASES[skillName]
    targetValue = char[field]
  }
  // 3. 技能チェック（多段階ルックアップ）
  else {
    // 3-a. 完全一致
    if (char.skills[skillName] !== undefined) {
      targetValue = char.skills[skillName]
    }

    // 3-b. 付記との一致: 「技能名（skillName）」の形のキーを検索
    // [^（）]+ で括弧を含まない文字列のみマッチし、入れ子括弧による誤検出を防ぐ
    if (targetValue === undefined) {
      const annotationMatches = Object.entries(char.skills).filter(([key]) => {
        const m = key.match(/^[^（）]+（([^（）]+)）$/)
        return m !== null && m[1] === skillName
      })
      if (annotationMatches.length === 1) {
        resolvedName  = annotationMatches[0][0]
        targetValue   = annotationMatches[0][1]
      } else if (annotationMatches.length > 1) {
        const names = annotationMatches.map(([k]) => k).join('、')
        return { error: `「${skillName}」に該当する技能が複数あります: ${names}\n技能名を詳しく指定してください。` }
      }
    }

    // 3-c. ベース名との一致: 「skillName（付記）」の形のキーを検索
    if (targetValue === undefined) {
      const baseMatches = Object.entries(char.skills).filter(([key]) => {
        const m = key.match(/^([^（）]+)（[^（）]+）$/)
        return m !== null && m[1] === skillName
      })
      if (baseMatches.length === 1) {
        resolvedName = baseMatches[0][0]
        targetValue  = baseMatches[0][1]
      } else if (baseMatches.length > 1) {
        const names = baseMatches.map(([k]) => k).join('、')
        return { error: `「${skillName}」に該当する技能が複数あります: ${names}\n技能名を詳しく指定してください。` }
      }
    }
  }

  if (targetValue === undefined) {
    return { error: `技能・能力値「${skillName}」が見つかりません。` }
  }

  return { targetValue, resolvedName }
}

// ── コマンドハンドラ ──────────────────────────────────────────

export async function handleCc(
  db: D1Database,
  userId: string,
  guildId: string,
  channelId: string,
  rawArgs: string,
  targetUserId?: string,
): Promise<CommandResult> {
  // secret・modifier抽出
  const { args: argsNoSecret, isSecret } = extractSecret(rawArgs)
  const { args: skillName, modifier } = extractModifier(argsNoSecret)

  // セッション情報取得（システム判定・KP確認に使用）
  const session = await getActiveSession(db, guildId, channelId)
  const system = session?.system ?? 'coc7'

  if (system === 'coc6' && modifier !== 0) {
    return {
      message: 'ボーナス/ペナルティダイスはクトゥルフ神話TRPG第6版では使用しません。',
      ephemeral: true,
    }
  }

  // ── KPターゲット指定ロール ──
  if (targetUserId !== undefined) {
    if (!session) {
      return { message: '進行中のセッションがありません。', ephemeral: true }
    }
    if (session.kp_user_id !== userId) {
      return { message: 'ターゲット指定ロールはKPのみ使用できます。', ephemeral: true }
    }

    const targetChar = await getActiveCharacter(db, targetUserId)
    if (!targetChar) {
      return {
        message: '対象プレイヤーにアクティブキャラクターが設定されていません。',
        ephemeral: true,
      }
    }

    const resolution = resolveSkill(targetChar, skillName)
    if ('error' in resolution) {
      return { message: resolution.error, ephemeral: true }
    }
    const { targetValue, resolvedName } = resolution
    const base = rollD100(true)

    if (system === 'coc6') {
      const level = judgeResult6(base.total, targetValue)
      return {
        message: [
          `🎲 **${resolvedName}** (${targetChar.name}: ${targetValue})`,
          `出目：**${base.total}** ＞ ${resultLabel(level)}`,
        ].join('\n'),
        ephemeral: true,
      }
    } else {
      const { final, extraRolls } = applyBonusPenalty(base, modifier)
      const level = judgeResult(final, targetValue)
      const lines = [
        `🎲 **${resolvedName}** (${targetChar.name}: ${targetValue})`,
        `ベース出目：${base.total}（10の位: ${base.tens}, 1の位: ${base.ones}）`,
      ]
      if (modifier !== 0) {
        const label = modifier > 0 ? 'ボーナス' : 'ペナルティ'
        lines.push(`${label}出目（10の位）：${extraRolls.join(', ')}`)
        lines.push(`最終結果：**${final}** ＞ ${resultLabel(level)}`)
      } else {
        lines.push(`結果：**${final}** ＞ ${resultLabel(level)}`)
      }
      return { message: lines.join('\n'), ephemeral: true }
    }
  }

  // ── 通常ロール ──
  const char = await getActiveCharacter(db, userId)
  if (!char) {
    return {
      message: 'キャラクターが設定されていません。`/char set <URL>` で登録してください。',
      ephemeral: true,
    }
  }

  const resolution = resolveSkill(char, skillName)
  if ('error' in resolution) {
    return { message: resolution.error, ephemeral: true }
  }
  const { targetValue, resolvedName } = resolution
  const base = rollD100(true)

  if (system === 'coc6') {
    const level = judgeResult6(base.total, targetValue)
    return {
      message: [
        `🎲 **${resolvedName}** (目標値: ${targetValue})`,
        `出目：**${base.total}** ＞ ${resultLabel(level)}`,
      ].join('\n'),
      ephemeral: isSecret,
      diceLog: {
        skillName: resolvedName,
        targetValue,
        finalDice: base.total,
        resultLevel: level,
        isSecret,
      },
    }
  } else {
    const { final, extraRolls } = applyBonusPenalty(base, modifier)
    const level = judgeResult(final, targetValue)
    const lines = [
      `🎲 **${resolvedName}** (目標値: ${targetValue})`,
      `ベース出目：${base.total}（10の位: ${base.tens}, 1の位: ${base.ones}）`,
    ]
    if (modifier !== 0) {
      const label = modifier > 0 ? 'ボーナス' : 'ペナルティ'
      lines.push(`${label}出目（10の位）：${extraRolls.join(', ')}`)
      lines.push(`最終結果：**${final}** ＞ ${resultLabel(level)}`)
    } else {
      lines.push(`結果：**${final}** ＞ ${resultLabel(level)}`)
    }
    return {
      message: lines.join('\n'),
      ephemeral: isSecret,
      diceLog: {
        skillName: resolvedName,
        targetValue,
        finalDice: final,
        resultLevel: level,
        isSecret,
      },
    }
  }
}
