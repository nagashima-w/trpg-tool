// ============================================================
// /help コマンド - コマンドリファレンス表示
// ============================================================

import type { CommandResult } from './shared.ts'

export function handleHelp(): CommandResult {
  const lines = [
    '**📖 CoC Dice Bot コマンドリファレンス**',
    '',
    '**🎲 ダイス・判定**',
    '`/cc <技能名> [+N/-N] [secret]` — 技能ロール（セッションのシステムに応じた判定）',
    '　例: `/cc 目星` | `/cc INT +1` | `/cc 回避 -2 secret`',
    '　※ ボーナス/ペナルティ（+N/-N）は第7版のみ使用可',
    '`/sc <成功時>/<失敗時> [secret]` — SANチェック',
    '　例: `/sc 0/1d3` | `/sc 1/1d6 secret`',
    '`/roll <ダイス式> [secret]` — 汎用ダイスロール',
    '　例: `/roll 1d100` | `/roll 2d6+3 secret`',
    '',
    '**👤 キャラクター管理**',
    '`/char set <URL>` — キャラクター保管所から登録（第6版・第7版対応）',
    '　例: `/char set https://charasheet.vampire-blood.net/4634372`',
    '`/char status` — 現在のHP / MP / SAN / 幸運を表示',
    '`/char update <HP|MP|SAN|LUCK> <増減値>` — ステータスを手動更新',
    '　例: `/char update SAN -3` | `/char update HP +2`',
    '',
    '**📅 セッション管理**',
    '`/session start name: <セッション名> [system: coc6|coc7]` — セッションを開始',
    '　system 省略時は第7版（coc7）が適用されます',
    '　例: `/session start name: 呪われた村` （第7版）',
    '　例: `/session start name: 怪異の夜 system: coc6` （第6版）',
    '`/session end` — セッションを終了してレポートを出力',
    '',
    '**🎯 システム別 判定レベル**',
    '第7版: クリティカル > イクストリーム > ハード > レギュラー > 失敗 > ファンブル',
    '第6版: クリティカル > スペシャル > 成功 > 失敗 > ファンブル',
    '',
    '**ℹ️ 共通オプション**',
    '引数の末尾に `secret` を付けると結果が実行者のみに表示されます（シークレットダイス）。',
  ]
  return { message: lines.join('\n'), ephemeral: true }
}
