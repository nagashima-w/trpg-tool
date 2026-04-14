// ============================================================
// 変換テーブル（7版ルール）
// ============================================================

import type { AbilityStats, DerivedStats } from './types'

export interface DBEntry {
  db: string
  build: number
}

/**
 * ×5後の STR+SIZ から7版のDB/Buildを求める
 */
export function calcDB7(strPlusSiz: number): DBEntry {
  if (strPlusSiz <= 64)  return { db: '-2',   build: -2 }
  if (strPlusSiz <= 84)  return { db: '-1',   build: -1 }
  if (strPlusSiz <= 124) return { db: '0',    build:  0 }
  if (strPlusSiz <= 164) return { db: '+1D4', build:  1 }
  if (strPlusSiz <= 204) return { db: '+1D6', build:  2 }
  if (strPlusSiz <= 284) return { db: '+2D6', build:  3 }
  if (strPlusSiz <= 364) return { db: '+3D6', build:  4 }
  if (strPlusSiz <= 444) return { db: '+4D6', build:  5 }
  return                        { db: '+5D6', build:  6 }
}

/**
 * ×5後の STR / DEX / SIZ から MOV を求める
 * （raw値ベースで比較するため÷5して判定）
 */
export function calcMOV(str: number, dex: number, siz: number): number {
  const strR = str / 5
  const dexR = dex / 5
  const sizR = siz / 5
  if (strR < sizR && dexR < sizR) return 7
  if (strR > sizR && dexR > sizR) return 9
  return 8
}

/**
 * ×5後の能力値から派生値を再計算する。
 * 渡されていない値は計算しない。
 */
export function recalcDerived(abilities: AbilityStats): DerivedStats {
  const result: DerivedStats = {}

  if (abilities.CON !== undefined && abilities.SIZ !== undefined) {
    result.HP = Math.floor((abilities.CON + abilities.SIZ) / 10)
  }

  if (abilities.POW !== undefined) {
    result.MP  = Math.floor(abilities.POW / 5)
    result.SAN = abilities.POW
  }

  if (abilities.STR !== undefined && abilities.SIZ !== undefined) {
    const entry = calcDB7(abilities.STR + abilities.SIZ)
    result.db    = entry.db
    result.build = entry.build
  }

  if (abilities.STR !== undefined && abilities.DEX !== undefined && abilities.SIZ !== undefined) {
    result.MOV = calcMOV(abilities.STR, abilities.DEX, abilities.SIZ)
  }

  return result
}
