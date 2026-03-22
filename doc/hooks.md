**[English](en/hooks.md) | 日本語**

# Hook API リファレンス

Hook API は拡張機能がアプリケーションのライフサイクルイベントを**観察（observe）**するための仕組みです。
フックはノンブロッキングの fire-and-forget 方式で発火し、ペイロードは読み取り専用（frozen object）です。

**パーミッション:** `hooks:observe`

---

## 使い方

### Main プロセス

```javascript
// main.js
function activate(context) {
  const unsub = context.hooks.on('chat:afterResponse', (payload) => {
    context.log.info(`Response length: ${payload.response.length}`);
  });

  return {
    deactivate() {
      unsub(); // 必ずクリーンアップ
    }
  };
}

module.exports = { activate };
```

### Renderer プロセス

Renderer からフックを購読する場合も同様に `context.hooks.on()` を使います。

```javascript
const ctx = window.__ARSCHAT_CONTEXT__;

const unsub = ctx.hooks.on('chat:onChunk', (payload) => {
  appendText(payload.chunk);
});
```

---

## イベント一覧

### チャット関連

#### `chat:beforeSend`

チャットリクエストが Claude API に送信される直前に発火します。

```typescript
interface ChatBeforeSendPayload {
  messages: ReadonlyArray<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  systemPrompt: string;
}
```

**用途例:**
- メッセージ内容のロギング
- トークン数の事前推定

---

#### `chat:onChunk`

ストリーミング中に各チャンクが受信されるたびに発火します。
大量に発火する可能性があるため、処理は軽量に保ってください。

```typescript
interface ChatOnChunkPayload {
  chunk: string;  // テキストの断片
}
```

---

#### `chat:afterResponse`

ストリーミングが完了してレスポンス全体が確定した後に発火します。

```typescript
interface ChatAfterResponsePayload {
  messages: ReadonlyArray<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  response: string;        // AI の完全なレスポンステキスト
  stats: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;    // API 呼び出しにかかった時間（ミリ秒）
    tokensPerSecond: number;
  };
}
```

**用途例:**
- Hook Profiler（処理時間の可視化）
- 応答内容の分析・ログ記録
- 外部サービスへの転送

---

### メモリ関連

#### `memory:beforeSearch`

チャットセッション開始時のメモリ検索直前に発火します。

```typescript
interface MemoryBeforeSearchPayload {
  personaId: string;
  query: string;  // 検索クエリ（最初のユーザーメッセージ）
}
```

---

#### `memory:beforeStore`

チャット終了後にメモリが保存される直前に発火します。

```typescript
interface MemoryBeforeStorePayload {
  personaId: string;
  content: string;  // 保存しようとしているメモリ内容
}
```

---

### セッション関連

#### `session:beforeSave`

チャットセッションがストレージに保存される直前に発火します。

```typescript
interface SessionBeforeSavePayload {
  session: {
    id: string;
    title: string;
    messages: ReadonlyArray<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
    }>;
    createdAt: number;
    updatedAt: number;
  };
}
```

---

### ツール実行関連

#### `tool:beforeExecute`

MCP ツールまたはスキルツールが実行される直前に発火します。

```typescript
interface ToolBeforeExecutePayload {
  toolName: string;     // ツール名（例: "filesystem_read_file"）
  input: Readonly<Record<string, unknown>>;  // ツールへの入力パラメータ
}
```

---

#### `tool:afterExecute`

ツールの実行が完了した後に発火します。

```typescript
interface ToolAfterExecutePayload {
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  result: unknown;      // ツールの実行結果
  durationMs: number;   // 実行時間（ミリ秒）
  error?: string;       // エラーが発生した場合のメッセージ
}
```

---

## 全イベント一覧（サマリー）

| イベント | 発火タイミング | 主なユースケース |
|---|---|---|
| `chat:beforeSend` | API リクエスト直前 | ロギング、トークン推定 |
| `chat:onChunk` | ストリーミング各チャンク | リアルタイム表示、プログレス |
| `chat:afterResponse` | レスポンス完了後 | 統計収集、内容分析 |
| `memory:beforeSearch` | メモリ検索直前 | 検索クエリの観察 |
| `memory:beforeStore` | メモリ保存直前 | 保存内容の観察 |
| `session:beforeSave` | セッション保存直前 | バックアップ、外部同期 |
| `tool:beforeExecute` | ツール実行直前 | 実行前のロギング |
| `tool:afterExecute` | ツール実行完了後 | パフォーマンス計測 |

---

## 実装例: Hook Profiler

ArsChat に同梱の `arschat-ext-hook-profiler` 拡張機能はすべてのフックを購読し、
各処理フェーズの実行時間をガントチャートで可視化します。

```javascript
// main.js の抜粋

function activate(context) {
  const timings = new Map();

  context.hooks.on('chat:beforeSend', () => {
    timings.set('api', Date.now());
  });

  context.hooks.on('chat:afterResponse', (payload) => {
    const elapsed = Date.now() - timings.get('api');
    context.log.info(`API call: ${elapsed}ms, ${payload.stats.tokensPerSecond.toFixed(1)} tok/s`);
  });

  context.hooks.on('tool:beforeExecute', (payload) => {
    timings.set(`tool:${payload.toolName}`, Date.now());
  });

  context.hooks.on('tool:afterExecute', (payload) => {
    const start = timings.get(`tool:${payload.toolName}`);
    if (start) {
      context.log.info(`Tool ${payload.toolName}: ${Date.now() - start}ms`);
    }
  });
}
```

---

## 注意事項

- **読み取り専用:** ペイロードオブジェクトは `Object.freeze()` されており、変更はできません
- **ノンブロッキング:** フック内の処理がエラーになっても、アプリの動作には影響しません
- **必ずクリーンアップ:** `activate()` から `deactivate()` を返す場合は、`on()` が返す unsubscribe 関数を必ず呼んでください
- **軽量に:** `chat:onChunk` は高頻度で発火するため、重い処理は避けてください
