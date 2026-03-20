# 拡張機能 Hooks API 設計書

## 概要

チャット履歴メモリ（MemOS）機能の処理フローを外部から観察・拡張できる仕組みがない。
拡張機能がアプリのライフサイクル（チャット送受信、メモリ操作、ツール実行等）にフックして独自の処理を実行できる**観察専用Hook API**を追加する。

---

## 設計方針

- **観察専用**（データ変更不可） — ペイロードは `structuredClone` + `Object.freeze` で渡す
- **非ブロッキング** — `emit` は fire-and-forget。`Promise.allSettled` でリスナー実行、エラーは `console.warn` でログ出力のみ
- **権限制御** — 新パーミッション `hooks:observe` で保護
- **疎結合** — `claude.ts` にはオプショナルコールバック (`onToolBefore` / `onToolAfter`) を追加するだけで HookManager を直接参照しない

---

## Hook イベント一覧

| イベント | ペイロード | 発火タイミング |
|---------|-----------|---------------|
| `chat:beforeSend` | `{ messages, systemPrompt }` | `streamChat()` 呼び出し直前 |
| `chat:onChunk` | `{ chunk }` | ストリーミングの各チャンク |
| `chat:afterResponse` | `{ messages, response, stats }` | ストリーム完了後 |
| `memory:beforeSearch` | `{ personaId, query }` | `searchMemories()` 呼び出し前 |
| `memory:beforeStore` | `{ personaId, content }` | `storeMemory()` 呼び出し前 |
| `session:beforeSave` | `{ session }` | `store.saveSession()` 呼び出し前 |
| `tool:beforeExecute` | `{ toolName, input }` | ツール実行前 |
| `tool:afterExecute` | `{ toolName, input, result }` | ツール実行後 |

---

## 新規ファイル: `src/main/hook-manager.ts`

### 型定義

```typescript
import { ChatMessage, ChatMessageStats, ChatSession } from '../shared/types';

export interface HookEventMap {
  'chat:beforeSend': { messages: ChatMessage[]; systemPrompt: string };
  'chat:onChunk': { chunk: string };
  'chat:afterResponse': { messages: ChatMessage[]; response: string; stats: ChatMessageStats };
  'memory:beforeSearch': { personaId: string; query: string };
  'memory:beforeStore': { personaId: string; content: string };
  'session:beforeSave': { session: ChatSession };
  'tool:beforeExecute': { toolName: string; input: Record<string, unknown> };
  'tool:afterExecute': { toolName: string; input: Record<string, unknown>; result: string };
}

export type HookEventName = keyof HookEventMap;
export type HookListener<K extends HookEventName> = (payload: Readonly<HookEventMap[K]>) => void | Promise<void>;
```

### ファクトリ

```typescript
export function createHookManager() {
  // 内部: Map<HookEventName, Array<{ extId: string; fn: HookListener }>>
  return {
    /** リスナー登録。返り値の関数で解除 */
    on<K extends HookEventName>(extId: string, event: K, listener: HookListener<K>): () => void,

    /** fire-and-forget でリスナーに通知。ペイロードは freeze される */
    emit<K extends HookEventName>(event: K, payload: HookEventMap[K]): void,

    /** 全リスナー削除（extensionManager.unloadAll 時に呼ぶ） */
    removeAll(): void,
  };
}
```

### emit の実装方針

```typescript
emit<K extends HookEventName>(event: K, payload: HookEventMap[K]): void {
  const entries = listeners.get(event);
  if (!entries || entries.length === 0) return;
  const frozen = Object.freeze(structuredClone(payload));
  Promise.allSettled(
    entries.map(async ({ fn, extId }) => {
      try { await fn(frozen); }
      catch (err) { console.warn(`[HookManager] Hook "${event}" from ext "${extId}" threw:`, err); }
    })
  );
}
```

- `structuredClone` + `Object.freeze` でデータ変更を防止（観察専用を強制）
- `Promise.allSettled` で1つのリスナーの失敗が他に波及しない
- `emit` 自体は同期的に return する（await しない）→ メインフローをブロックしない

---

## 変更ファイル一覧

### `src/shared/types.ts`

`ExtensionPermission` に追加:

```typescript
export type ExtensionPermission =
  | 'ai:stream'
  | 'ai:send'
  // ... 既存 ...
  | 'hooks:observe';   // ← NEW
```

### `src/main/extension-context.ts`

#### インターフェース追加

```typescript
export interface ExtensionContext {
  // ... 既存 ...
  hooks: {
    on<K extends HookEventName>(event: K, listener: HookListener<K>): () => void;
  };
}
```

#### ファクトリ変更

```typescript
export function createExtensionContext(
  entry: ExtensionRegistryEntry,
  extensionsDir: string,
  store: ReturnType<typeof createStore>,
  claudeService: ReturnType<typeof createClaudeService>,
  mainWindow: BrowserWindow | null,
  hookManager: ReturnType<typeof createHookManager>,  // ← NEW
): ExtensionContext {
```

#### hooksAPI 実装

```typescript
const hooksAPI = {
  on: <K extends HookEventName>(event: K, listener: HookListener<K>) =>
    hookManager.on(extId, event, listener),
};
```

#### コンテキスト組み立て

```typescript
return {
  // ... 既存 ...
  hooks: granted.has('hooks:observe')
    ? hooksAPI
    : guarded('hooks:observe', granted, hooksAPI),
};
```

### `src/main/index.ts`

#### インスタンス化

```typescript
import { createHookManager } from './hook-manager';
const hookManager = createHookManager();
```

#### Hook emit 挿入箇所

```
CHAT_SEND ハンドラー内:
  1. memory:beforeSearch  — searchMemories() 呼び出し前
  2. chat:beforeSend      — streamChat() 呼び出し直前
  3. chat:onChunk         — onChunk コールバック内
  4. chat:afterResponse   — onEnd コールバック内
  5. memory:beforeStore   — storeMemory() 呼び出し前

SESSION_CREATE ハンドラー内:
  6. session:beforeSave   — store.saveSession() 呼び出し前

streamChat options 経由:
  7. tool:beforeExecute   — onToolBefore コールバック
  8. tool:afterExecute    — onToolAfter コールバック
```

#### extensionManager.loadAll への hookManager 受け渡し

```typescript
await extensionManager.loadAll((entry) =>
  createExtensionContext(entry, extensionsDir, store, claude, mainWindow, hookManager)
);
```

#### unloadAll 後のクリーンアップ

```typescript
await extensionManager.unloadAll();
hookManager.removeAll();
```

### `src/main/claude.ts`

#### options 型拡張

```typescript
options?: {
  thinkMode?: boolean;
  fileBrowserState?: FileBrowserState;
  openFilePaths?: string[];
  userMemory?: string;
  chatMemories?: string;
  skillContext?: SkillContext;
  // NEW
  onToolBefore?: (toolName: string, input: Record<string, unknown>) => void;
  onToolAfter?: (toolName: string, input: Record<string, unknown>, result: string) => void;
}
```

#### Anthropic ツールループ（streamAnthropic 内）

```typescript
// ツール実行前
options?.onToolBefore?.(block.name, block.input as Record<string, unknown>);

// ... 既存のツール実行ロジック ...

// ツール実行後
options?.onToolAfter?.(block.name, block.input as Record<string, unknown>, result);
```

#### LM Studio ツールループ（executeWithMCPTools 内）

同様に `onToolBefore` / `onToolAfter` を挿入。

#### index.ts からの呼び出し

```typescript
await claude.streamChat(settings, payload.messages, onChunk, onEnd, {
  // ... 既存 options ...
  onToolBefore: (name, input) =>
    hookManager.emit('tool:beforeExecute', { toolName: name, input }),
  onToolAfter: (name, input, result) =>
    hookManager.emit('tool:afterExecute', { toolName: name, input, result }),
});
```

---

## 拡張機能での使用例

```javascript
// package.json の arschat マニフェスト
{
  "arschat": {
    "displayName": "Chat Logger",
    "permissions": ["hooks:observe"],
    "main": "dist/main.js",
    "renderer": "dist/renderer.js"
  }
}

// main.js
export function activate(ctx) {
  // チャット送信を観察
  ctx.hooks.on('chat:beforeSend', (payload) => {
    ctx.log.info('送信:', payload.messages.length, '件');
  });

  // ツール実行を観察
  ctx.hooks.on('tool:afterExecute', (payload) => {
    ctx.log.info(`ツール実行: ${payload.toolName}`, payload.result.slice(0, 100));
  });

  // メモリ保存を観察
  ctx.hooks.on('memory:beforeStore', (payload) => {
    ctx.log.info(`メモリ保存: ${payload.personaId}`, payload.content.slice(0, 50));
  });

  // チャンクをリアルタイム観察
  ctx.hooks.on('chat:onChunk', (payload) => {
    // 例: 外部サービスにストリーミング転送
  });
}
```

---

## 実装ステップ

| # | 内容 | ファイル | 状態 |
|---|------|---------|------|
| 1 | `HookEventMap` 型定義 + `createHookManager` 実装 | `src/main/hook-manager.ts` | ⬜ |
| 2 | `ExtensionPermission` に `hooks:observe` 追加 | `src/shared/types.ts` | ⬜ |
| 3 | `ExtensionContext` に `hooks` セクション追加 | `src/main/extension-context.ts` | ⬜ |
| 4 | `createHookManager` インスタンス化 + emit 挿入 | `src/main/index.ts` | ⬜ |
| 5 | `onToolBefore` / `onToolAfter` コールバック追加 | `src/main/claude.ts` | ⬜ |
| 6 | ビルド確認 | — | ⬜ |

---

## 検証方法

1. ビルド確認: `npm run build` が通ること
2. 動作確認: テスト用拡張を作り、全8フックにリスナーを登録 → チャット送信してコンソールにログが出ることを確認
3. エラー隔離: リスナー内で `throw` しても他のリスナーやチャット本体に影響がないことを確認
4. 権限確認: `hooks:observe` パーミッションなしの拡張が `ctx.hooks.on()` を呼ぶとエラーになることを確認
5. freeze確認: リスナー内でペイロードの書き換えを試みると TypeError になることを確認

---

## 将来の拡張候補（今回はスコープ外）

- **ミドルウェア型フック**: ペイロードを変更可能にして、処理パイプラインを拡張機能がカスタマイズできるようにする
- **優先度制御**: リスナーの実行順序を指定できるようにする
- **フック結果の収集**: emit の返り値でリスナーの結果を集約する
