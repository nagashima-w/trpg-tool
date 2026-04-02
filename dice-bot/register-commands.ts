// ============================================================
// スラッシュコマンド登録スクリプト
// 実行: npx ts-node register-commands.ts
//
// グローバル登録（全サーバー）: GUILD_ID を空にする
// ギルド登録（即時反映）: GUILD_ID を設定する（開発中推奨）
// ============================================================

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID ?? ''
const BOT_TOKEN      = process.env.DISCORD_BOT_TOKEN ?? ''
const GUILD_ID       = process.env.DISCORD_GUILD_ID ?? '' // 空の場合はグローバル登録

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error('DISCORD_APPLICATION_ID と DISCORD_BOT_TOKEN を環境変数に設定してください。')
  process.exit(1)
}

const commands = [
  {
    name: 'cc',
    description: '技能・能力値ロール（CoC第6版/第7版 セッションのシステムに応じた判定）',
    options: [
      {
        name: 'args',
        description: '技能名 [+N/-N] [secret] 例: 目星 / INT +1 / 回避 -2 secret',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'sc',
    description: '正気度チェック（SANチェック）',
    options: [
      {
        name: 'args',
        description: '成功時減少/失敗時減少 [secret] 例: 0/1d3 / 1/1d6 secret',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'roll',
    description: '汎用ダイスロール',
    options: [
      {
        name: 'args',
        description: 'ダイス式 [secret] 例: 1d100 / 2d6+3 / 1d6 secret',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'char',
    description: 'キャラクター管理',
    options: [
      {
        name: 'args',
        description: 'set <URL> / status / update <HP|MP|SAN|LUCK> <増減値>',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'help',
    description: 'コマンドの使い方を表示する',
  },
  {
    name: 'session',
    description: 'セッション管理',
    options: [
      {
        name: 'start',
        description: 'セッションを開始する',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'name',
            description: 'セッション名 例: 呪われた村',
            type: 3, // STRING
            required: true,
          },
          {
            name: 'system',
            description: 'TRPGシステム（省略時: 第7版）',
            type: 3, // STRING
            required: false,
            choices: [
              { name: '新クトゥルフ神話TRPG（第7版）', value: 'coc7' },
              { name: 'クトゥルフ神話TRPG（第6版）', value: 'coc6' },
            ],
          },
        ],
      },
      {
        name: 'end',
        description: 'セッションを終了してレポートを出力する',
        type: 1, // SUB_COMMAND
      },
    ],
  },
]

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`

console.log(`登録先: ${GUILD_ID ? `ギルド (${GUILD_ID})` : 'グローバル'}`)
console.log(`コマンド数: ${commands.length}`)

fetch(url, {
  method: 'PUT',
  headers: {
    'Authorization': `Bot ${BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
})
  .then(async res => {
    const data = await res.json()
    if (res.ok) {
      console.log(`✅ ${(data as unknown[]).length} 件のコマンドを登録しました。`)
    } else {
      console.error('❌ 登録失敗:', JSON.stringify(data, null, 2))
    }
  })
  .catch(err => console.error('❌ ネットワークエラー:', err))
