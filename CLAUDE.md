# ArsChat

Electron + React + TypeScript デスクトップ AI チャットアプリ。

## Commands

```bash
npm run dev           # 開発サーバー起動 (main + renderer)
npm run build         # プロダクションビルド
npm run lint          # Biome リントチェック
npm run lint:fix      # Biome 自動修正
npm run format        # Biome フォーマット
npm run typecheck     # TypeScript 型チェック (renderer + main)
```

## Structure

- `src/main/` — Electron メインプロセス (`tsconfig.main.json`)
- `src/renderer/` — React UI (`tsconfig.json`, Vite)
- `src/shared/` — 共有型定義
- `doc/` — 拡張機能・スキル・MCP 等のドキュメント

## Rules

- リンター設定 (`biome.json`) を変更しない — コードを修正せよ
- `dist/` 配下を直接編集しない
- `tsconfig*.json` を変更する前に確認を取る
- `any` 型を避ける（`biome.json` で warn 設定済み）
- 新規ファイルは既存のディレクトリ構造に従う
