# ArsChat Extension System 設計書

## 概要

外部GitHubリポジトリをインストールし、ArsChatに**新しい画面・機能そのもの**を追加できるプラグインアーキテクチャ。
既存のスキルやMCPとは異なり、アプリのUI・ルーティング・AI呼び出し基盤に深くアクセスできる。

### 想定される拡張の例

| 拡張名 | 内容 |
|--------|------|
| Claude Code風ターミナル | AI呼び出し + コマンド実行の専用画面 |
| ファイルエディタ | Monaco Editor搭載のコード編集画面 |
| ナレッジベース | RAG用ドキュメント管理画面 |
| ボイスチャット | 音声入出力の専用インターフェース |
| プロンプトライブラリ | プロンプトテンプレート管理・共有画面 |
| ダッシュボード | トークン使用量・セッション統計の可視化画面 |

### スキル/MCP との違い

| | スキル | MCP | **拡張機能** |
|---|---|---|---|
| 追加するもの | AIへの指示テキスト | AIが使うツール | **画面・機能そのもの** |
| UI変更 | なし | なし | **専用ページ追加、サイドバー変更** |
| AI呼び出し | AIが判断 | AIが判断 | **拡張のコードが自由に呼び出し** |
| 実行環境 | Markdownファイル | 外部プロセス | **アプリ内（main + renderer）** |
| 配布 | ファイルコピー | サーバー設定 | **GitHubリポジトリ** |

---

## ディレクトリ構造

### インストール先

```
%APPDATA%/ArsChat/arschat-data/
├── settings.json
├── sessions/
├── extensions/                    # 【新規】
│   ├── registry.json             # インストール済み拡張の一覧
│   ├── arschat-ext-claude-code/  # git clone されたリポジトリ
│   │   ├── package.json          # 拡張マニフェスト（npm互換）
│   │   ├── dist/                 # ビルド済み成果物
│   │   │   ├── main.js           # Main Process エントリ
│   │   │   └── renderer.js       # Renderer エントリ（React コンポーネント）
│   │   └── ...
│   ├── arschat-ext-editor/
│   │   ├── package.json
│   │   ├── dist/
│   │   └── ...
│   └── ...
```

### registry.json

```json
{
  "extensions": [
    {
      "id": "arschat-ext-claude-code",
      "source": "https://github.com/user/arschat-ext-claude-code",
      "version": "1.0.0",
      "installedAt": "2026-03-16T00:00:00Z",
      "enabled": true,
      "permissions": ["ai:stream", "ai:send", "shell:execute", "fs:read", "fs:write"]
    }
  ]
}
```

---

## 拡張マニフェスト（package.json）

拡張は npm パッケージとして構成する。`arschat` フィールドに拡張固有の設定を記述。

```json
{
  "name": "arschat-ext-claude-code",
  "version": "1.0.0",
  "description": "Claude Code風のAIコーディングアシスタント",
  "author": "user",
  "license": "MIT",
  "arschat": {
    "displayName": "Claude Code",
    "icon": "terminal",
    "minAppVersion": "1.0.0",

    "permissions": [
      "ai:stream",
      "ai:send",
      "shell:execute",
      "fs:read",
      "fs:write"
    ],

    "main": "dist/main.js",
    "renderer": "dist/renderer.js",

    "pages": [
      {
        "id": "claude-code",
        "title": "Claude Code",
        "icon": "terminal",
        "sidebar": true
      }
    ],

    "settings": [
      {
        "id": "claude-code-settings",
        "title": "Claude Code 設定"
      }
    ]
  },

  "scripts": {
    "build": "esbuild src/main.ts --bundle --platform=node --outfile=dist/main.js && esbuild src/renderer.tsx --bundle --platform=browser --outfile=dist/renderer.js --external:react --external:react-dom",
    "dev": "npm run build -- --watch"
  },
  "devDependencies": {
    "@anthropic-ai/arschat-extension-api": "^1.0.0",
    "esbuild": "^0.20.0"
  }
}
```

### マニフェストフィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `arschat.displayName` | Yes | UI表示名 |
| `arschat.icon` | Yes | サイドバーアイコン（emoji or Lucide icon名） |
| `arschat.permissions` | Yes | 要求する権限 |
| `arschat.main` | No | Main Process エントリ（Node.js） |
| `arschat.renderer` | Yes | Renderer エントリ（React コンポーネント export） |
| `arschat.pages` | No | 登録するページ |
| `arschat.settings` | No | 設定画面に追加するパネル |
| `arschat.minAppVersion` | No | 必要な最低ArsChatバージョン |

---

## パーミッションシステム

拡張がアクセスできるAPIを制御する。インストール時にユーザーに許可を求める。

### パーミッション一覧

| 権限 | 説明 | リスク |
|------|------|--------|
| `ai:stream` | AIストリーミング呼び出し | 低（トークン消費） |
| `ai:send` | AI単発呼び出し | 低 |
| `ai:config-read` | プロバイダ設定の読み取り（APIキー除く） | 低 |
| `session:read` | セッション履歴の読み取り | 中 |
| `session:write` | セッション作成・編集 | 中 |
| `settings:read` | アプリ設定の読み取り（APIキー除く） | 低 |
| `settings:write` | アプリ設定の変更 | 高 |
| `shell:execute` | シェルコマンド実行 | **高** |
| `fs:read` | ファイル読み取り | 中 |
| `fs:write` | ファイル書き込み | **高** |
| `clipboard:read` | クリップボード読み取り | 中 |
| `clipboard:write` | クリップボード書き込み | 低 |
| `notification` | デスクトップ通知 | 低 |
| `window:create` | 新しいウィンドウの作成 | 中 |

### 権限グループ（ショートカット）

```
"ai"       → ["ai:stream", "ai:send", "ai:config-read"]
"storage"  → ["fs:read", "fs:write"]
"full"     → 全権限（警告付き）
```

---

## Extension API

### 概念

拡張は2つのエントリポイントを持つ:
- **Main Entry** (`main.js`): Main Process で実行。Node.js API・ファイルシステム・シェル実行など。
- **Renderer Entry** (`renderer.js`): Renderer Process で実行。React コンポーネント・UIロジック。

両者は拡張専用のIPCブリッジで通信する。

```
┌─────────────────────────────────────────────────────┐
│  Main Process                                        │
│                                                      │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │  ArsChat    │  │  Extension Main Entry         │ │
│  │  Core        │──│  (main.js)                    │ │
│  │              │  │                               │ │
│  │  claude.ts   │  │  ctx.ai.stream(...)           │ │
│  │  store.ts    │  │  ctx.shell.exec(...)          │ │
│  │  index.ts    │  │  ctx.fs.readFile(...)         │ │
│  └──────────────┘  └──────────┬───────────────────┘ │
│                               │ extension IPC        │
├───────────────────────────────┼──────────────────────┤
│  Renderer Process             │                      │
│                               ▼                      │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │  ArsChat    │  │  Extension Renderer Entry     │ │
│  │  App.tsx     │──│  (renderer.js)                │ │
│  │  Router      │  │                               │ │
│  │              │  │  export default: React Page   │ │
│  │  Sidebar     │  │  export Settings: React Panel │ │
│  └──────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Main Entry API (`ExtensionContext`)

```typescript
// 拡張の main.js が受け取るコンテキスト
interface ExtensionContext {
  /** 拡張のメタ情報 */
  extension: {
    id: string;
    version: string;
    dataDir: string;  // 拡張専用のデータ保存先
  };

  /** AI 呼び出し */
  ai: {
    /** ストリーミングチャット */
    stream(params: {
      messages: ChatMessage[];
      systemPrompt?: string;
      onChunk: (chunk: string) => void;
      onEnd: (stats: ChatMessageStats) => void;
      onError: (error: string) => void;
    }): AbortController;

    /** 単発チャット（レスポンス全文を返す） */
    send(params: {
      messages: ChatMessage[];
      systemPrompt?: string;
    }): Promise<{ content: string; stats: ChatMessageStats }>;

    /** 現在のプロバイダ情報（APIキーは含まない） */
    getProviderInfo(): Promise<{
      provider: 'anthropic' | 'lmstudio';
      model: string;
    }>;
  };

  /** シェルコマンド実行（shell:execute 権限必要） */
  shell: {
    exec(command: string, options?: {
      cwd?: string;
      timeout?: number;
      encoding?: string;
    }): Promise<{ stdout: string; stderr: string; exitCode: number }>;

    /** ストリーミング実行（リアルタイム出力） */
    spawn(command: string, args: string[], options?: {
      cwd?: string;
      env?: Record<string, string>;
    }): {
      stdout: ReadableStream<string>;
      stderr: ReadableStream<string>;
      kill(): void;
      onExit: Promise<number>;
    };
  };

  /** ファイルシステム（fs:read / fs:write 権限必要） */
  fs: {
    readFile(path: string, encoding?: string): Promise<string | Buffer>;
    writeFile(path: string, content: string | Buffer): Promise<void>;
    readDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
    stat(path: string): Promise<{ size: number; isDirectory: boolean; mtime: number }>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    remove(path: string): Promise<void>;

    /** ファイル選択ダイアログ */
    showOpenDialog(options: {
      title?: string;
      filters?: { name: string; extensions: string[] }[];
      properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
    }): Promise<string[] | null>;

    /** ファイル保存ダイアログ */
    showSaveDialog(options: {
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }): Promise<string | null>;
  };

  /** セッション操作（session:read / session:write 権限必要） */
  sessions: {
    list(): Promise<ChatSession[]>;
    get(id: string): Promise<ChatSession | null>;
    create(session: Omit<ChatSession, 'id'>): Promise<ChatSession>;
    update(id: string, patch: Partial<ChatSession>): Promise<void>;
  };

  /** 設定（settings:read / settings:write 権限必要） */
  settings: {
    get(): Promise<Partial<ArsChatSettings>>;  // APIキーはマスク
    set(patch: Partial<ArsChatSettings>): Promise<void>;
  };

  /** 拡張専用のKey-Value ストレージ（常に利用可能） */
  store: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };

  /** 拡張→Renderer 間の通信 */
  ipc: {
    /** Renderer に向けてイベント送信 */
    send(channel: string, data: any): void;
    /** Renderer からのイベントを受信 */
    on(channel: string, handler: (data: any) => void): () => void;
    /** Renderer からの呼び出しに応答（request-response） */
    handle(channel: string, handler: (data: any) => Promise<any>): () => void;
  };

  /** ログ出力（デバッグ用） */
  log: {
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
  };
}
```

### Main Entry の書き方

```typescript
// src/main.ts（拡張の Main Process エントリ）
import type { ExtensionContext } from '@anthropic-ai/arschat-extension-api';

export function activate(ctx: ExtensionContext) {
  // Renderer からの呼び出しを処理
  ctx.ipc.handle('run-command', async (data: { command: string; cwd: string }) => {
    const result = await ctx.shell.exec(data.command, { cwd: data.cwd });
    return result;
  });

  ctx.ipc.handle('ai-chat', async (data: { messages: any[] }) => {
    return await ctx.ai.send({ messages: data.messages });
  });

  ctx.log.info('Claude Code extension activated');
}

export function deactivate() {
  // クリーンアップ処理
}
```

### Renderer Entry API (`useExtension` hook)

```typescript
// 拡張の Renderer 側で使える hook
interface ExtensionRendererAPI {
  /** Main Entry との通信 */
  ipc: {
    /** Main にイベント送信 */
    send(channel: string, data: any): void;
    /** Main からのイベントを受信 */
    on(channel: string, handler: (data: any) => void): () => void;
    /** Main に request-response 呼び出し */
    invoke(channel: string, data?: any): Promise<any>;
  };

  /** 拡張のメタ情報 */
  extension: {
    id: string;
    dataDir: string;
  };

  /** アプリ内ナビゲーション */
  navigation: {
    /** 別のページに移動 */
    goTo(pageId: string): void;
    /** チャット画面に戻る */
    goToChat(): void;
  };

  /** テーマ情報 */
  theme: {
    current: 'dark' | 'light';
    accentColor: string;
    /** CSS 変数のマップ */
    cssVariables: Record<string, string>;
  };
}
```

### Renderer Entry の書き方

```tsx
// src/renderer.tsx（拡張の Renderer エントリ）
import React, { useState, useEffect } from 'react';
import type { ExtensionRendererAPI } from '@anthropic-ai/arschat-extension-api';

// ページコンポーネント（必須 export）
// pages で定義した各ページに対応する export が必要
export function ClaudeCodePage({ api }: { api: ExtensionRendererAPI }) {
  const [output, setOutput] = useState<string[]>([]);
  const [input, setInput] = useState('');

  async function handleSubmit() {
    // Main Process 経由でAI呼び出し
    const result = await api.ipc.invoke('ai-chat', {
      messages: [{ role: 'user', content: input }]
    });
    setOutput(prev => [...prev, `> ${input}`, result.content]);
    setInput('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, fontFamily: 'monospace' }}>
        {output.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter command..."
          style={{ width: '100%', padding: 8 }}
        />
      </form>
    </div>
  );
}

// 設定パネル（オプション）
export function ClaudeCodeSettings({ api }: { api: ExtensionRendererAPI }) {
  return (
    <div>
      <h3>Claude Code 設定</h3>
      <label>
        デフォルト作業ディレクトリ:
        <input type="text" placeholder="C:\Users\..." />
      </label>
    </div>
  );
}

// マニフェストとの紐付け（default export）
export default {
  pages: {
    'claude-code': ClaudeCodePage,
  },
  settings: {
    'claude-code-settings': ClaudeCodeSettings,
  },
};
```

---

## インストールフロー

### 1. UIでGitHubリポジトリURLを入力

```
Settings → 拡張機能タブ

┌─────────────────────────────────────────────────┐
│ 拡張機能                                         │
├─────────────────────────────────────────────────┤
│                                                  │
│ [GitHubリポジトリURL を入力...]  [インストール]   │
│                                                  │
│ ── インストール済み ──────────────────────────── │
│                                                  │
│ ● Claude Code         v1.0.0           [有効]    │
│   Claude Code風のAIコーディングアシスタント       │
│   権限: ai:stream, shell:execute, fs:read/write  │
│   [更新] [無効化] [アンインストール]              │
│                                                  │
│ ● ファイルエディタ    v0.5.0           [有効]    │
│   Monaco Editor搭載のコード編集画面              │
│   権限: ai:send, fs:read, fs:write              │
│   [更新] [無効化] [アンインストール]              │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 2. インストール処理

```
1. git clone --depth 1 <url> → extensions/<name>/
2. package.json を読み取り、arschat フィールドをバリデーション
3. 権限一覧をユーザーに提示 → 許可確認ダイアログ
4. npm install （依存パッケージ取得）
5. npm run build （ビルド実行）
6. registry.json に登録
7. 拡張をロード（activate 呼び出し）
```

### 3. 権限確認ダイアログ

```
┌──────────────────────────────────────────┐
│ 拡張機能をインストール                    │
│                                          │
│ Claude Code (arschat-ext-claude-code)   │
│ by: user                                 │
│                                          │
│ この拡張機能は以下の権限を要求します:     │
│                                          │
│ ⚠ シェルコマンド実行 (shell:execute)     │
│   任意のコマンドを実行できます           │
│                                          │
│ ⚠ ファイル読み書き (fs:read, fs:write)   │
│   ファイルシステムにアクセスできます      │
│                                          │
│ ● AIストリーミング (ai:stream)           │
│   AIモデルを呼び出します                 │
│                                          │
│ [キャンセル]          [許可してインストール] │
└──────────────────────────────────────────┘
```

---

## 拡張ロードの仕組み

### Main Process 側

```typescript
// src/main/extension-manager.ts

class ExtensionManager {
  private extensions = new Map<string, LoadedExtension>();

  /** アプリ起動時に全拡張をロード */
  async loadAll() {
    const registry = await this.readRegistry();
    for (const entry of registry.extensions) {
      if (!entry.enabled) continue;
      await this.load(entry);
    }
  }

  /** 拡張をロード */
  async load(entry: RegistryEntry) {
    const manifestPath = path.join(this.extensionsDir, entry.id, 'package.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    const arschat = manifest.arschat;

    // Main Entry のロード
    if (arschat.main) {
      const mainPath = path.join(this.extensionsDir, entry.id, arschat.main);
      const mainModule = require(mainPath);

      // コンテキストを生成（権限でフィルタ）
      const ctx = this.createContext(entry);

      // activate 呼び出し
      await mainModule.activate(ctx);
    }

    this.extensions.set(entry.id, {
      entry,
      manifest,
      context: ctx,
    });
  }

  /** 権限に基づいてコンテキストを生成 */
  private createContext(entry: RegistryEntry): ExtensionContext {
    const permissions = new Set(entry.permissions);

    return {
      extension: {
        id: entry.id,
        version: entry.version,
        dataDir: path.join(this.extensionsDir, entry.id, 'data'),
      },

      ai: permissions.has('ai:stream') || permissions.has('ai:send')
        ? this.createAIAPI(entry)
        : throwPermissionError('ai'),

      shell: permissions.has('shell:execute')
        ? this.createShellAPI(entry)
        : throwPermissionError('shell'),

      fs: this.createFSAPI(entry, permissions),

      // ... 他のAPI
    };
  }

  /** AI API の実装 */
  private createAIAPI(entry: RegistryEntry) {
    return {
      stream: (params) => {
        // 既存の claude.streamChat() を内部で呼び出し
        // 拡張専用の systemPrompt を付加可能
        return this.claude.streamForExtension(params);
      },
      send: async (params) => {
        return this.claude.sendForExtension(params);
      },
      getProviderInfo: async () => {
        const settings = await this.store.getSettings();
        return {
          provider: settings.provider,
          model: settings.provider === 'anthropic' ? settings.model : settings.lmstudioModel,
        };
      },
    };
  }
}
```

### Renderer 側

```typescript
// src/renderer/extension-loader.ts

interface LoadedRendererExtension {
  id: string;
  manifest: ExtensionManifest;
  module: {
    pages: Record<string, React.ComponentType<{ api: ExtensionRendererAPI }>>;
    settings?: Record<string, React.ComponentType<{ api: ExtensionRendererAPI }>>;
  };
}

async function loadRendererExtensions(): Promise<LoadedRendererExtension[]> {
  // Main Process から拡張リストを取得
  const list = await window.arsChatAPI.extensions.list();
  const loaded: LoadedRendererExtension[] = [];

  for (const ext of list) {
    if (!ext.enabled || !ext.rendererEntry) continue;

    // Renderer エントリの読み込み
    // ビルド済みの JS を動的にロード
    const module = await import(/* webpackIgnore: true */ ext.rendererUrl);

    loaded.push({
      id: ext.id,
      manifest: ext.manifest,
      module: module.default,
    });
  }

  return loaded;
}
```

### App.tsx への統合

```tsx
// App.tsx の拡張

type Page = 'chat' | 'settings' | `ext:${string}`;

function App() {
  const [extensions, setExtensions] = useState<LoadedRendererExtension[]>([]);

  useEffect(() => {
    loadRendererExtensions().then(setExtensions);
  }, []);

  // ページの解決
  function renderPage() {
    if (currentPage === 'chat') return <ChatWindow />;
    if (currentPage === 'settings') return <Settings extensions={extensions} />;

    // 拡張ページ
    if (currentPage.startsWith('ext:')) {
      const [, extId, pageId] = currentPage.match(/^ext:(.+?):(.+)$/) || [];
      const ext = extensions.find(e => e.id === extId);
      const PageComponent = ext?.module.pages[pageId];

      if (PageComponent) {
        const api = createRendererAPI(extId);
        return <PageComponent api={api} />;
      }
      return <div>拡張が見つかりません</div>;
    }
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          extensions={extensions}  // サイドバーに拡張ページのリンクを追加
          onNavigate={setCurrentPage}
        />
        <main>{renderPage()}</main>
      </div>
    </div>
  );
}
```

### Sidebar への統合

```tsx
// Sidebar.tsx 拡張

function Sidebar({ extensions, onNavigate }: Props) {
  return (
    <div className="sidebar">
      {/* 既存のセッションリスト */}
      <SessionList />

      {/* 拡張ページのリンク */}
      {extensions.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-title">拡張機能</div>
          {extensions.flatMap(ext =>
            ext.manifest.arschat.pages?.map(page => (
              <button
                key={`${ext.id}:${page.id}`}
                onClick={() => onNavigate(`ext:${ext.id}:${page.id}`)}
                className="sidebar-extension-link"
              >
                <span className="icon">{page.icon}</span>
                <span>{page.title}</span>
              </button>
            )) || []
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Renderer Entry のロード方式

拡張の renderer.js は Electron の Renderer Process 内で動的にロードする必要がある。

### 方式: Blob URL + dynamic import

```typescript
// extension-loader.ts

async function loadRendererModule(ext: ExtensionInfo) {
  // Main Process からビルド済み JS を読み取り
  const code = await window.arsChatAPI.extensions.readRendererEntry(ext.id);

  // React / React-DOM は外部参照（拡張側で bundle しない）
  // グローバルに公開しておく
  (window as any).__ARISCHAT_REACT__ = React;
  (window as any).__ARISCHAT_REACT_DOM__ = ReactDOM;

  // Blob URL を作成して import
  const wrappedCode = `
    const React = window.__ARISCHAT_REACT__;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;
    ${code}
  `;
  const blob = new Blob([wrappedCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  try {
    const module = await import(/* webpackIgnore: true */ url);
    return module;
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

### 拡張側のビルド設定

```javascript
// esbuild.config.js（拡張リポジトリ側）
const { build } = require('esbuild');

// Renderer entry
build({
  entryPoints: ['src/renderer.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/renderer.js',
  platform: 'browser',
  external: ['react', 'react-dom'],  // ArsChat が提供するので除外
  jsx: 'automatic',
});

// Main entry
build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  outfile: 'dist/main.js',
  platform: 'node',
  external: ['electron'],
});
```

---

## 拡張間通信 IPC の仕組み

拡張専用の IPC チャンネルは、既存の ArsChat IPC と混在しないようにプレフィックスで隔離する。

```typescript
// 拡張 IPC のチャンネル名規則
// ext:{extensionId}:{channel}

// 例: arschat-ext-claude-code の "run-command" チャンネル
// → "ext:arschat-ext-claude-code:run-command"

// Main Process 側
ipcMain.handle(`ext:${extId}:${channel}`, async (event, data) => {
  return handler(data);
});

// Renderer 側（preload 経由）
ipcRenderer.invoke(`ext:${extId}:${channel}`, data);
```

### Preload への追加

```typescript
// preload.ts に追加

extensions: {
  /** インストール済み拡張一覧 */
  list: () => ipcRenderer.invoke('extensions:list'),

  /** 拡張の Renderer Entry コードを取得 */
  readRendererEntry: (extId: string) =>
    ipcRenderer.invoke('extensions:read-renderer', extId),

  /** 拡張固有の IPC 呼び出し */
  invoke: (extId: string, channel: string, data?: any) =>
    ipcRenderer.invoke(`ext:${extId}:${channel}`, data),

  /** 拡張固有のイベント送信 */
  send: (extId: string, channel: string, data?: any) =>
    ipcRenderer.send(`ext:${extId}:${channel}`, data),

  /** 拡張固有のイベント受信 */
  on: (extId: string, channel: string, callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(`ext:${extId}:${channel}`, handler);
    return () => ipcRenderer.removeListener(`ext:${extId}:${channel}`, handler);
  },

  /** インストール */
  install: (url: string) => ipcRenderer.invoke('extensions:install', url),

  /** アンインストール */
  uninstall: (extId: string) => ipcRenderer.invoke('extensions:uninstall', extId),

  /** 有効/無効切り替え */
  toggle: (extId: string, enabled: boolean) =>
    ipcRenderer.invoke('extensions:toggle', extId, enabled),

  /** 更新 */
  update: (extId: string) => ipcRenderer.invoke('extensions:update', extId),
}
```

---

## セキュリティ設計

### 1. 権限チェック

各APIコールは権限チェックを通過する必要がある:

```typescript
function createGuardedAPI<T>(
  api: T,
  permission: string,
  grantedPermissions: Set<string>
): T {
  if (!grantedPermissions.has(permission)) {
    // Proxy で全メソッド呼び出しをブロック
    return new Proxy({} as T, {
      get(_, prop) {
        return () => {
          throw new Error(
            `Permission denied: "${permission}" is required to use ${String(prop)}`
          );
        };
      },
    });
  }
  return api;
}
```

### 2. Main Entry の隔離

拡張の `main.js` は `require()` でロードされるため、理論上は Node.js の全APIにアクセスできる。
完全な隔離は `vm` モジュールや Worker で実現可能だが、初期段階では**信頼ベース + 権限システム**で運用する。

将来的にはより厳格な隔離を検討:

```
Phase 1（初期）: require() + 権限チェック API → 悪意のない拡張を前提
Phase 2（将来）: vm.createContext() で隔離実行 → 信頼できない拡張にも対応
```

### 3. APIキーの保護

```typescript
// settings:read で返す設定からAPIキーを除外
function sanitizeSettings(settings: ArsChatSettings): Partial<ArsChatSettings> {
  const { apiKey, ...safe } = settings;
  return safe;
}
```

### 4. Renderer Entry の隔離

Renderer Entry は Blob URL から動的 import されるため:
- `window.arsChatAPI` に直接アクセスできない（Renderer Entry 側にはノーアクセス設計）
- 代わりに `api` prop 経由で許可された操作のみ利用可能
- ただし、同一オリジンの `window` オブジェクトにはアクセスできるため、完全な隔離ではない

将来的には iframe サンドボックスでの隔離も検討可能。

---

## 更新の仕組み

```
1. ユーザーが「更新」ボタンをクリック
2. git pull --ff-only を実行
3. npm install && npm run build
4. 拡張を再ロード（deactivate → activate）
```

```typescript
async function updateExtension(extId: string) {
  const extDir = path.join(extensionsDir, extId);

  // 1. git pull
  await execAsync('git pull --ff-only', { cwd: extDir });

  // 2. npm install & build
  await execAsync('npm install', { cwd: extDir });
  await execAsync('npm run build', { cwd: extDir });

  // 3. 再ロード
  await this.unload(extId);
  await this.load(registry.find(e => e.id === extId));

  // 4. Renderer に通知
  mainWindow.webContents.send('extensions:updated', extId);
}
```

---

## 型定義パッケージ

拡張開発者向けに型定義を npm パッケージとして公開する。

### `@anthropic-ai/arschat-extension-api`

```typescript
// index.d.ts
export interface ExtensionContext { ... }          // Main Entry 用
export interface ExtensionRendererAPI { ... }      // Renderer Entry 用
export interface ChatMessage { ... }               // 共有型
export interface ChatMessageStats { ... }
export interface ChatSession { ... }

// マニフェストの型
export interface ExtensionManifest {
  arschat: {
    displayName: string;
    icon: string;
    permissions: string[];
    main?: string;
    renderer: string;
    pages?: { id: string; title: string; icon: string; sidebar?: boolean }[];
    settings?: { id: string; title: string }[];
    minAppVersion?: string;
  };
}
```

---

## 実装ステップ

### Phase 1: 基盤（拡張のインストール・ロード・ページ表示）

| # | 内容 | 変更ファイル |
|---|------|-------------|
| 1 | `ExtensionManager` クラス作成 | `src/main/extension-manager.ts`（新規） |
| 2 | registry.json 読み書き | `src/main/extension-manager.ts` |
| 3 | 拡張インストール（git clone + npm install + build） | `src/main/extension-manager.ts` |
| 4 | Main Entry ロード + `activate()` 呼び出し | `src/main/extension-manager.ts` |
| 5 | `ExtensionContext` 基本実装（store, ipc, log） | `src/main/extension-context.ts`（新規） |
| 6 | 拡張用 IPC チャンネル登録 | `src/main/index.ts` |
| 7 | Preload に extensions API 追加 | `src/main/preload.ts` |
| 8 | Renderer 側の拡張ローダー | `src/renderer/extension-loader.ts`（新規） |
| 9 | App.tsx に `ext:*` ページルーティング追加 | `src/renderer/App.tsx` |
| 10 | Sidebar に拡張ページリンク追加 | `src/renderer/components/Sidebar.tsx` |
| 11 | Settings に拡張管理タブ追加 | `src/renderer/components/Settings.tsx` |

### Phase 2: Core API（AI呼び出し、ファイル操作）

| # | 内容 | 変更ファイル |
|---|------|-------------|
| 12 | `ctx.ai.stream()` / `ctx.ai.send()` 実装 | `src/main/extension-context.ts` |
| 13 | `ctx.fs.*` 実装 | `src/main/extension-context.ts` |
| 14 | `ctx.shell.*` 実装 | `src/main/extension-context.ts` |
| 15 | パーミッションチェック | `src/main/extension-context.ts` |
| 16 | `ctx.sessions.*` / `ctx.settings.*` 実装 | `src/main/extension-context.ts` |

### Phase 3: 開発者体験

| # | 内容 |
|---|------|
| 17 | `@anthropic-ai/arschat-extension-api` 型定義パッケージ作成 |
| 18 | 拡張テンプレートリポジトリ作成（scaffold） |
| 19 | 開発モード（ローカルパスからのロード） |
| 20 | 拡張のホットリロード対応 |

### Phase 4: サンプル拡張

| # | 内容 |
|---|------|
| 21 | Claude Code風ターミナル拡張 |
| 22 | ファイルエディタ拡張（Monaco Editor） |

---

## 拡張テンプレート（scaffold）

`npm create arschat-extension` で生成されるテンプレート:

```
arschat-ext-my-extension/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts           # Main Process エントリ
│   ├── renderer.tsx       # Renderer エントリ（React）
│   └── types.ts           # 拡張固有の型
├── .gitignore
└── README.md
```

---

## 完全な例: Claude Code 風拡張

### ディレクトリ構成

```
arschat-ext-claude-code/
├── package.json
├── src/
│   ├── main.ts
│   ├── renderer.tsx
│   ├── components/
│   │   ├── Terminal.tsx
│   │   ├── FileTree.tsx
│   │   └── OutputBlock.tsx
│   └── utils/
│       ├── command-parser.ts
│       └── ai-agent.ts
├── dist/
│   ├── main.js
│   └── renderer.js
```

### main.ts

```typescript
import type { ExtensionContext } from '@anthropic-ai/arschat-extension-api';

export function activate(ctx: ExtensionContext) {
  // AIエージェントループ
  ctx.ipc.handle('agent:run', async ({ prompt, cwd }) => {
    const messages = [
      { role: 'user' as const, content: prompt, id: '1', timestamp: Date.now() }
    ];

    const systemPrompt = `You are a coding assistant. You can execute shell commands.
When you need to run a command, output it in a <command> tag.
Current directory: ${cwd}`;

    const result = await ctx.ai.send({ messages, systemPrompt });

    // <command>...</command> タグを抽出して実行
    const commandMatch = result.content.match(/<command>(.*?)<\/command>/s);
    if (commandMatch) {
      const cmdResult = await ctx.shell.exec(commandMatch[1], { cwd });
      return {
        aiResponse: result.content,
        commandOutput: cmdResult,
      };
    }

    return { aiResponse: result.content };
  });

  // ファイルツリー取得
  ctx.ipc.handle('files:list', async ({ dir }) => {
    return ctx.fs.readDir(dir);
  });

  // ファイル読み取り
  ctx.ipc.handle('files:read', async ({ path }) => {
    return ctx.fs.readFile(path, 'utf-8');
  });

  // ファイル書き込み
  ctx.ipc.handle('files:write', async ({ path, content }) => {
    await ctx.fs.writeFile(path, content);
    return { success: true };
  });
}

export function deactivate() {}
```

### renderer.tsx

```tsx
import React, { useState, useRef, useEffect } from 'react';
import type { ExtensionRendererAPI } from '@anthropic-ai/arschat-extension-api';

function ClaudeCodePage({ api }: { api: ExtensionRendererAPI }) {
  const [history, setHistory] = useState<Array<{
    type: 'input' | 'ai' | 'command' | 'error';
    content: string;
  }>>([]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('C:\\Users\\takep');
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [history]);

  async function handleSubmit() {
    if (!input.trim() || isRunning) return;

    const prompt = input;
    setInput('');
    setHistory(h => [...h, { type: 'input', content: prompt }]);
    setIsRunning(true);

    try {
      const result = await api.ipc.invoke('agent:run', { prompt, cwd });

      setHistory(h => [...h, { type: 'ai', content: result.aiResponse }]);

      if (result.commandOutput) {
        const output = result.commandOutput.stdout || result.commandOutput.stderr;
        setHistory(h => [...h, {
          type: 'command',
          content: `$ ${result.commandOutput.command}\n${output}`
        }]);
      }
    } catch (err: any) {
      setHistory(h => [...h, { type: 'error', content: err.message }]);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="claude-code" style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#1a1a2e', color: '#e0e0e0', fontFamily: 'Consolas, monospace'
    }}>
      {/* ヘッダー */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #333', fontSize: 12 }}>
        <span style={{ color: '#888' }}>CWD:</span> {cwd}
      </div>

      {/* 出力エリア */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {history.map((item, i) => (
          <div key={i} style={{
            marginBottom: 12,
            padding: 8,
            borderLeft: `3px solid ${
              item.type === 'input' ? '#4a9eff' :
              item.type === 'ai' ? '#50fa7b' :
              item.type === 'command' ? '#f1fa8c' : '#ff5555'
            }`,
            whiteSpace: 'pre-wrap',
          }}>
            {item.content}
          </div>
        ))}
        {isRunning && <div style={{ color: '#888' }}>Thinking...</div>}
      </div>

      {/* 入力 */}
      <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}
            style={{ padding: 12, borderTop: '1px solid #333' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask Claude..."
          disabled={isRunning}
          style={{
            width: '100%', padding: '8px 12px',
            background: '#16213e', border: '1px solid #444',
            color: '#e0e0e0', borderRadius: 4, fontSize: 14,
            fontFamily: 'Consolas, monospace',
          }}
        />
      </form>
    </div>
  );
}

export default {
  pages: {
    'claude-code': ClaudeCodePage,
  },
};
```

---

## 設計判断の根拠

### なぜ Git Clone 方式か

| 方式 | メリット | デメリット |
|------|---------|-----------|
| **git clone（採用）** | 更新が git pull で完結、ソースが見える、GitHubのエコシステム活用 | git が必要 |
| npm install | npmエコシステム、バージョン管理が堅牢 | 公開にnpmアカウント必要、閾値が高い |
| ZIP ダウンロード | git不要 | 更新が面倒、バージョン管理が弱い |

### なぜ require() ロードか（初期段階）

| 方式 | セキュリティ | 実装コスト | 機能制限 |
|------|------------|-----------|---------|
| **require()（採用）** | 低（信頼ベース） | 低 | なし |
| vm.createContext() | 高 | 高 | Node.js API制限 |
| Worker Thread | 中 | 中 | IPC オーバーヘッド |
| 別プロセス | 最高 | 最高 | 通信コスト大 |

初期は信頼できる拡張（自作 or 著名開発者）を前提とし、エコシステムが成長したらサンドボックス化を検討する。

### なぜ React コンポーネントを直接ロードするか

- ArsChat が React で構築されているため、拡張も React で書くのが最も自然
- Tailwind CSS 変数 / テーマを共有できる
- iframe 隔離も検討したが、AI呼び出しやナビゲーション連携が複雑になる
- VSCode の Webview 方式に近いが、同一プロセスのため通信が高速
