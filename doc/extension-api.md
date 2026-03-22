**[English](en/extension-api.md) | 日本語**

# Extension API リファレンス

`ExtensionContext` は拡張機能の Main エントリ (`activate(context)`) と Renderer (`window.__ARSCHAT_CONTEXT__`) の両方に渡されるオブジェクトです。

---

## 目次

- [context.extension](#contextextension)
- [context.ai](#contextai)
- [context.shell](#contextshell)
- [context.fs](#contextfs)
- [context.clipboard](#contextclipboard)
- [context.window](#contextwindow)
- [context.hooks](#contexthooks)
- [context.log](#contextlog)
- [型定義](#型定義)

---

## context.extension

拡張機能自身に関するメタ情報です。

```typescript
context.extension: {
  id: string;       // 拡張機能 ID（package.json の name）
  version: string;  // バージョン（package.json の version）
  dataDir: string;  // 永続データ用ディレクトリの絶対パス
}
```

### 例

```javascript
context.log.info(`Extension ID: ${context.extension.id}`);
context.log.info(`Data dir: ${context.extension.dataDir}`);
```

---

## context.ai

AI（Claude API）とのやり取りを行う API です。

必要パーミッション: `ai:stream` / `ai:send` / `ai:config-read`

---

### `context.ai.send(params)`

単一のメッセージを送信し、完全なレスポンスを返します。

**パーミッション:** `ai:send`

```typescript
context.ai.send(params: AISendParams): Promise<AISendResult>
```

**`AISendParams`**

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `messages` | `Message[]` | ✓ | 会話履歴 |
| `systemPrompt` | string | — | システムプロンプト |
| `model` | string | — | 使用するモデル（省略時はアプリ設定のモデル） |
| `maxTokens` | number | — | 最大トークン数 |

**`AISendResult`**

| フィールド | 型 | 説明 |
|---|---|---|
| `content` | string | AI のレスポンステキスト |
| `inputTokens` | number | 入力トークン数 |
| `outputTokens` | number | 出力トークン数 |

**例**

```javascript
const result = await context.ai.send({
  messages: [
    { role: 'user', content: 'TypeScript の async/await を説明してください。' }
  ],
  systemPrompt: 'あなたは親切なプログラミングチューターです。'
});
console.log(result.content);
```

---

### `context.ai.stream(params)`

ストリーミング形式で AI レスポンスを受信します。

**パーミッション:** `ai:stream`

```typescript
context.ai.stream(params: AIStreamParams): AbortController
```

**`AIStreamParams`**

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `messages` | `Message[]` | ✓ | 会話履歴 |
| `systemPrompt` | string | — | システムプロンプト |
| `model` | string | — | 使用するモデル |
| `maxTokens` | number | — | 最大トークン数 |
| `onChunk` | `(chunk: string) => void` | ✓ | チャンク受信コールバック |
| `onComplete` | `(result: AIStreamResult) => void` | — | 完了コールバック |
| `onError` | `(error: Error) => void` | — | エラーコールバック |

**戻り値:** `AbortController` — `abort()` を呼ぶとストリームを中断できます。

**例**

```javascript
let fullText = '';
const controller = context.ai.stream({
  messages: [{ role: 'user', content: '1 から 10 まで数えて。' }],
  onChunk: (chunk) => {
    fullText += chunk;
    document.getElementById('output').textContent = fullText;
  },
  onComplete: (result) => {
    console.log(`完了: ${result.outputTokens} tokens`);
  },
  onError: (err) => {
    console.error('ストリームエラー:', err);
  }
});

// キャンセル
document.getElementById('stop').addEventListener('click', () => {
  controller.abort();
});
```

---

### `context.ai.getProviderInfo()`

現在設定されている AI プロバイダー情報を取得します。

**パーミッション:** `ai:config-read`

```typescript
context.ai.getProviderInfo(): Promise<ProviderInfo>
```

**`ProviderInfo`**

| フィールド | 型 | 説明 |
|---|---|---|
| `provider` | string | プロバイダー名（例: `"anthropic"`） |
| `model` | string | 現在のモデル名 |
| `baseUrl` | string | API エンドポイント URL |

---

## context.shell

シェルコマンドを実行します。

**パーミッション:** `shell:execute`

> **警告:** このパーミッションはシステムへのフルアクセスを許可します。
> ユーザーの入力を直接シェルに渡すコマンドインジェクション脆弱性に注意してください。

---

### `context.shell.exec(command, options?)`

コマンドを実行し、完了を待ちます。

```typescript
context.shell.exec(
  command: string,
  options?: ExecOptions
): Promise<ExecResult>
```

**`ExecOptions`**

| フィールド | 型 | 説明 |
|---|---|---|
| `cwd` | string | 作業ディレクトリ |
| `env` | Record<string, string> | 追加の環境変数 |
| `timeout` | number | タイムアウト（ミリ秒） |

**`ExecResult`**

| フィールド | 型 | 説明 |
|---|---|---|
| `stdout` | string | 標準出力 |
| `stderr` | string | 標準エラー出力 |
| `exitCode` | number | 終了コード |

**例**

```javascript
const result = await context.shell.exec('git status', { cwd: '/home/user/project' });
console.log(result.stdout);
```

---

### `context.shell.spawn(command, args?)`

プロセスを起動してストリーミングで出力を受信します。

```typescript
context.shell.spawn(command: string, args?: string[]): SpawnHandle
```

**`SpawnHandle`**

```typescript
{
  onStdout: (cb: (data: string) => void) => void;
  onStderr: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number) => void) => void;
  kill: () => void;
}
```

---

## context.fs

ファイルシステム操作を行います。パスは絶対パスを指定してください。

---

### `context.fs.readFile(path)`

**パーミッション:** `fs:read`

```typescript
context.fs.readFile(path: string): Promise<string>
```

ファイルを UTF-8 テキストとして読み込みます。

---

### `context.fs.writeFile(path, content)`

**パーミッション:** `fs:write`

```typescript
context.fs.writeFile(path: string, content: string): Promise<void>
```

ファイルを書き込みます。親ディレクトリが存在しない場合は自動作成します。

---

### `context.fs.deleteFile(path)`

**パーミッション:** `fs:write`

```typescript
context.fs.deleteFile(path: string): Promise<void>
```

---

### `context.fs.listDir(path)`

**パーミッション:** `fs:read`

```typescript
context.fs.listDir(path: string): Promise<DirEntry[]>
```

**`DirEntry`**

| フィールド | 型 | 説明 |
|---|---|---|
| `name` | string | ファイル名 |
| `path` | string | 絶対パス |
| `isDirectory` | boolean | ディレクトリかどうか |
| `size` | number | ファイルサイズ（バイト） |

---

### `context.fs.stat(path)`

**パーミッション:** `fs:read`

```typescript
context.fs.stat(path: string): Promise<FileStat>
```

**`FileStat`**

| フィールド | 型 | 説明 |
|---|---|---|
| `size` | number | サイズ（バイト） |
| `isDirectory` | boolean | ディレクトリかどうか |
| `mtime` | Date | 最終更新日時 |
| `ctime` | Date | 作成日時 |

---

## context.clipboard

クリップボードの読み書きを行います。

---

### `context.clipboard.read()`

**パーミッション:** `clipboard:read`

```typescript
context.clipboard.read(): Promise<string>
```

クリップボードのテキストを返します。

---

### `context.clipboard.readImage()`

**パーミッション:** `clipboard:read`

```typescript
context.clipboard.readImage(): Promise<Buffer>
```

クリップボードの画像を PNG の `Buffer` で返します。

---

### `context.clipboard.write(text)`

**パーミッション:** `clipboard:write`

```typescript
context.clipboard.write(text: string): Promise<void>
```

---

### `context.clipboard.writeImage(buffer)`

**パーミッション:** `clipboard:write`

```typescript
context.clipboard.writeImage(buffer: Buffer): Promise<void>
```

---

## context.window

新しいウィンドウを作成します。

**パーミッション:** `window:create`

---

### `context.window.createWindow(options)`

```typescript
context.window.createWindow(options: WindowOptions): Promise<BrowserWindow>
```

**`WindowOptions`**

| フィールド | 型 | 説明 |
|---|---|---|
| `width` | number | 幅（px） |
| `height` | number | 高さ（px） |
| `title` | string | ウィンドウタイトル |
| `url` | string | 読み込む URL または `file://` パス |
| `frame` | boolean | OS フレームを表示するか |

---

## context.hooks

ライフサイクルイベントを購読します。

**パーミッション:** `hooks:observe`

詳細は [Hook API リファレンス](hooks.md) を参照してください。

---

### `context.hooks.on(event, listener)`

```typescript
context.hooks.on(
  event: HookEvent,
  listener: (payload: HookPayload) => void
): () => void   // unsubscribe 関数を返す
```

**例**

```javascript
const unsub = context.hooks.on('chat:afterResponse', (payload) => {
  console.log('Response:', payload.response.substring(0, 100));
});

// 購読解除
unsub();
```

---

## context.log

アプリのログシステムに出力します。ログは DevTools コンソールおよびログファイルに記録されます。

```typescript
context.log.debug(message: string): void
context.log.info(message: string): void
context.log.warn(message: string): void
context.log.error(message: string): void
```

---

## 型定義

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AISendParams {
  messages: Message[];
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
}

interface AISendResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

interface AIStreamParams extends AISendParams {
  onChunk: (chunk: string) => void;
  onComplete?: (result: AIStreamResult) => void;
  onError?: (error: Error) => void;
}

interface AIStreamResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

interface FileStat {
  size: number;
  isDirectory: boolean;
  mtime: Date;
  ctime: Date;
}

interface WindowOptions {
  width?: number;
  height?: number;
  title?: string;
  url: string;
  frame?: boolean;
}
```
