# ARIA 実装進捗メモ

> 最終更新: 2026-03-13

---

## MCP (Model Context Protocol) 対応

### 実装済み基盤

| コンポーネント | ファイル | 内容 |
|---|---|---|
| MCPクライアント管理 | `src/main/mcp-manager.ts` | `@modelcontextprotocol/sdk` v1.27.1 を使用 |
| Claude API連携 | `src/main/claude.ts` | ツール呼び出しループ実装済み |
| 設定UI | `src/renderer/components/Settings.tsx` | サーバー追加/編集/削除、ステータス表示 |
| IPC通信 | `src/main/preload.ts` | `getMCPConfig`, `saveMCPConfig`, `listMCPTools` 等 |
| 設定永続化 | `src/main/store.ts` | `mcp-config.json` に保存 |
| 起動時自動接続 | `src/main/index.ts` | enabled なサーバーに自動接続 |

### 対応トランスポート

- **stdio** — 子プロセスとして MCP サーバーを起動（ファイル操作・mcp-remote 等）
- **SSE (HTTP)** — `SSEClientTransport` でリモートサーバーに接続

---

## Atlassian MCP 接続

### 接続方式

OAuth 認証が必要な Atlassian MCP は `mcp-remote` 経由の stdio 型で接続可能。
APIキー不要。`mcp-remote` が OAuth フロー（ブラウザ認可）とトークンキャッシュを自動処理する。

**設定値:**

| 項目 | 値 |
|---|---|
| タイプ | stdio |
| コマンド | `npx` |
| 引数 | `-y`, `mcp-remote`, `https://mcp.atlassian.com/v1/mcp` |

**接続確認済み:**
- filesystem: 14 ツール取得
- Atlassian: 31 ツール取得（合計 45 ツール）

---

## 修正履歴

### ✅ URLリンクの外部ブラウザ対応
- **問題**: アプリ内 URL クリック時に Electron 内でブラウザが開き、戻れなくなる
- **原因**: `<a>` タグのデフォルト動作でアプリ内ナビゲーションが発生
- **修正**: `shell.openExternal()` を使用し OS のデフォルトブラウザで開くよう変更

### ✅ MCP ツール使用時のマウスかくつき修正
- **問題**: MCPツール推論中にマウスカーソルがかくつく・UIが重くなる
- **原因**: `executeWithMCPTools` がツール判定を `stream: false`（一括取得）で行っていた
  - LLM の全応答（Thinkモード時は数千トークンの思考内容含む）が一括で返る
  - `response.json()` による大きな JSON の同期パースがイベントループをブロック
  - IPC 遅延 → Renderer への通知が遅れ → UI 応答悪化
- **修正**: 全ラウンドを `stream: true` に統一
  - 新関数 `readStreamForTools()` でストリームを読みながら `tool_calls` か最終コンテンツかをリアルタイム判別
  - `await reader.read()` のたびにイベントループへ制御が戻るため同期ブロックなし
  - Thinkモード使用時も同様に改善

**修正前後の比較:**

| | 修正前 | 修正後 |
|---|---|---|
| ツール判定 | `stream: false` → 全文一括取得 → `response.json()` パース | `stream: true` → チャンク逐次処理 |
| 最終回答 | `stream: true` に切り替えて別リクエスト | 同じストリームで続行 |
| ブロッキング | あり（大きなJSONの同期パース） | なし |

---

## パフォーマンスメモ

### MCPツール数と推論速度の関係

- ツール定義はMCP接続時に1回だけ取得してメモリにキャッシュ（`conn.tools[]`）
- `getOpenAITools()` はメモリ読み込みのみ（ネットワーク呼び出しなし）
- **ただし毎リクエストに全ツール定義を乗せて LM Studio へ送信している**
- 45ツール ≒ 約3,000〜5,000トークン増 → LM Studio の推論が2〜3倍遅くなる
- Worker Threads での改善は不可（ボトルネックは LM Studio 側の GPU 推論であり、Electron のコードは非同期でブロックしていない）

### トグルOFF時の動作

- `connect(configs)` は `disconnectAll()` を先に実行してから enabled なサーバーのみ再接続
- 正しくOFFにして保存すれば切断・ツール0件になる

---

## 今後の課題 / 検討事項

- [ ] チャット画面の最大幅制限・中央寄せ（ウィンドウ拡大時に左右に広がる問題）
- [ ] Electron コンソールの文字化け（UTF-8対応: `chcp 65001`）
- [ ] ツール数削減の仕組み（不要なツールをリクエストに含めない選択肢）
