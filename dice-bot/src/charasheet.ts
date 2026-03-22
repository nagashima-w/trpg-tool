// ============================================================
// キャラクター保管所 (charasheet.vampire-blood.net) パーサー
// ============================================================

/** URLパース結果 */
export interface ParsedUrl {
  id: string
  type: 'numeric' | 'hash'
}

/** キャラクター保管所のJSONレスポンス（必要フィールドのみ） */
export interface CharasheetData {
  game: string        // 'coc7' であることを確認する
  data_id: number
  phrase: string      // ハッシュID
  pc_name: string
  // 能力値現在値
  NP1: string   // STR
  NP2: string   // CON
  NP3: string   // DEX
  NP4: string   // APP
  NP5: string   // POW
  NP6: string   // SIZ
  NP7: string   // INT
  NP8: string   // EDU
  NP9: string   // MOV
  NP10: string  // HP
  NP11: string  // MP
  // SAN・幸運
  SAN_Left: string
  Luck_Left: string
  // 技能（配列・インデックスが対応）
  SKAN: string[]  // 技能名
  SKAP: string[]  // 技能合計値
}

/** DBに保存するキャラクターレコード */
export interface CharacterRecord {
  id: string
  user_id: string
  name: string
  hp: number
  mp: number
  san: number
  luck: number
  stats: {
    STR: number; CON: number; DEX: number; APP: number
    POW: number; SIZ: number; INT: number; EDU: number; MOV: number
  }
  skills: Record<string, number>
}

const CHARASHEET_HOST = 'charasheet.vampire-blood.net'

/**
 * キャラクター保管所のURLを解析してIDを返す。
 * 無効なURLはnullを返す。
 */
export function parseCharasheetUrl(url: string): ParsedUrl | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.hostname !== CHARASHEET_HOST) return null

  // パス: /4634372 または /m5581dda6... または末尾スラッシュ付き
  const path = parsed.pathname.replace(/\/$/, '')
  const segment = path.split('/').pop()
  if (!segment) return null

  if (/^\d+$/.test(segment)) {
    return { id: segment, type: 'numeric' }
  }

  if (/^m[0-9a-f]{32}$/.test(segment)) {
    return { id: segment.slice(1), type: 'hash' }
  }

  return null
}

/**
 * キャラクター保管所からJSONデータを取得する。
 * 取得失敗やcoc7以外のゲームはエラーをthrowする。
 */
export async function fetchCharasheet(id: string): Promise<CharasheetData> {
  const url = `https://${CHARASHEET_HOST}/${id}.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`キャラクター保管所へのアクセスに失敗しました (HTTP ${res.status})`)
  }
  const data = await res.json() as CharasheetData
  return data
}

/**
 * CharasheetDataをCharacterRecordに変換する。
 * game が 'coc7' でない場合はnullを返す。
 */
export function mapToCharacter(data: CharasheetData, userId: string): CharacterRecord | null {
  if (data.game !== 'coc7') return null

  // 技能マッピング: 値が空文字のものはスキップ
  const skills: Record<string, number> = {}
  for (let i = 0; i < data.SKAN.length; i++) {
    const name = data.SKAN[i]
    const val  = data.SKAP[i]
    if (name && val !== '') {
      skills[name] = parseInt(val, 10)
    }
  }

  return {
    id:      String(data.data_id),
    user_id: userId,
    name:    data.pc_name,
    hp:      parseInt(data.NP10, 10),
    mp:      parseInt(data.NP11, 10),
    san:     parseInt(data.SAN_Left, 10),
    luck:    parseInt(data.Luck_Left, 10),
    stats: {
      STR: parseInt(data.NP1, 10),
      CON: parseInt(data.NP2, 10),
      DEX: parseInt(data.NP3, 10),
      APP: parseInt(data.NP4, 10),
      POW: parseInt(data.NP5, 10),
      SIZ: parseInt(data.NP6, 10),
      INT: parseInt(data.NP7, 10),
      EDU: parseInt(data.NP8, 10),
      MOV: parseInt(data.NP9, 10),
    },
    skills,
  }
}
