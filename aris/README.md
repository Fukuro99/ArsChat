# ARIA — AI Responsive Interactive Assistant

デスクトップ常駐型AIアシスタントアプリケーション。

## セットアップ

### 前提条件

- Node.js 18以上
- pnpm（推奨）または npm

### インストール

```bash
# 依存パッケージのインストール
pnpm install

# デフォルトアイコンの生成
node scripts/generate-icons.js

# .envファイルの作成
cp .env.example .env
# .env を編集してAPIキーを設定
```

### 開発

```bash
# 開発モードで起動（Vite + Electron）
pnpm dev
```

### ビルド

```bash
# プロダクションビルド
pnpm build

# インストーラー作成
pnpm dist
```

## ホットキー

| ショートカット | 動作 |
|---|---|
| `Ctrl+Shift+A` | ARIAウィンドウの表示/非表示 |

## 技術スタック

- **Electron** — デスクトップアプリフレームワーク
- **React + TypeScript** — UIフレームワーク
- **Tailwind CSS** — スタイリング
- **Claude API** — AI応答エンジン
- **SQLite** — ローカルデータ保存
