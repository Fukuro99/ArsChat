**English | [日本語](../mcp.md)**

# MCP (Model Context Protocol) Support

ArsChat supports the [Model Context Protocol](https://modelcontextprotocol.io/).
Connecting MCP servers gives the AI access to tools such as the filesystem, databases, and external APIs.

---

## Table of Contents

- [Overview](#overview)
- [Adding an MCP Server](#adding-an-mcp-server)
- [Transport Types](#transport-types)
- [Configuration Examples](#configuration-examples)
- [How Tools Are Used](#how-tools-are-used)
- [Token-Saving Mode](#token-saving-mode)

---

## Overview

MCP is a standard protocol that connects AI models to tools (external systems).
MCP servers expose "tools" that ArsChat makes available as function calls for the AI.

```
User → ArsChat (Claude API) → MCP Server → Filesystem / DB / API
```

---

## Adding an MCP Server

Go to **Settings → MCP Servers** to add a server.

### Settings

| Field | Description |
|---|---|
| Name | Identifier for the server (any name) |
| Transport | `stdio` or `http` |
| Command | For stdio: the command to run (e.g. `npx @modelcontextprotocol/server-filesystem`) |
| URL | For HTTP: the endpoint URL |
| Arguments | Command-line arguments |
| Environment Variables | Environment variables passed to the server |

---

## Transport Types

### stdio (Standard I/O)

Starts the MCP server as a subprocess and communicates via stdin/stdout.
Use for servers running locally.

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
}
```

### HTTP / SSE (Server-Sent Events)

Connects to an MCP server with an HTTP endpoint.
Use for remote servers or servers running in Docker containers.

```json
{
  "type": "http",
  "url": "http://localhost:3000/mcp"
}
```

---

## Configuration Examples

### Filesystem Server

Gives the AI access to local files.

```
Command: npx
Args:    -y @modelcontextprotocol/server-filesystem /path/to/directory
```

Example tools provided:
- `read_file` — Read file contents
- `write_file` — Write to a file
- `list_directory` — List directory entries
- `search_files` — Search for files

### GitHub Server

Provides access to GitHub repositories.

```
Command: npx
Args:    -y @modelcontextprotocol/server-github
Env:     GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
```

### SQLite Server

Provides query access to a SQLite database.

```
Command: npx
Args:    -y @modelcontextprotocol/server-sqlite /path/to/database.db
```

### Atlassian (Jira / Confluence)

Provides access to Jira tickets and Confluence pages.

```
Command: npx
Args:    -y @anthropic-ai/mcp-server-atlassian
Env:     ATLASSIAN_EMAIL=user@example.com
         ATLASSIAN_API_TOKEN=your-token
         ATLASSIAN_BASE_URL=https://your-domain.atlassian.net
```

---

## How Tools Are Used

Once an MCP server is added, its tools become available as function calls for Claude.

When the AI uses a tool during a response:

1. Claude requests a tool call (JSON function call format)
2. ArsChat forwards the request to the corresponding MCP server
3. The MCP server executes the tool and returns the result
4. The result is passed back to Claude, and the response continues

Tool executions are shown in the chat UI so you can see what was run.

---

## Token-Saving Mode

When many MCP servers are connected, their tool definitions can consume a significant number of tokens.
Enable token-saving mode to choose which servers to use at the start of each conversation.

**Settings → MCP → Enable Token-Saving Mode**

When enabled, a server selection dialog appears at the start of each new chat.
Only the selected servers' tools are passed to Claude.

---

## Finding MCP Servers

- [MCP Server Registry (GitHub)](https://github.com/modelcontextprotocol/servers)
- [Anthropic Official MCP Servers](https://github.com/anthropics/anthropic-tools)

Servers can be started on demand with `npx` — no global `npm install` required.
