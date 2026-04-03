<img width="256" height="256" alt="Gemini_Generated_Image_iue7z5iue7z5iue7" src="https://github.com/user-attachments/assets/d8e0e346-5add-4ead-bcbf-b2dfe9da4d4e" />

# CoC Dice Bot — 開発者向けドキュメント

クトゥルフ神話TRPG（第6版・第7版）対応の Discord セッション管理 Bot。

> セットアップ手順・コマンドの使い方は [USER-GUIDE.md](./USER-GUIDE.md) を参照。

---

## システム構成

完全無料で運用できるサーバーレス構成。

| 役割 | サービス |
|:---|:---|
| Bot エンドポイント | Cloudflare Workers |
| データベース | Cloudflare D1（SQLite ベース） |
| CI/CD | GitHub Actions |

Discord の Interactions Endpoint 方式で動作するため、Bot がゲートウェイに常時接続する必要がなく、リクエストがあったときだけ Worker が起動する。

---

## ローカル開発

Cloudflare Workers はサーバーレスのためローカル起動しても外部から直接アクセスできない。Discord からのリクエストを受け取るには **ngrok** でトンネルを張る。

```bash
# ターミナル①: Worker をローカル起動
npm run dev
# → http://localhost:8787 で起動

# ターミナル②: ngrok でトンネル作成
ngrok http 8787
# → https://xxxx-xx-xx-xxx-xx.ngrok.io のような公開 URL が発行される
```

発行された ngrok の URL を Discord Developer Portal の「Interactions Endpoint URL」に一時設定すれば動作確認できる。本番デプロイ後は Worker の URL に戻す。

### テスト

```bash
npm test
```

---

## デプロイ

GitHub Actions (`dice-bot-deploy.yml`) が `main` ブランチへの push 時に自動デプロイする。

手動でデプロイする場合:

```bash
npm run deploy
```

---

## データベース設計（Cloudflare D1）

### `Characters`（キャラクターデータ）

| カラム | 型 | 説明 |
|:---|:---|:---|
| `id` | TEXT | キャラクター ID（Primary Key） |
| `user_id` | TEXT | 所有者の Discord ユーザー ID |
| `game` | TEXT | ゲームシステム（`'coc7'` \| `'coc6'`） |
| `name` | TEXT | キャラクター名 |
| `hp` | INTEGER | 現在の HP |
| `mp` | INTEGER | 現在の MP |
| `san` | INTEGER | 現在の SAN 値 |
| `luck` | INTEGER | 現在の幸運 |
| `stats` | TEXT | 基本能力値（JSON）例: `{"STR":50,"DEX":60,...}` |
| `skills` | TEXT | 技能値（JSON）例: `{"目星":60,"図書館":70,...}` |
| `updated_at` | DATETIME | 最終更新日時 |

### `Active_Characters`（使用中キャラ管理）

| カラム | 型 | 説明 |
|:---|:---|:---|
| `user_id` | TEXT | Discord ユーザー ID（Primary Key） |
| `character_id` | TEXT | 使用中のキャラクター ID |

### `Sessions`（セッション管理）

| カラム | 型 | 説明 |
|:---|:---|:---|
| `id` | TEXT | セッション ID（Primary Key） |
| `guild_id` | TEXT | Discord サーバー ID |
| `name` | TEXT | セッション名 |
| `kp_user_id` | TEXT | KP の Discord ユーザー ID |
| `status` | TEXT | `'active'` \| `'completed'` |
| `system` | TEXT | ゲームシステム（`'coc7'` \| `'coc6'`） |
| `started_at` | DATETIME | 開始日時 |
| `ended_at` | DATETIME | 終了日時（進行中は NULL） |

### `Dice_Logs`（ダイス履歴）

| カラム | 型 | 説明 |
|:---|:---|:---|
| `id` | INTEGER | 連番（Primary Key, Auto Increment） |
| `session_id` | TEXT | 紐づくセッション ID |
| `user_id` | TEXT | 振った人の Discord ユーザー ID |
| `character_name` | TEXT | 振ったキャラクター名 |
| `skill_name` | TEXT | 対象の技能・能力値名 |
| `target_value` | INTEGER | 目標値 |
| `final_dice` | INTEGER | 最終出目（ボーナス・ペナルティ適用後） |
| `result_level` | TEXT | 判定結果（下記参照） |
| `is_secret` | INTEGER | シークレットダイスか（0/1） |
| `timestamp` | DATETIME | 実行日時 |

`result_level` の値:
- 第7版: `critical` / `extreme` / `hard` / `regular` / `failure` / `fumble`
- 第6版: `critical` / `special` / `success` / `failure` / `fumble`

---

## 全体フロー

```
Discord ユーザー
    │  スラッシュコマンド入力（例: /cc 目星）
    ▼
Discord サーバー
    │  POST リクエスト（署名付き JSON）
    ▼
Cloudflare Worker
    │  1. Ed25519 署名検証
    │  2. コマンドルーティング
    │  3. D1 へのアクセス（セッション・キャラクター取得）
    │  4. ダイスロール・判定
    │  5. レスポンス生成
    ▼
Discord サーバー → ユーザーへ表示
```

---

## 必要な環境変数・シークレット

| 変数名 | 取得場所 | 管理方法 |
|:---|:---|:---|
| `DISCORD_PUBLIC_KEY` | Developer Portal → General Information | `wrangler.toml` の `[vars]` |
| `DISCORD_APPLICATION_ID` | Developer Portal → General Information | `wrangler.toml` の `[vars]` |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Token | GitHub Environment secret → Worker secret へ自動登録 |
| `DB`（D1 バインディング） | D1 作成後に発行される Database ID | `wrangler.toml` の `[[d1_databases]]` |

---

## ゲームシステム別 ダイス仕様

### 第7版（CoC7th）

| 判定レベル | 条件 |
|:---|:---|
| クリティカル | 出目 = 1 |
| イクストリーム | 出目 ≤ 目標値 / 5（切り捨て） |
| ハード | 出目 ≤ 目標値 / 2（切り捨て） |
| レギュラー | 出目 ≤ 目標値 |
| 失敗 | 出目 > 目標値 |
| ファンブル | 目標値 ≤ 49 → 出目 96〜100、目標値 ≥ 50 → 出目 100 のみ |

ボーナス・ペナルティダイス: 10 の位ダイスを追加で振り、ボーナスは最小値・ペナルティは最大値を採用。

### 第6版（CoC6th）

| 判定レベル | 条件 |
|:---|:---|
| クリティカル | 出目 = 1 |
| スペシャル | 出目 ≤ 目標値 / 5（切り捨て） |
| 成功 | 出目 ≤ 目標値 |
| 失敗 | 出目 > 目標値 |
| ファンブル | 出目 ≥ 96（目標値によらず固定） |

ボーナス・ペナルティダイスは使用しない。
