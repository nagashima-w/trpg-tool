<img width="256" height="256" alt="Gemini_Generated_Image_iue7z5iue7z5iue7" src="https://github.com/user-attachments/assets/d8e0e346-5add-4ead-bcbf-b2dfe9da4d4e" />

# CoC Dice Bot — セットアップ & 使い方ガイド

クトゥルフ神話TRPG（第6版・第7版）対応の Discord セッション管理 Bot。

**主な機能**
- 技能・能力値ロール（システムに応じた自動判定）
- SANチェック（SAN値の自動減算）
- キャラクター保管所からのキャラクター登録
- セッションログの記録と Markdown レポート出力

---

## セットアップ手順

### 1. Discord Developer Portal での作業

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセスしてログイン
2. **「New Application」** をクリックし、アプリ名（例: `CoC Dice Bot`）を入力して作成
3. **「General Information」** タブで以下の値を控える
   - `APPLICATION ID` → `DISCORD_APPLICATION_ID`
   - `PUBLIC KEY` → `DISCORD_PUBLIC_KEY`
4. **「Bot」** タブを開き **「Add Bot」** → **「Reset Token」** でトークンを発行して保存
   - これが `DISCORD_BOT_TOKEN`（一度しか表示されない）
   - 「Privileged Gateway Intents」は不要
5. **「OAuth2 → URL Generator」** タブを開く
   - **Scopes**: `bot` と `applications.commands` にチェック
   - **Bot Permissions**: `Send Messages` と `Attach Files` にチェック
   - 生成された URL をブラウザで開き、Bot を導入するサーバーを選択してインストール

---

### 2. Cloudflare D1 データベースの作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. **「Workers & Pages」→「D1 SQL Database」→「Create」** をクリック
3. データベース名に `coc-dice-bot-db` を入力して作成
4. 作成後に表示される **「Database ID」** を控える

#### wrangler.toml への反映

`dice-bot/wrangler.toml` の `database_id` に控えた値を記入:

```toml
[[d1_databases]]
binding       = "DB"
database_name = "coc-dice-bot-db"
database_id   = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

#### スキーマの適用

D1 の概要ページ → **「Console」** タブで `schema.sql` の内容を貼り付けて実行する。

---

### 3. GitHub Secrets の設定

リポジトリの **Settings → Environments → production → Environment secrets** に以下を登録:

| シークレット名 | 値 |
|:---|:---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン（「Edit Cloudflare Workers」テンプレートで作成） |
| `DISCORD_BOT_TOKEN` | Developer Portal で発行した Bot トークン |

`DISCORD_PUBLIC_KEY` と `DISCORD_APPLICATION_ID` は `wrangler.toml` の `[vars]` に直接記入する。

---

### 4. Worker のデプロイ

`main` ブランチに push すると GitHub Actions が自動でデプロイする。

デプロイ完了後、以下のような URL が発行される:
```
https://coc-dice-bot.<あなたのサブドメイン>.workers.dev
```

---

### 5. Interactions Endpoint URL の設定

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリを選択
2. **「General Information」→「Interactions Endpoint URL」** にデプロイ済みの Worker URL を入力
3. **「Save Changes」** をクリック（Discord が URL に PING を送り、署名検証が通れば成功）

---

### 6. スラッシュコマンドの登録

スラッシュコマンドは Discord API に事前登録が必要（コマンド定義を変更した場合も再実行）。

1. GitHub の **「Actions」** タブを開く
2. **「スラッシュコマンド登録」** ワークフローを選択
3. **「Run workflow」** をクリック
   - `guild_id`: 特定サーバーのみ即時反映したい場合は Discord サーバー ID を入力（空欄でグローバル登録）

> **サーバー ID の確認方法**: Discord 設定 → 詳細設定 → 「開発者モード」を ON → サーバー名を右クリック → 「ID をコピー」

- **ギルド登録**（特定サーバー）: 即時反映。開発・テスト中はこちら推奨
- **グローバル登録**（全サーバー）: 反映まで最大 1 時間

---

## コマンドリファレンス

### 共通オプション: `secret`

引数の末尾に `secret` を付けると、結果が実行者のみに見えるシークレットダイスになる。

```
/cc 目星 secret        → 結果が自分のみに表示
/sc 0/1d3 secret       → 同上
```

---

### 🎲 `/cc` — 技能・能力値ロール

セッションのシステム（第6版・第7版）に応じた判定を自動で行う。

```
/cc <技能名または能力値> [+N/-N] [secret]
```

| 引数 | 説明 |
|:---|:---|
| 技能名 | キャラクターシートに登録された技能名（例: `目星`、`図書館`） |
| 能力値 | `STR` `CON` `DEX` `APP` `POW` `SIZ` `INT` `EDU` `MOV` |
| 特殊値 | `HP` `MP` `SAN` `LUCK`（`幸運` でも可） |
| `+N` | ボーナスダイス N 個（**第7版のみ**） |
| `-N` | ペナルティダイス N 個（**第7版のみ**） |

**付記付き技能の検索**

キャラクターシートで「運転」に「自動車」という付記がある場合、以下の3通りで指定できる。

```
/cc 運転（自動車）   → 完全一致
/cc 自動車           → 付記のみで検索
/cc 運転             → ベース名で検索（「運転（バイク）」なども持つ場合は複数一致エラー）
```

**使用例**

```
/cc 目星              → 目星で技能ロール
/cc INT               → 知性（INT）で判定
/cc 回避 -2           → 回避にペナルティ 2 個（第7版のみ）
/cc 目星 +1 secret    → ボーナス 1 個、シークレット
/cc 自動車            → 「運転（自動車）」技能にロール
```

**第7版の出力例**
```
🎲 目星 (目標値: 60)
ベース出目：28（10の位: 20, 1の位: 8）
結果：28 ＞ ハード成功！
```

**第7版（ボーナスダイスあり）の出力例**
```
🎲 目星 (目標値: 60)
ベース出目：55（10の位: 50, 1の位: 5）
ボーナス出目（10の位）：20
最終結果：25 ＞ ハード成功！
```

**第6版の出力例**
```
🎲 目星 (目標値: 60)
出目：12 ＞ スペシャル成功！
```

---

### 🧠 `/sc` — SANチェック（正気度チェック）

現在の SAN 値で判定を行い、結果に応じて SAN を自動減算する。

```
/sc <成功時減少>/<失敗時減少> [secret]
```

減少値はダイス式または固定値で指定する。

**使用例**

```
/sc 0/1d3        → 成功時 0、失敗時 1d3 減少
/sc 1/1d6        → 成功時 1、失敗時 1d6 減少
/sc 0/1d3 secret → シークレット
```

**出力例**
```
🧠 SANチェック (現在SAN: 54)
出目：72 ＞ 失敗
SAN減少：1d3 → 2
SAN: 54 → 52
```

---

### 🎲 `/roll` — 汎用ダイスロール

ダメージ計算や表の振り直しなど、自由なダイス式を評価する。

```
/roll <ダイス式> [secret]
```

**使用例**

```
/roll 1d100        → D100 を 1 個
/roll 2d6+3        → 2d6 に +3
/roll 1d6 secret   → シークレット
```

**出力例（2d6+3）**
```
🎲 2d6+3
内訳：[4, 2]
合計：9
```

---

### 👤 `/char` — キャラクター管理

[キャラクター保管所](https://charasheet.vampire-blood.net/)（第6版・第7版対応）からキャラクターを登録する。

#### `/char set <URL>` — キャラクター登録

```
/char set https://charasheet.vampire-blood.net/4634372
```

登録したキャラクターの技能・能力値が `/cc` や `/sc` で参照される。

#### `/char status` — ステータス確認

現在の HP / MP / SAN / 幸運を表示する（自分のみに見える）。

```
/char status
```

**出力例**
```
👤 遠山 陽子
HP: 12 | MP: 10 | SAN: 42 | 幸運: 65
```

#### `/char refresh` — 技能・能力値の再取得

シナリオ中に新しい技能を取得した場合、キャラクターシートを更新してからこのコマンドを実行する。

```
/char refresh
```

- `skills`（技能値）と `stats`（基本能力値）をキャラクター保管所から再取得して上書き
- **HP・MP・SAN・幸運は現在値を維持**（シート上の初期値に戻らない）

> **注**: 数値 ID・ハッシュ ID どちらの URL で登録したキャラクターでも使用できる。

#### `/char update <対象> <増減値>` — ステータス手動更新

セッション中に受けたダメージや回復を反映する。

```
/char update <HP|MP|SAN|LUCK> <±数値>
```

| 対象 | 説明 |
|:---|:---|
| `HP` | ヒットポイント |
| `MP` | マジックポイント |
| `SAN` | 正気度 |
| `LUCK` | 幸運 |

**使用例**

```
/char update HP -3      → HP を 3 減らす
/char update SAN -5     → SAN を 5 減らす
/char update MP +2      → MP を 2 回復
```

---

### 📅 `/session` — セッション管理

#### `/session start` — セッション開始

セッションを開始すると、以降の `/cc` と `/sc` のロール結果がログに記録される。

```
/session start
  name:   <セッション名>
  system: <coc7 または coc6>（省略時: coc7）
```

| オプション | 説明 |
|:---|:---|
| `name` | セッション名（レポートのファイル名にも使用） |
| `system` | `coc7`（第7版）または `coc6`（第6版）。省略時は第7版 |

`system` を選択するとそのセッション中の `/cc`・`/sc` がそのシステムのルールで動作する。

**出力例**
```
🎮 セッション「呪われた村」を開始しました！（システム: 新クトゥルフ神話TRPG（第7版））
これ以降のダイスロールはログに記録されます。
```

#### `/session end` — セッション終了

セッションを終了し、ダイスログをまとめた Markdown レポートファイルを Discord に添付して送信する。

```
/session end
```

レポートの内容:
- 参加者一覧（KP・各 PL のキャラクター名）
- プレイヤーごとの成功率・平均出目
- プレイヤー別詳細ログ（時刻・技能名・目標値・出目・結果、折りたたみ式）

> シークレットダイス（`secret` 付き）のロールはレポートに含まれない。

---

### ❓ `/dicehelp` — ヘルプ表示

全コマンドの概要を表示する（自分のみに見える）。

```
/dicehelp
```

---

## ゲームシステム別 判定レベル一覧

### 第7版（CoC7th）

| 判定レベル | 出目の条件 |
|:---|:---|
| クリティカル | 1 |
| イクストリーム成功 | 目標値 / 5 以下（切り捨て） |
| ハード成功 | 目標値 / 2 以下（切り捨て） |
| レギュラー成功 | 目標値以下 |
| 失敗 | 目標値より大きい |
| ファンブル | 目標値 ≤ 49 → 96〜100、目標値 ≥ 50 → 100 のみ |

### 第6版（CoC6th）

| 判定レベル | 出目の条件 |
|:---|:---|
| クリティカル | 1 |
| スペシャル成功 | 目標値 / 5 以下（切り捨て） |
| 成功 | 目標値以下 |
| 失敗 | 目標値より大きい |
| ファンブル | 96〜100（目標値によらず固定） |

---

## セッション中の典型的な流れ

```
KP: /session start  name: 呪われた村  system: coc7
Bot: 🎮 セッション開始！

PL: /char set https://charasheet.vampire-blood.net/4634372
Bot: ✅ 遠山 陽子 を登録しました！

PL: /cc 目星
Bot: 🎲 目星 (目標値: 75) ... レギュラー成功

KP: /sc 0/1d3  ← KP が怪物との遭遇を宣言
Bot: 🧠 SANチェック ... SAN: 54 → 52

PL: /char update HP -3
Bot: ✅ HP を -3 しました。（現在: 9）

KP: /session end
Bot: ✅ セッション終了。レポートを添付します。（.md ファイル）
```
