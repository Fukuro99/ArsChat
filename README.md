**English | [日本語](README.ja.md)**

# ArsChat

**ArsChat** is an extensible AI desktop assistant powered by the Claude API.
It runs as a persistent background application and can be summoned instantly with a global hotkey.

> **Note:** This project is currently in active development. Some features may change.

---

## Features

- **Claude API integration** — Streaming responses with multi-session chat history
- **Extension system** — Install extensions from GitHub repositories with a permission-based API
- **Skills** — Define reusable AI prompts and tools as Markdown files with YAML frontmatter
- **MCP support** — Connect to Model Context Protocol servers (stdio and HTTP/SSE)
- **Memory (MemOS)** — Persistent user notes + semantic search over past conversations
- **Interactive UI** — AI can render dynamic UI components (forms, sliders, buttons, etc.) inline in chat
- **Terminal integration** — Embedded PTY terminal with xterm.js
- **Multi-persona** — Multiple AI personas with independent settings and skill libraries
- **Global hotkey** — `Ctrl+Shift+A` to show/hide the window from anywhere

---

## Installation

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/your-username/ArsChat.git
cd ArsChat
npm install

# Generate default icons
node scripts/generate-icons.js

# Create environment file
cp .env.example .env
```

Edit `.env` and set your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm run dist   # Creates installer (Windows: NSIS)
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+A` | Show / hide window |

---

## Extension System

ArsChat supports a GitHub-based extension system. Extensions can:

- Add custom sidebar pages with React UI
- Access the AI API (streaming / single messages)
- Read/write the filesystem, execute shell commands
- Observe lifecycle events via the Hook API

To install an extension, paste a GitHub repository URL in the Extension Manager panel.

See [doc/extension-development.md](doc/extension-development.md) for the full development guide.

---

## Documentation

| Document | Description |
|---|---|
| [Extension Development Guide](doc/extension-development.md) | How to build and install extensions |
| [Extension API Reference](doc/extension-api.md) | Full `ExtensionContext` API |
| [Hook API](doc/hooks.md) | Lifecycle events for extensions |
| [Skills](doc/skills.md) | Creating reusable AI skill templates |
| [MCP Support](doc/mcp.md) | Connecting Model Context Protocol servers |
| [Interactive UI](doc/interactive-ui.md) | AI-driven dynamic UI components |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 33 |
| UI | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 6 |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| MCP | `@modelcontextprotocol/sdk` |
| Storage | SQLite (`better-sqlite3`) + `electron-store` |
| Editor | Monaco Editor |
| Terminal | xterm.js + node-pty |
| Math | KaTeX |

---

## License

MIT
