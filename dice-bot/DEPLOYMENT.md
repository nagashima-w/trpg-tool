# デプロイ・Discord連携手順

> 仕様書（SPECIFICATION.md）の補足ドキュメント。  
> Cloudflare WorkersとDiscordを実際に繋げるまでの全手順を記載する。

---

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
   - **Bot Permissions**: `Send Messages`、`Use Slash Commands` にチェック
   - 生成されたURLをブラウザで開き、Botを導入したいサーバーを選択してインストール

---

## 8. Cloudflare のセットアップ

### 8-1. Wrangler CLIのインストール・ログイン

```bash
npm install -g wrangler
wrangler login   # ブラウザが開きCloudflareアカウントと連携
```

### 8-2. D1 データベースの作成

```bash
# D1データベースを作成（出力されたdatabase_idをwrangler.tomlに記載）
wrangler d1 create coc-dice-bot-db

# スキーマを流す（本番）
wrangler d1 execute coc-dice-bot-db --file=./schema.sql

# スキーマを流す（ローカル開発用）
wrangler d1 execute coc-dice-bot-db --local --file=./schema.sql
```

出力例:
```
✅ Successfully created DB 'coc-dice-bot-db' in region APAC
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  ← wrangler.tomlに記載
```

### 8-3. シークレットの登録

環境変数のうち機密情報は `wrangler secret` で登録する（コードやwrangler.tomlに書かない）。

```bash
wrangler secret put DISCORD_BOT_TOKEN
# → プロンプトが表示されるので貼り付けてEnter
```

`wrangler.toml` の `[vars]` には非機密の値だけを記載：

```toml
[vars]
DISCORD_PUBLIC_KEY      = "取得したPUBLIC_KEY"
DISCORD_APPLICATION_ID  = "取得したAPPLICATION_ID"
```

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
