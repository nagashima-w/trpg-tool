# 🎲 新クトゥルフ神話TRPG（第7版）用 Discordセッション管理Bot 仕様書

## 1. システム構成（インフラ）

完全無料で運用し、高速なレスポンスとログ集計を実現するサーバーレス構成。

- **プラットフォーム**: Discord（スラッシュコマンド / Webhook形式）
- **バックエンド（処理）**: Cloudflare Workers
- **データベース（保存）**: Cloudflare D1（SQLiteベースのリレーショナルDB）

---

## 2. コマンド仕様（インターフェース）

プレイヤーの入力負荷を最小限にするため、単一のテキスト入力欄（`args`）を用意し、Bot側でスペース区切りの文字列を解析（パース）して処理を分岐させる。

**重要**: すべてのコマンドにおいて、引数の中に `secret` という文字列が含まれていた場合は「シークレットダイス」として扱い、実行者（KP）のみに見えるEphemeralメッセージで結果を返す。

### 🎲 ダイス・判定系

- **`/cc [引数]`**（技能・能力値ロール）
  - 入力例: `/cc 目星`、`/cc INT +1`、`/cc 回避 -2 secret`
  - 処理:
    - 文字列から「技能・能力値名」「ボーナス/ペナルティ（`+` または `-` で始まる数値）」「シークレット指定（`secret`）」を抽出
    - DBから該当キャラの数値を参照し、ダイスロールを実行
    - 第7版の判定レシピに従い、結果を自動判定（クリティカル、イクストリーム、ハード、レギュラー、失敗、ファンブル）
    - 結果とダイスの内訳をDiscordに返信

- **`/sc [引数]`**（正気度/SANチェック）
  - 入力例: `/sc 1/1d3`、`/sc 0/1d6 secret`
  - 処理:
    - 成功/失敗時の減少値を `/` で分割して保持
    - 現在のSAN値で判定を行い、結果に応じて自動でSAN値を減算
    - **不定の狂気フラグの管理は行わない**（セッション中の時間経過管理をツール側で正確に追跡することが困難なため）

- **`/roll [引数]`**（汎用ダイス）
  - 入力例: `/roll 1d100`、`/roll 1d6+1 secret`
  - 処理:
    - 汎用なダイス式を解析し、結果を返す
    - 武器ダメージやミニゲーム、狂気表など自由な用途に対応

### 👤 キャラクター管理系

- **`/char set [URLまたはID]`**: 使用キャラクターの紐付け（DiscordユーザーIDとキャラデータをリンク）
- **`/char status`**: 現在のステータス（HP, MP, SAN, 幸運）を表示
- **`/char update [対象] [増減値]**: ステータスを手動で増減（例: `/char update HP -2`）

### 📅 セッション・ログ管理系

- **`/session start [セッション名]`**: セッションを開始し、これ以降のダイスログを記録状態にする
- **`/session end`**: セッションを終了。記録されたログを集計し、Markdown形式のレポートファイルを生成してDiscordに添付・送信する

---

## 3. ゲームシステム・ダイス処理の仕様（第7版準拠）

### 判定レベル

- **クリティカル**: 出目 1
- **イクストリーム**: 目標値の 1/5 以下
- **ハード**: 目標値の 1/2 以下
- **レギュラー**: 目標値 以下
- **失敗**: 目標値 より大きい
- **ファンブル**:
  - 目標値が 49以下 の場合：出目 96〜100
  - 目標値が 50以上 の場合：出目 100のみ

### ボーナス・ペナルティダイスの処理と表示

10の位（00〜90）のダイスを指定された個数分追加で振り、結果を自動適用する。プレイヤーの没入感を損なわないよう、内部計算だけでなく振ったダイスの内訳をすべて表示する。

**【Discordでの出力イメージ】**

```
@プレイヤー名
🎲 目星 (初期値: 25)
ベース出目：82（10の位: 80, 1の位: 2）
ボーナス出目：10
最終結果：12 ＞ ハード成功！
```

---

## 4. データベース設計（Cloudflare D1）

### 1. `Characters`（キャラクターデータ）

| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| id | TEXT | キャラクターID (Primary Key) |
| user_id | TEXT | 所有者のDiscordユーザーID |
| name | TEXT | キャラクター名 |
| hp | INTEGER | 現在のHP |
| mp | INTEGER | 現在のMP |
| san | INTEGER | 現在のSAN値 |
| luck | INTEGER | 現在の幸運 |
| stats | TEXT | 基本能力値 (JSON文字列。例: {"STR": 50, "DEX": 60, ...}) |
| skills | TEXT | 技能値 (JSON文字列。例: {"目星": 60, "図書館": 70, ...}) |
| updated_at | DATETIME | 最終更新日時 |

### 2. `Active_Characters`（現在使用中のキャラ管理）

| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| user_id | TEXT | DiscordユーザーID (Primary Key) |
| character_id | TEXT | 使用中のキャラクターID |

### 3. `Sessions`（セッション管理）

| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| id | TEXT | セッションID (Primary Key) |
| name | TEXT | セッション名 |
| kp_user_id | TEXT | KPのDiscordユーザーID |
| status | TEXT | "active" または "completed" |
| started_at | DATETIME | セッション開始日時 |
| ended_at | DATETIME | セッション終了日時（nullの場合は未終了） |

### 4. `Dice_Logs`（ダイス履歴・レポート用）

| カラム名 | 型 | 説明 |
| :--- | :--- | :--- |
| id | INTEGER | 連番 (Primary Key, Auto Increment) |
| session_id | TEXT | 紐づくセッションID |
| user_id | TEXT | 振った人のDiscordユーザーID |
| character_name | TEXT | 振ったキャラクター名 |
| skill_name | TEXT | 対象の技能/能力値名 |
| target_value | INTEGER | 目標値 |
| final_dice | INTEGER | 最終的な出目（ボーナス・ペナルティ処理後） |
| result_level | TEXT | 結果（"critical", "extreme", "hard", "regular", "failure", "fumble"） |
| is_secret | BOOLEAN | シークレットダイスだったか否か |
| timestamp | DATETIME | ダイスを振った日時 |

---

## 5. 出力物（セッションレポート）の仕様

`/session end` 実行時に、集計結果をまとめた `.md` ファイルを生成しDiscordに添付する（PDF化は行わない）。ファイル内はマークダウンの `<details>` タグを利用し、プレビュー時に詳細ログを折りたためる構造とする。

### レポートの記載項目

1. **参加者一覧**
   - KPと各PLのキャラクター名

2. **サマリ**
   - プレイヤーごとの判定成功率と内訳（クリティカル数、ファンブル数など）
   - プレイヤーごとの平均出目

3. **プレイヤー別詳細ログ**（時間、技能名、目標値、出目、結果）※折りたたみ式

### 出力形式のイメージ

```markdown
# セッション名

## 参加者

- **KP**：@KPUsername
- **探索者A**：@PlayerAUsername（キャラクター名）
- **探索者B**：@PlayerBUsername（キャラクター名）

## ダイスログ

### サマリ

#### 判定成功率

**@PlayerAUsername（探索者A）**：成功率 65%
- 成功：13回（うちハード 3回、イクストリーム 1回、クリティカル 1回）
- 失敗：7回（うちファンブル 0回）

**@PlayerBUsername（探索者B）**：成功率 30%
- 成功：6回（うちハード 0回、イクストリーム 0回、クリティカル 0回）
- 失敗：14回（うちファンブル 2回）

#### 平均出目

- **探索者A**：42.5
- **探索者B**：78.2

---

### プレイヤー別詳細ログ

<details>
<summary>探索者A のダイスログを開く</summary>

- `19:30`：目星(60) ＞ 出目: 12 ＞ **イクストリーム成功**
- `20:15`：近接戦闘(格闘)(45) ＞ 出目: 40 ＞ **レギュラー成功**
- `21:00`：回避(30) ＞ 出目: 85 ＞ 失敗

</details>

<details>
<summary>探索者B のダイスログを開く</summary>

- `19:35`：図書館(70) ＞ 出目: 98 ＞ **ファンブル**
- `20:30`：説得(50) ＞ 出目: 49 ＞ **レギュラー成功**
- `21:10`：跳躍(20) ＞ 出目: 96 ＞ **ファンブル**

</details>
```

---

## 6. 補足・実装上の注意点

- **シークレットダイスのログ出力**：KPが `/secret` 付きで振ったダイスも `Dice_Logs` には記録するが、レポート生成時に `is_secret = True` のエントリは非表示にする（KPのみがレポートで参照可能にするか、完全に削除するかは運用ルールで決定）
- **キャラクターデータの入力方式**：JUS用のJSON形式、ココフォリア、キャラクターシートPDF等、複数のソースに対応する予定（フェーズ2以降で実装）
- **セッション名**：KPが任意に指定でき、レポートのファイル名にも使用される（日本語対応必須）

## 7. Discord アプリケーションのセットアップ

### 7-1. Discord Developer Portal での作業

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセスしてログイン
2. **「New Application」** をクリックし、アプリ名（例: `CoC Dice Bot`）を入力して作成
3. **「General Information」** タブで以下の値を控える
   - `APPLICATION ID`（= `DISCORD_APPLICATION_ID`）
   - `PUBLIC KEY`（= `DISCORD_PUBLIC_KEY`）
4. **「Bot」** タブを開き **「Add Bot」** をクリック
   - `TOKEN` を「Reset Token」で発行し、安全な場所に保存（**一度しか表示されない**）
   - これが `DISCORD_BOT_TOKEN`
   - 「Privileged Gateway Intents」は今回不要（Interactions Endpoint方式のため）
5. **「OAuth2 → URL Generator」** タブを開く
   - **Scopes**: `bot` と `applications.commands` にチェック
   - **Bot Permissions**: 以下にチェック
     | 権限 | 用途 |
     |:---|:---|
     | `Send Messages` | コマンド結果の返信 |
     | `Attach Files` | `/session end` 時のレポートファイル（.md）送信 |
   - 生成されたURLをブラウザで開き、Botを導入したいサーバーを選択してインストール

---

## 8. Cloudflare のセットアップ

### 8-1. D1 データベースの作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 左メニューの **「Workers & Pages」→「D1 SQL Database」** を開く
3. **「Create」** をクリックし、データベース名に `coc-dice-bot-db` を入力して作成
4. 作成後の概要ページに表示される **「Database ID」** を控える

### 8-2. wrangler.toml への反映

`dice-bot/wrangler.toml` の `database_id` に控えた値を記入する：

```toml
[[d1_databases]]
binding       = "DB"
database_name = "coc-dice-bot-db"
database_id   = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← ここに貼り付け
```

### 8-3. スキーマの適用

D1 データベースの概要ページで **「Console」** タブを開き、以下のSQLを**1つずつ**貼り付けて「実行」する。

**① Characters テーブル**
```sql
CREATE TABLE IF NOT EXISTS Characters (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, hp INTEGER NOT NULL DEFAULT 0, mp INTEGER NOT NULL DEFAULT 0, san INTEGER NOT NULL DEFAULT 0, luck INTEGER NOT NULL DEFAULT 0, stats TEXT NOT NULL DEFAULT '{}', skills TEXT NOT NULL DEFAULT '{}', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
```

**② Active_Characters テーブル**
```sql
CREATE TABLE IF NOT EXISTS Active_Characters (user_id TEXT PRIMARY KEY, character_id TEXT NOT NULL, FOREIGN KEY (character_id) REFERENCES Characters(id));
```

**③ Sessions テーブル**
```sql
CREATE TABLE IF NOT EXISTS Sessions (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, name TEXT NOT NULL, kp_user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at DATETIME);
```

**④ Dice_Logs テーブル**
```sql
CREATE TABLE IF NOT EXISTS Dice_Logs (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, user_id TEXT NOT NULL, character_name TEXT NOT NULL, skill_name TEXT NOT NULL, target_value INTEGER NOT NULL, final_dice INTEGER NOT NULL, result_level TEXT NOT NULL, is_secret INTEGER NOT NULL DEFAULT 0, timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (session_id) REFERENCES Sessions(id));
```

**⑤ インデックス**
```sql
CREATE INDEX IF NOT EXISTS idx_dice_logs_session ON Dice_Logs(session_id); CREATE INDEX IF NOT EXISTS idx_dice_logs_user ON Dice_Logs(user_id); CREATE INDEX IF NOT EXISTS idx_characters_user ON Characters(user_id); CREATE INDEX IF NOT EXISTS idx_sessions_guild ON Sessions(guild_id, status);
```

### 8-4. Cloudflare API トークンの取得

GitHub Actions から Cloudflare にデプロイするために必要なトークンを発行する。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) の右上のアイコン → **「My Profile」** を開く
2. 左メニューの **「API Tokens」** → **「Create Token」** をクリック
3. **「Edit Cloudflare Workers」** テンプレートの **「Use template」** をクリック
4. 内容はデフォルトのままで **「Continue to summary」→「Create Token」** をクリック
5. 表示されたトークンをコピーして安全な場所に保存（**一度しか表示されない**）

取得したトークンを GitHub の Environment secrets に登録する：

> Settings → Environments → production → Environment secrets → `CLOUDFLARE_API_TOKEN` を追加

### 8-5. DISCORD_BOT_TOKEN のシークレット登録

`DISCORD_BOT_TOKEN` は GitHub Actions の deploy 時に自動で Cloudflare に登録されるため、**GitHub の Environment secrets（production）** に登録するだけで OK。

> Settings → Environments → production → Environment secrets → `DISCORD_BOT_TOKEN` を追加

---

## 9. スラッシュコマンドの登録

スラッシュコマンドはDiscord APIに事前登録が必要。登録は**デプロイとは別の1回限りの操作**。

```bash
# コマンド登録スクリプトを実行（要: DISCORD_BOT_TOKEN と DISCORD_APPLICATION_ID）
npm run register
```

- **グローバル登録**（全サーバー対象）: 反映まで最大1時間かかる
- **ギルド（サーバー）登録**（特定サーバーのみ）: 即時反映。開発・テスト中はこちら推奨

> `register-commands.ts` でギルドIDを指定することでサーバー限定登録に切り替えられる。

---

## 10. Workerのデプロイ

```bash
# 本番デプロイ
npm run deploy
# → デプロイ成功後、以下のようなURLが発行される
# https://coc-dice-bot.<あなたのサブドメイン>.workers.dev
```

---

## 11. Discord との接続（Interactions Endpoint URL の設定）

これが**CloudflareとDiscordを繋ぐ最後の手順**。

1. [Discord Developer Portal](https://discord.com/developers/applications) を開き、作成したアプリを選択
2. **「General Information」** タブの **「Interactions Endpoint URL」** に、デプロイされたWorkerのURLを入力：
   ```
   https://coc-dice-bot.<あなたのサブドメイン>.workers.dev
   ```
3. **「Save Changes」** をクリック

**検証の仕組み**: 保存時にDiscordがそのURLへPINGリクエストを送信し、Workerが正しく署名検証して `{"type":1}` を返せば検証成功。失敗した場合は「The specified interactions endpoint URL could not be verified.」というエラーになる。

> ✅ 検証が通れば設定完了。以後DiscordでスラッシュコマンドをタイプするとWorkerに直接POSTされる。

---

## 12. ローカル開発

Cloudflare Workers はサーバーレスのためローカル起動しても外部からアクセスできない。  
Discordからのリクエストを受け取るには **ngrok** でトンネルを張る。

```bash
# ターミナル①: Workerをローカル起動
npm run dev
# → http://localhost:8787 で起動

# ターミナル②: ngrokでトンネル作成
ngrok http 8787
# → https://xxxx-xx-xx-xxx-xx.ngrok.io のような公開URLが発行される
```

発行されたngrokのURLを「Interactions Endpoint URL」に一時的に設定すれば、ローカルで動作確認できる。  
**本番デプロイ後はWorkerのURLに戻す**こと。

---

## 13. 全体フロー図

```
Discordユーザー
    │  スラッシュコマンド入力（例: /cc 目星）
    ▼
Discord サーバー
    │  POST リクエスト（JSON payload）
    │  ヘッダーに署名情報（x-signature-ed25519, x-signature-timestamp）を付与
    ▼
Cloudflare Worker  ←─── wrangler deploy でデプロイ済み
    │  1. 署名検証（DISCORD_PUBLIC_KEY で改ざん検知）
    │  2. コマンドルーティング
    │  3. D1データベースへのアクセス
    │  4. レスポンス生成
    ▼
Discord サーバー
    │  メッセージ表示
    ▼
Discordユーザー
```

---

## 必要な環境変数・シークレット一覧

| 変数名 | 取得場所 | 管理方法 |
|:---|:---|:---|
| `DISCORD_PUBLIC_KEY` | Developer Portal → General Information | `wrangler.toml` の `[vars]` |
| `DISCORD_APPLICATION_ID` | Developer Portal → General Information | `wrangler.toml` の `[vars]` |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Token | `wrangler secret put` |
| `DB`（D1バインディング） | `wrangler d1 create` 後に発行 | `wrangler.toml` の `[[d1_databases]]` |
