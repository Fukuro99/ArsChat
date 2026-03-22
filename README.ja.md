**[English](README.md) | 日本語**

# ArsChat

**ArsChat** は Claude API を使ったデスクトップ常駐型 AI アシスタントです。
グローバルホットキーで瞬時に呼び出せます。

> **注意:** このプロジェクトは開発中です。機能は変更される場合があります。

---

## 機能

- **Claude API 連携** — ストリーミング応答・マルチセッション対応
- **拡張機能システム** — GitHub リポジトリからインストール可能なプラグイン（パーミッションモデル付き）
- **スキル** — Markdown ファイルで定義できる AI プロンプトテンプレート
- **MCP サポート** — Model Context Protocol サーバーへの接続（stdio / HTTP/SSE）
- **メモリ (MemOS)** — ユーザーメモの永続化 + 過去の会話に対するセマンティック検索
- **Interactive UI** — AI がチャット内に動的な UI コンポーネント（フォーム・スライダー・ボタン等）を生成
- **ターミナル統合** — xterm.js による組み込みターミナル
- **マルチペルソナ** — 設定・スキルを独立して持つ複数の AI ペルソナ
- **グローバルホットキー** — `Ctrl+Shift+A` でどこからでも表示/非表示

---

## インストール

### 前提条件

- Node.js 18 以上
- npm

### セットアップ

```bash
git clone https://github.com/your-username/ArsChat.git
cd ArsChat
npm install

# デフォルトアイコンの生成
node scripts/generate-icons.js

# 環境ファイルの作成
cp .env.example .env
```

`.env` を編集して Anthropic API キーを設定してください:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 開発

```bash
npm run dev
```

### プロダクションビルド

```bash
npm run build
npm run dist   # インストーラー作成（Windows: NSIS）
```

---

## キーボードショートカット

| ショートカット | 動作 |
|---|---|
| `Ctrl+Shift+A` | ウィンドウの表示 / 非表示 |

---

## 拡張機能システム

ArsChat は GitHub ベースの拡張機能システムをサポートしています。拡張機能でできること:

- カスタムサイドバーページ（React UI）の追加
- AI API へのアクセス（ストリーミング・単発メッセージ）
- ファイルシステムの読み書き・シェルコマンドの実行
- Hook API によるライフサイクルイベントの観察

Extension Manager パネル（サイドバーのパズルアイコン）から GitHub リポジトリ URL を貼り付けてインストールできます。

詳細は [doc/extension-development.md](doc/extension-development.md) を参照してください。

---

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [拡張機能 開発ガイド](doc/extension-development.md) | 拡張機能のビルドとインストール方法 |
| [Extension API リファレンス](doc/extension-api.md) | `ExtensionContext` の全 API |
| [Hook API](doc/hooks.md) | 拡張機能向けライフサイクルイベント |
| [スキル](doc/skills.md) | AI スキルテンプレートの作成方法 |
| [MCP サポート](doc/mcp.md) | Model Context Protocol サーバーの接続 |
| [Interactive UI](doc/interactive-ui.md) | AI による動的 UI コンポーネント |

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| デスクトップ | Electron 33 |
| UI | React 18 + TypeScript + Tailwind CSS |
| ビルド | Vite 6 |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| MCP | `@modelcontextprotocol/sdk` |
| ストレージ | SQLite (`better-sqlite3`) + `electron-store` |
| エディタ | Monaco Editor |
| ターミナル | xterm.js + node-pty |
| 数式 | KaTeX |

---

## ライセンス

MIT
