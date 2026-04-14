# Project Rules

## Language

**ユーザーとのコミュニケーションは常に日本語で行うこと。**

## PR Management

**PRを作成する際は、既存のPRを更新せず、必ず新しいPRを作成すること。**

- ユーザーは毎回PRをマージしてからローカルでビルドをインストールし動作確認を行う
- 既存のPRが open/closed どちらの状態でも、新しい変更には新しいPRを作ること
- "update existing PR" や "amend PR" は絶対に行わない

## Documentation Maintenance

**コマンドを追加・変更する際は、必ず以下を同時に更新すること。**

- `dice-bot/src/commands/help.ts` — `/dicehelp` コマンドのボット内ヘルプ
- `dice-bot/USER-GUIDE.md` — ユーザー向けガイド

実装と上記ドキュメントを常に一致させること。コマンド追加後にガイドのみ・ヘルプのみ更新するのは不可。

## Test-Driven Development

**コードを実装する前に、必ずテストを先に書くこと。**

- 新機能・仕様変更・バグ修正を行う際は、実装前にテストを追加または更新する
- 実装後は必ずローカルでテストを実行し、全テストが通ることを確認してからコミットする
- テストコマンド: `cd dice-bot && npx vitest run`
- シグネチャ変更（引数追加など）を行った場合は、既存テストもあわせて修正する
