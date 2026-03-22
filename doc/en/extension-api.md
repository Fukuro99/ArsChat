**English | [日本語](../extension-api.md)**

# Extension API Reference

`ExtensionContext` is the object passed to both the Main entry (`activate(context)`) and the Renderer (`window.__ARSCHAT_CONTEXT__`).

---

## Table of Contents

- [context.extension](#contextextension)
- [context.ai](#contextai)
- [context.shell](#contextshell)
- [context.fs](#contextfs)
- [context.clipboard](#contextclipboard)
- [context.window](#contextwindow)
- [context.hooks](#contexthooks)
- [context.log](#contextlog)
- [Type Definitions](#type-definitions)

---

## context.extension

Metadata about the extension itself.

```typescript
context.extension: {
  id: string;       // Extension ID (package.json name)
  version: string;  // Version (package.json version)
  dataDir: string;  // Absolute path to persistent data directory
}
```

---

## context.ai

API for interacting with the AI (Claude API).

Required permissions: `ai:stream` / `ai:send` / `ai:config-read`

---

### `context.ai.send(params)`

Sends a single message and returns the complete response.

**Permission:** `ai:send`

```typescript
context.ai.send(params: AISendParams): Promise<AISendResult>
```

**`AISendParams`**

| Field | Type | Required | Description |
|---|---|---|---|
| `messages` | `Message[]` | ✓ | Conversation history |
| `systemPrompt` | string | — | System prompt |
| `model` | string | — | Model to use (defaults to app setting) |
| `maxTokens` | number | — | Maximum output tokens |

**`AISendResult`**

| Field | Type | Description |
|---|---|---|
| `content` | string | AI response text |
| `inputTokens` | number | Input token count |
| `outputTokens` | number | Output token count |

**Example**

```javascript
const result = await context.ai.send({
  messages: [
    { role: 'user', content: 'Explain async/await in TypeScript.' }
  ],
  systemPrompt: 'You are a helpful programming tutor.'
});
console.log(result.content);
```

---

### `context.ai.stream(params)`

Receives an AI response as a stream.

**Permission:** `ai:stream`

```typescript
context.ai.stream(params: AIStreamParams): AbortController
```

**`AIStreamParams`**

| Field | Type | Required | Description |
|---|---|---|---|
| `messages` | `Message[]` | ✓ | Conversation history |
| `systemPrompt` | string | — | System prompt |
| `model` | string | — | Model to use |
| `maxTokens` | number | — | Maximum output tokens |
| `onChunk` | `(chunk: string) => void` | ✓ | Called for each chunk |
| `onComplete` | `(result: AIStreamResult) => void` | — | Called when stream ends |
| `onError` | `(error: Error) => void` | — | Called on error |

**Returns:** `AbortController` — call `abort()` to cancel the stream.

**Example**

```javascript
let fullText = '';
const controller = context.ai.stream({
  messages: [{ role: 'user', content: 'Count from 1 to 10.' }],
  onChunk: (chunk) => {
    fullText += chunk;
    document.getElementById('output').textContent = fullText;
  },
  onComplete: (result) => {
    console.log(`Done: ${result.outputTokens} tokens`);
  }
});

// Cancel
document.getElementById('stop').addEventListener('click', () => controller.abort());
```

---

### `context.ai.getProviderInfo()`

Returns the currently configured AI provider information.

**Permission:** `ai:config-read`

```typescript
context.ai.getProviderInfo(): Promise<ProviderInfo>
```

**`ProviderInfo`**

| Field | Type | Description |
|---|---|---|
| `provider` | string | Provider name (e.g. `"anthropic"`) |
| `model` | string | Current model name |
| `baseUrl` | string | API endpoint URL |

---

## context.shell

Execute shell commands.

**Permission:** `shell:execute`

> **Warning:** This permission grants full system access.
> Be careful to avoid command injection vulnerabilities when passing user input to shell commands.

---

### `context.shell.exec(command, options?)`

Runs a command and waits for it to complete.

```typescript
context.shell.exec(command: string, options?: ExecOptions): Promise<ExecResult>
```

**`ExecOptions`**

| Field | Type | Description |
|---|---|---|
| `cwd` | string | Working directory |
| `env` | Record<string, string> | Additional environment variables |
| `timeout` | number | Timeout in milliseconds |

**`ExecResult`**

| Field | Type | Description |
|---|---|---|
| `stdout` | string | Standard output |
| `stderr` | string | Standard error |
| `exitCode` | number | Exit code |

---

### `context.shell.spawn(command, args?)`

Spawns a process and streams its output.

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

File system operations. Use absolute paths.

---

### `context.fs.readFile(path)`

**Permission:** `fs:read`

```typescript
context.fs.readFile(path: string): Promise<string>
```

Reads a file as UTF-8 text.

---

### `context.fs.writeFile(path, content)`

**Permission:** `fs:write`

```typescript
context.fs.writeFile(path: string, content: string): Promise<void>
```

Writes a file. Parent directories are created automatically if they don't exist.

---

### `context.fs.deleteFile(path)`

**Permission:** `fs:write`

```typescript
context.fs.deleteFile(path: string): Promise<void>
```

---

### `context.fs.listDir(path)`

**Permission:** `fs:read`

```typescript
context.fs.listDir(path: string): Promise<DirEntry[]>
```

**`DirEntry`**

| Field | Type | Description |
|---|---|---|
| `name` | string | File name |
| `path` | string | Absolute path |
| `isDirectory` | boolean | Whether this is a directory |
| `size` | number | File size in bytes |

---

### `context.fs.stat(path)`

**Permission:** `fs:read`

```typescript
context.fs.stat(path: string): Promise<FileStat>
```

**`FileStat`**

| Field | Type | Description |
|---|---|---|
| `size` | number | Size in bytes |
| `isDirectory` | boolean | Whether this is a directory |
| `mtime` | Date | Last modified time |
| `ctime` | Date | Creation time |

---

## context.clipboard

Read and write the clipboard.

---

### `context.clipboard.read()`

**Permission:** `clipboard:read`

```typescript
context.clipboard.read(): Promise<string>
```

Returns clipboard text.

---

### `context.clipboard.readImage()`

**Permission:** `clipboard:read`

```typescript
context.clipboard.readImage(): Promise<Buffer>
```

Returns clipboard image as a PNG `Buffer`.

---

### `context.clipboard.write(text)`

**Permission:** `clipboard:write`

```typescript
context.clipboard.write(text: string): Promise<void>
```

---

### `context.clipboard.writeImage(buffer)`

**Permission:** `clipboard:write`

```typescript
context.clipboard.writeImage(buffer: Buffer): Promise<void>
```

---

## context.window

Create new browser windows.

**Permission:** `window:create`

---

### `context.window.createWindow(options)`

```typescript
context.window.createWindow(options: WindowOptions): Promise<BrowserWindow>
```

**`WindowOptions`**

| Field | Type | Description |
|---|---|---|
| `width` | number | Width in pixels |
| `height` | number | Height in pixels |
| `title` | string | Window title |
| `url` | string | URL or `file://` path to load |
| `frame` | boolean | Whether to show the OS window frame |

---

## context.hooks

Subscribe to lifecycle events.

**Permission:** `hooks:observe`

See [Hook API Reference](hooks.md) for the full event list.

---

### `context.hooks.on(event, listener)`

```typescript
context.hooks.on(
  event: HookEvent,
  listener: (payload: HookPayload) => void
): () => void   // Returns an unsubscribe function
```

**Example**

```javascript
const unsub = context.hooks.on('chat:afterResponse', (payload) => {
  console.log('Response:', payload.response.substring(0, 100));
});

// Unsubscribe
unsub();
```

---

## context.log

Write to the application log. Logs appear in DevTools console and log files.

```typescript
context.log.debug(message: string): void
context.log.info(message: string): void
context.log.warn(message: string): void
context.log.error(message: string): void
```

---

## Type Definitions

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
