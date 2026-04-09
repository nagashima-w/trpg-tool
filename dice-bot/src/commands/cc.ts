// ============================================================
// /cc コマンド - 技能・能力値ロール（第6版 / 第7版）
// ============================================================

import { rollD100, judgeResult, judgeResult6, applyBonusPenalty } from '../dice.ts'
import { getActiveCharacter, getActiveSession } from '../db.ts'
import { extractSecret, extractModifier, resultLabel, type CommandResult } from './shared.ts'
import type { D1Database } from '../db.ts'

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

export async function handleCc(
  db: D1Database,
  userId: string,
  guildId: string,
  channelId: string,
  rawArgs: string,
): Promise<CommandResult> {
  // secret抽出
  const { args: argsNoSecret, isSecret } = extractSecret(rawArgs)
  // modifier抽出
  const { args: skillName, modifier } = extractModifier(argsNoSecret)

  const [session, char] = await Promise.all([
    getActiveSession(db, guildId, channelId),
    getActiveCharacter(db, userId),
  ])
  const system = session?.system ?? 'coc7'

  if (system === 'coc6' && modifier !== 0) {
    return {
      message: 'ボーナス/ペナルティダイスはクトゥルフ神話TRPG第6版では使用しません。',
      ephemeral: true,
    }
  }

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

  // 1. 能力値チェック (STR/CON/DEX/APP/POW/SIZ/INT/EDU/MOV)
  if (STAT_KEYS.includes(upperKey as typeof STAT_KEYS[number])) {
    targetValue = (char.stats as Record<string, number>)[upperKey]
    resolvedName = upperKey
  }
  // 2. 特殊フィールドチェック (HP/MP/SAN/LUCK/幸運)
  //    大文字変換後と元のキー名の両方をチェック
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
        return {
          message: `「${skillName}」に該当する技能が複数あります: ${names}\n技能名を詳しく指定してください。`,
          ephemeral: true,
        }
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
        return {
          message: `「${skillName}」に該当する技能が複数あります: ${names}\n技能名を詳しく指定してください。`,
          ephemeral: true,
        }
      }
    }
  }

  if (targetValue === undefined) {
    return {
      message: `技能・能力値「${skillName}」が見つかりません。`,
      ephemeral: true,
    }
  }

  // ダイスロール
  const base = rollD100(true)
  const lines: string[] = []

  if (system === 'coc6') {
    const level = judgeResult6(base.total, targetValue)
    lines.push(`🎲 **${resolvedName}** (目標値: ${targetValue})`)
    lines.push(`出目：**${base.total}** ＞ ${resultLabel(level)}`)
    return { message: lines.join('\n'), ephemeral: isSecret, diceLog: {
      skillName: resolvedName,
      targetValue,
      finalDice: base.total,
      resultLevel: level,
      isSecret,
    }}
  } else {
    const { final, extraRolls } = applyBonusPenalty(base, modifier)
    const level = judgeResult(final, targetValue)

    lines.push(`🎲 **${resolvedName}** (目標値: ${targetValue})`)
    lines.push(`ベース出目：${base.total}（10の位: ${base.tens}, 1の位: ${base.ones}）`)

    if (modifier !== 0) {
      const label = modifier > 0 ? 'ボーナス' : 'ペナルティ'
      lines.push(`${label}出目（10の位）：${extraRolls.join(', ')}`)
      lines.push(`最終結果：**${final}** ＞ ${resultLabel(level)}`)
    } else {
      lines.push(`結果：**${final}** ＞ ${resultLabel(level)}`)
    }

    return { message: lines.join('\n'), ephemeral: isSecret, diceLog: {
      skillName: resolvedName,
      targetValue,
      finalDice: final,
      resultLevel: level,
      isSecret,
    }}
  }
}
