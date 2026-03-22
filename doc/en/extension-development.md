**English | [日本語](../extension-development.md)**

# Extension Development Guide

ArsChat's extension system uses a GitHub repository-based distribution model similar to npm packages.
Extensions can place code in both the **Main process** (Node.js) and the **Renderer process** (React).

---

## Table of Contents

- [How It Works](#how-it-works)
- [Directory Structure](#directory-structure)
- [package.json Manifest](#packagejson-manifest)
- [Renderer Entry Point](#renderer-entry-point)
- [Main Entry Point](#main-entry-point)
- [Permissions](#permissions)
- [Hello World Example](#hello-world-example)
- [Build & Install](#build--install)
- [Data Persistence](#data-persistence)

---

## How It Works

1. The user pastes a GitHub repository URL into the Extension Manager
2. ArsChat clones the repository to `%APPDATA%/ArsChat/arschat-data/extensions/<name>/`
3. The `arschat` field in `package.json` is read and the manifest is parsed
4. An `ExtensionContext` object is constructed based on the declared permissions
5. The Main entry (`main.js`) is loaded via `require()` and `activate(context)` is called
6. The Renderer entry (`renderer.js`) is loaded inside an iframe for each sidebar page

---

## Directory Structure

```
my-extension/
├── package.json        # Manifest (required)
├── main.js             # Main process entry (optional)
└── dist/
    └── renderer.js     # Renderer process entry (required)
```

If you use a bundler, the source layout is flexible — just point `package.json` to the output files.

---

## package.json Manifest

In addition to standard npm fields, your `package.json` must include an `arschat` field.

```json
{
  "name": "arschat-ext-example",
  "version": "1.0.0",
  "description": "A sample ArsChat extension",
  "arschat": {
    "displayName": "Example Extension",
    "description": "A sample extension for ArsChat.",
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
        "label": "API Endpoint",
        "default": "https://example.com/api"
      }
    ]
  }
}
```

### `arschat` Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `displayName` | string | ✓ | Name shown in Extension Manager |
| `description` | string | ✓ | Description of the extension |
| `icon` | string | ✓ | Emoji or Lucide icon name |
| `permissions` | string[] | ✓ | Required permissions ([details](#permissions)) |
| `main` | string | — | Path to the Main process entry file |
| `renderer` | string | ✓ | Path to the Renderer process entry file |
| `pages` | Page[] | — | Sidebar pages to register |
| `settings` | Setting[] | — | Settings panel fields |

### `pages` Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique page identifier (alphanumeric and hyphens) |
| `title` | string | Title shown in tab and sidebar |
| `icon` | string | Emoji or Lucide icon name |
| `sidebar` | boolean | `true` to show in the sidebar navigation |

---

## Renderer Entry Point

`renderer.js` exports an object with a `pages` map, where each key is a page ID and the value is a function returning an HTML string.

```javascript
// dist/renderer.js

const pages = {
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
      <button id="btn">Say hello to AI</button>
      <div id="response"></div>
      <script>
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

> **Note:** The renderer is loaded as HTML inside an iframe.
> If you use React/Vue, bundle your app into a single `renderer.js` file.

---

## Main Entry Point

The Main entry runs in the Node.js environment. Export an `activate(context)` function.

```javascript
// main.js

/**
 * @param {import('./types').ExtensionContext} context
 */
function activate(context) {
  context.log.info('Extension activated!');

  // Subscribe to lifecycle hooks (requires hooks:observe permission)
  const unsubscribe = context.hooks.on('chat:afterResponse', (payload) => {
    context.log.debug(`Response: ${payload.response.substring(0, 50)}...`);
  });

  // Return cleanup function
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

## Permissions

Declare all permissions your extension uses in the `permissions` array.
Attempting to use an undeclared permission will throw a `PermissionDeniedError`.

| Permission | Risk | Available APIs |
|---|---|---|
| `ai:stream` | Low | `context.ai.stream()` |
| `ai:send` | Low | `context.ai.send()` |
| `ai:config-read` | Low | `context.ai.getProviderInfo()` |
| `session:read` | Medium | Read chat history |
| `session:write` | Medium | Write chat history |
| `settings:read` | Medium | Read app settings |
| `settings:write` | High | Write app settings |
| `fs:read` | Medium | `context.fs.readFile()` `context.fs.listDir()` `context.fs.stat()` |
| `fs:write` | High | `context.fs.writeFile()` `context.fs.deleteFile()` |
| `shell:execute` | **Critical** | `context.shell.exec()` `context.shell.spawn()` |
| `clipboard:read` | Medium | `context.clipboard.read()` `context.clipboard.readImage()` |
| `clipboard:write` | Low | `context.clipboard.write()` `context.clipboard.writeImage()` |
| `notification` | Low | Desktop notifications |
| `window:create` | Medium | `context.window.createWindow()` |
| `hooks:observe` | Low | `context.hooks.on()` |

> **Warning:** `shell:execute` grants full system access.
> Users review the permission list before approving installation.

---

## Hello World Example

The minimal extension.

### `package.json`

```json
{
  "name": "arschat-ext-hello",
  "version": "1.0.0",
  "description": "Hello World sample extension",
  "arschat": {
    "displayName": "Hello World",
    "description": "A simple sample extension.",
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
      <button id="greet">Ask AI to introduce itself</button>
      <div id="out"></div>
      <script>
        const ctx = window.__ARSCHAT_CONTEXT__;
        document.getElementById('greet').onclick = async () => {
          document.getElementById('out').textContent = '...';
          const res = await ctx.ai.send({
            messages: [{ role: 'user', content: 'Hello! Please introduce yourself.' }]
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

## Build & Install

### No-build Setup

For simple extensions like the Hello World above, you can write `renderer.js` directly without a build step.

### Using a Bundler

Use esbuild or Vite to bundle into a single output file.

```bash
# esbuild example
npx esbuild src/renderer.tsx --bundle --outfile=dist/renderer.js --platform=browser
```

### Installing

1. Push your repository to GitHub
2. Open the Extension Manager in ArsChat (puzzle icon in the sidebar)
3. Paste the repository URL and click "Install"
4. Review the permissions dialog and approve

### Local Development

You can also point to a local repository path during development (supports `file://` paths).

---

## Data Persistence

Each extension has a dedicated data directory.

```javascript
const dataPath = `${context.extension.dataDir}/config.json`;

// Write (requires fs:write permission)
await context.fs.writeFile(dataPath, JSON.stringify({ key: 'value' }));

// Read (requires fs:read permission)
const raw = await context.fs.readFile(dataPath);
const config = JSON.parse(raw);
```

Data is stored at `%APPDATA%/ArsChat/arschat-data/extensions/<extension-id>/data/`.

---

## Related Documentation

- [Extension API Reference](extension-api.md) — Full `ExtensionContext` API
- [Hook API](hooks.md) — Lifecycle event reference
