**[English](en/mcp.md) | 日本語**

# MCP (Model Context Protocol) サポート

ArsChat は [Model Context Protocol](https://modelcontextprotocol.io/) をサポートしています。
MCP サーバーを接続することで、AI がファイルシステム、データベース、外部 API などのツールを使えるようになります。

---

## 目次

- [概要](#概要)
- [MCP サーバーの追加](#mcp-サーバーの追加)
- [トランスポート種別](#トランスポート種別)
- [設定例](#設定例)
- [ツールの使われ方](#ツールの使われ方)
- [トークン節約モード](#トークン節約モード)

---

## 概要

MCP はAIとツール（外部システム）を繋ぐ標準プロトコルです。
MCP サーバーは「ツール」を公開し、ArsChat がそれを AI の関数呼び出しとして利用します。

```
ユーザー → ArsChat (Claude API) → MCP サーバー → ファイルシステム / DB / API
```

---

## MCP サーバーの追加

Settings パネルの「MCP サーバー」セクションから追加できます。

### 設定項目

| フィールド | 説明 |
|---|---|
| 名前 | サーバーの識別名（任意） |
| トランスポート | `stdio` または `http` |
| コマンド | stdio の場合: 実行コマンド（例: `npx @modelcontextprotocol/server-filesystem`) |
| URL | HTTP の場合: エンドポイント URL |
| 引数 | コマンドライン引数 |
| 環境変数 | サーバーに渡す環境変数 |

---

## トランスポート種別

### stdio（標準入出力）

MCP サーバーをサブプロセスとして起動し、stdin/stdout で通信します。
ローカルで動作するサーバーに使用します。

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
}
```

### HTTP / SSE（Server-Sent Events）

HTTP エンドポイントを持つ MCP サーバーに接続します。
リモートサーバーや Docker コンテナ内のサーバーに使用します。

```json
{
  "type": "http",
  "url": "http://localhost:3000/mcp"
}
```

---

## 設定例

### ファイルシステムサーバー

ローカルファイルへのアクセスを AI に提供します。

```
コマンド: npx
引数:    -y @modelcontextprotocol/server-filesystem /path/to/directory
```

提供されるツール例:
- `read_file` — ファイルの内容を読む
- `write_file` — ファイルに書き込む
- `list_directory` — ディレクトリ一覧を取得
- `search_files` — ファイルを検索

### GitHub サーバー

GitHub リポジトリへのアクセスを提供します。

```
コマンド: npx
引数:    -y @modelcontextprotocol/server-github
環境変数: GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
```

### SQLite サーバー

SQLite データベースへのクエリを提供します。

```
コマンド: npx
引数:    -y @modelcontextprotocol/server-sqlite /path/to/database.db
```

### Atlassian (Jira / Confluence)

Jira チケットや Confluence ページへのアクセスを提供します。

```
コマンド: npx
引数:    -y @anthropic-ai/mcp-server-atlassian
環境変数: ATLASSIAN_EMAIL=user@example.com
         ATLASSIAN_API_TOKEN=your-token
         ATLASSIAN_BASE_URL=https://your-domain.atlassian.net
```

---

## ツールの使われ方

MCP サーバーを追加すると、そのサーバーが公開するツールが自動的に Claude の関数呼び出しとして利用可能になります。

AI が応答中にツールを使う場合:

1. Claude がツール呼び出しをリクエスト（JSON 形式の関数呼び出し）
2. ArsChat が対応する MCP サーバーにリクエストを転送
3. MCP サーバーがツールを実行して結果を返す
4. 結果が Claude に渡され、応答が続行される

ツールの実行はチャット UI に表示され、何を実行したか確認できます。

---

## トークン節約モード

多数の MCP サーバーが接続されているとツール定義がトークンを多く消費します。
トークン節約モードを有効にすると、各会話の開始時に使用するサーバーを選択できます。

設定: Settings → MCP → 「トークン節約モード」を有効化

有効化すると、新しいチャットを開始する際にサーバー選択ダイアログが表示され、
選択したサーバーのツールのみが Claude に渡されます。

---

## 利用可能な MCP サーバー

公式・コミュニティの MCP サーバー一覧:

- [MCP サーバー一覧 (GitHub)](https://github.com/modelcontextprotocol/servers)
- [Anthropic 公式 MCP サーバー](https://github.com/anthropics/anthropic-tools)

サーバーの追加は `npm install -g` 不要で、`npx` を使ってオンデマンドで起動できます。
