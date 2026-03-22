**English | [日本語](../hooks.md)**

# Hook API Reference

The Hook API lets extensions **observe** application lifecycle events.
Hooks fire in a non-blocking fire-and-forget manner; payloads are read-only (frozen objects).

**Permission:** `hooks:observe`

---

## Usage

### Main Process

```javascript
// main.js
function activate(context) {
  const unsub = context.hooks.on('chat:afterResponse', (payload) => {
    context.log.info(`Response length: ${payload.response.length}`);
  });

  return {
    deactivate() {
      unsub(); // Always clean up
    }
  };
}

module.exports = { activate };
```

### Renderer Process

Use `context.hooks.on()` the same way from the Renderer.

```javascript
const ctx = window.__ARSCHAT_CONTEXT__;

const unsub = ctx.hooks.on('chat:onChunk', (payload) => {
  appendText(payload.chunk);
});
```

---

## Events

### Chat Events

#### `chat:beforeSend`

Fires immediately before a chat request is sent to the Claude API.

```typescript
interface ChatBeforeSendPayload {
  messages: ReadonlyArray<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  systemPrompt: string;
}
```

**Use cases:** Logging message content, pre-estimating token counts.

---

#### `chat:onChunk`

Fires for each chunk received during streaming.
This event fires very frequently — keep handlers lightweight.

```typescript
interface ChatOnChunkPayload {
  chunk: string;  // Text fragment
}
```

---

#### `chat:afterResponse`

Fires after streaming completes and the full response is available.

```typescript
interface ChatAfterResponsePayload {
  messages: ReadonlyArray<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  response: string;        // Full AI response text
  stats: {
    inputTokens: number;
    outputTokens: number;
    durationMs: number;    // Time taken for the API call (ms)
    tokensPerSecond: number;
  };
}
```

**Use cases:** Hook Profiler (visualizing timings), response analysis, forwarding to external services.

---

### Memory Events

#### `memory:beforeSearch`

Fires before a memory search at the start of a chat session.

```typescript
interface MemoryBeforeSearchPayload {
  personaId: string;
  query: string;  // Search query (first user message)
}
```

---

#### `memory:beforeStore`

Fires before a memory entry is saved after a chat ends.

```typescript
interface MemoryBeforeStorePayload {
  personaId: string;
  content: string;  // Memory content about to be saved
}
```

---

### Session Events

#### `session:beforeSave`

Fires before a chat session is persisted to storage.

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

### Tool Events

#### `tool:beforeExecute`

Fires before an MCP tool or skill tool is executed.

```typescript
interface ToolBeforeExecutePayload {
  toolName: string;
  input: Readonly<Record<string, unknown>>;
}
```

---

#### `tool:afterExecute`

Fires after a tool execution completes.

```typescript
interface ToolAfterExecutePayload {
  toolName: string;
  input: Readonly<Record<string, unknown>>;
  result: unknown;
  durationMs: number;
  error?: string;   // Set if the tool threw an error
}
```

---

## All Events Summary

| Event | Fires When | Use Cases |
|---|---|---|
| `chat:beforeSend` | Before API request | Logging, token estimation |
| `chat:onChunk` | Each streaming chunk | Real-time display, progress |
| `chat:afterResponse` | After response complete | Stats collection, analysis |
| `memory:beforeSearch` | Before memory search | Observing search queries |
| `memory:beforeStore` | Before memory save | Observing stored content |
| `session:beforeSave` | Before session persist | Backup, external sync |
| `tool:beforeExecute` | Before tool execution | Pre-execution logging |
| `tool:afterExecute` | After tool completes | Performance measurement |

---

## Example: Hook Profiler

The bundled `arschat-ext-hook-profiler` extension subscribes to all hooks and visualizes each processing phase as a Gantt chart.

```javascript
// Excerpt from main.js

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

## Notes

- **Read-only:** Payload objects are `Object.freeze()`d and cannot be modified
- **Non-blocking:** Errors in hook handlers do not affect app behavior
- **Always clean up:** Call the unsubscribe function returned by `on()` in your `deactivate()` handler
- **Keep it light:** `chat:onChunk` fires at high frequency — avoid heavy processing
