**[English](en/extension-development.md) | 日本語**

# 拡張機能 開発ガイド

ArsChat の拡張機能システムは GitHub リポジトリをベースとした npm-like なプラグイン配布方式を採用しています。
拡張機能は **Main プロセス** (Node.js) と **Renderer プロセス** (React) の両方にコードを配置できます。

---

## 目次

- [仕組み](#仕組み)
- [ディレクトリ構成](#ディレクトリ構成)
- [package.json マニフェスト](#packagejson-マニフェスト)
- [Renderer エントリポイント](#renderer-エントリポイント)
- [Main エントリポイント](#main-エントリポイント)
- [パーミッション](#パーミッション)
- [Hello World サンプル](#hello-world-サンプル)
- [ビルド & インストール](#ビルド--インストール)
- [データ永続化](#データ永続化)

---

## 仕組み

1. ユーザーが Extension Manager に GitHub リポジトリの URL を貼り付ける
2. ArsChat がリポジトリを `%APPDATA%/ArsChat/arschat-data/extensions/<name>/` に clone
3. `package.json` の `arschat` フィールドを読み込み、マニフェストを解析
4. 宣言されたパーミッションに基づいて `ExtensionContext` オブジェクトを構築
5. Main エントリ (`main.js`) を `require()` で読み込み、`activate(context)` を呼び出す
6. Renderer エントリ (`renderer.js`) をサイドバーの各ページ iframe 内で読み込む

---

## ディレクトリ構成

```
my-extension/
├── package.json        # マニフェスト（必須）
├── main.js             # Main プロセスエントリ（任意）
└── dist/
    └── renderer.js     # Renderer プロセスエントリ（必須）
```

ビルドツールを使う場合はソース構成は自由です。出力ファイルのパスを `package.json` で指定します。

---

## package.json マニフェスト

拡張機能の `package.json` には標準フィールドに加え `arschat` フィールドが必要です。

```json
{
  "name": "arschat-ext-example",
  "version": "1.0.0",
  "description": "サンプル拡張機能",
  "arschat": {
    "displayName": "Example Extension",
    "description": "ArsChat 拡張機能のサンプルです。",
    "icon": "🧩",
    "permissions": ["ai:stream", "fs:read"],
    "main": "main.js",
    "renderer": "dist/renderer.js",
    "pages": [
      {
        "id": "main-page",
        "title": "Example",
        "icon": "🧩",
        "sidebar": true
      }
    ],
    "settings": [
      {
        "key": "apiEndpoint",
        "type": "string",
        "label": "API エンドポイント",
        "default": "https://example.com/api"
      }
    ]
  }
}
```

### `arschat` フィールド定義

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `displayName` | string | ✓ | Extension Manager に表示される名前 |
| `description` | string | ✓ | 拡張機能の説明文 |
| `icon` | string | ✓ | 絵文字 または Lucide アイコン名 |
| `permissions` | string[] | ✓ | 必要なパーミッション一覧（[詳細](#パーミッション)） |
| `main` | string | — | Main プロセスエントリファイルのパス |
| `renderer` | string | ✓ | Renderer プロセスエントリファイルのパス |
| `pages` | Page[] | — | サイドバーに表示するページ一覧 |
| `settings` | Setting[] | — | 設定パネルのフィールド定義 |

### `pages` フィールド定義

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | ページの一意識別子（英数字・ハイフン） |
| `title` | string | タブ・サイドバーに表示されるタイトル |
| `icon` | string | 絵文字 または Lucide アイコン名 |
| `sidebar` | boolean | `true` でサイドバーのナビゲーションに表示 |

---

## Renderer エントリポイント

`renderer.js` は各ページ用の HTML を返すオブジェクトをデフォルトエクスポートします。

```javascript
// dist/renderer.js

const pages = {
  // ページ ID ごとに HTML 文字列を返す関数
  'main-page': (context) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; padding: 16px; color: #e5e7eb; background: #1e1e2e; }
        button { padding: 8px 16px; background: #7c3aed; color: white; border: none; border-radius: 4px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>Hello from Extension!</h1>
      <button id="btn">AI に挨拶する</button>
      <div id="response"></div>
      <script>
        // context はシリアライズされたオブジェクトなので、IPC 経由で操作します
        // window.__ARSCHAT_CONTEXT__ からコンテキストを取得
        const ctx = window.__ARSCHAT_CONTEXT__;

        document.getElementById('btn').addEventListener('click', async () => {
          const div = document.getElementById('response');
          div.textContent = '...';
          const result = await ctx.ai.send({ messages: [{ role: 'user', content: 'Hello!' }] });
          div.textContent = result.content;
        });
      </script>
    </body>
    </html>
  `
};

module.exports = { pages };
```

> **補足:** Renderer は iframe 内に直接 HTML として読み込まれます。
> React/Vue などのフレームワークを使う場合は、ビルドして単一の `renderer.js` にバンドルしてください。

---

## Main エントリポイント

Main エントリは Node.js 環境で実行されます。`activate(context)` をエクスポートします。

```javascript
// main.js

/**
 * @param {import('./types').ExtensionContext} context
 */
function activate(context) {
  context.log.info('Extension activated!');

  // ライフサイクルフックの購読（hooks:observe パーミッションが必要）
  const unsubscribe = context.hooks.on('chat:afterResponse', (payload) => {
    context.log.debug(`Response received: ${payload.response.substring(0, 50)}...`);
  });

  // 拡張機能の無効化時にクリーンアップ
  return {
    deactivate() {
      unsubscribe();
      context.log.info('Extension deactivated.');
    }
  };
}

module.exports = { activate };
```

---

## パーミッション

拡張機能が使用する API に応じて `permissions` に宣言が必要です。
宣言されていないパーミッションを使おうとすると `PermissionDeniedError` が発生します。

| パーミッション | リスク | 使用可能な API |
|---|---|---|
| `ai:stream` | 低 | `context.ai.stream()` |
| `ai:send` | 低 | `context.ai.send()` |
| `ai:config-read` | 低 | `context.ai.getProviderInfo()` |
| `session:read` | 中 | チャット履歴の読み取り |
| `session:write` | 中 | チャット履歴の書き込み |
| `settings:read` | 中 | アプリ設定の読み取り |
| `settings:write` | 高 | アプリ設定の書き込み |
| `fs:read` | 中 | `context.fs.readFile()` `context.fs.listDir()` `context.fs.stat()` |
| `fs:write` | 高 | `context.fs.writeFile()` `context.fs.deleteFile()` |
| `shell:execute` | **最高** | `context.shell.exec()` `context.shell.spawn()` |
| `clipboard:read` | 中 | `context.clipboard.read()` `context.clipboard.readImage()` |
| `clipboard:write` | 低 | `context.clipboard.write()` `context.clipboard.writeImage()` |
| `notification` | 低 | デスクトップ通知の表示 |
| `window:create` | 中 | `context.window.createWindow()` |
| `hooks:observe` | 低 | `context.hooks.on()` |

> **注意:** `shell:execute` はシステムへのフルアクセスを意味します。
> ユーザーはインストール時にパーミッション一覧を確認してから承認します。

---

## Hello World サンプル

最小構成の拡張機能です。

### `package.json`

```json
{
  "name": "arschat-ext-hello",
  "version": "1.0.0",
  "description": "Hello World サンプル拡張",
  "arschat": {
    "displayName": "Hello World",
    "description": "シンプルなサンプル拡張機能です。",
    "icon": "👋",
    "permissions": ["ai:send"],
    "renderer": "renderer.js",
    "pages": [
      {
        "id": "hello",
        "title": "Hello",
        "icon": "👋",
        "sidebar": true
      }
    ]
  }
}
```

### `renderer.js`

```javascript
const pages = {
  hello: (context) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { background: #1e1e2e; color: #cdd6f4; font-family: sans-serif; padding: 24px; }
        h1 { color: #cba6f7; }
        button { background: #7c3aed; color: white; border: none; padding: 10px 20px;
                 border-radius: 6px; cursor: pointer; font-size: 14px; }
        #out { margin-top: 16px; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h1>👋 Hello World</h1>
      <button id="greet">AI に挨拶する</button>
      <div id="out"></div>
      <script>
        const ctx = window.__ARSCHAT_CONTEXT__;
        document.getElementById('greet').onclick = async () => {
          document.getElementById('out').textContent = '...';
          const res = await ctx.ai.send({
            messages: [{ role: 'user', content: 'こんにちは！自己紹介してください。' }]
          });
          document.getElementById('out').textContent = res.content;
        };
      </script>
    </body>
    </html>
  `
};

module.exports = { pages };
```

---

## ビルド & インストール

### シンプルな構成（ビルドなし）

上記 Hello World のように、`renderer.js` を直接書けばビルド不要です。

### バンドラーを使う場合

esbuild や Vite でバンドルして単一ファイルに出力します。

```bash
# esbuild の例
npx esbuild src/renderer.tsx --bundle --outfile=dist/renderer.js --platform=browser
```

### インストール

1. GitHub にリポジトリを push
2. ArsChat の Extension Manager を開く（サイドバーのパズルアイコン）
3. リポジトリ URL を入力して「インストール」をクリック
4. パーミッション確認ダイアログを確認して承認

### ローカル開発

開発中はローカルリポジトリを直接指定することもできます（`file://` パス対応）。

---

## データ永続化

拡張機能専用のデータディレクトリが用意されています。

```javascript
// context.extension.dataDir にアクセス
const dataPath = `${context.extension.dataDir}/config.json`;

// 書き込み（fs:write パーミッションが必要）
await context.fs.writeFile(dataPath, JSON.stringify({ key: 'value' }));

// 読み込み（fs:read パーミッションが必要）
const raw = await context.fs.readFile(dataPath);
const config = JSON.parse(raw);
```

データは `%APPDATA%/ArsChat/arschat-data/extensions/<extension-id>/data/` に保存されます。

---

## 関連ドキュメント

- [Extension API Reference](extension-api.md) — `ExtensionContext` の全 API
- [Hook API](hooks.md) — ライフサイクルイベント一覧
