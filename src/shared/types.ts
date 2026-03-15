// ===== チャット関連 =====

/** アシスタントメッセージのトークン統計 */
export interface ChatMessageStats {
  tokensPerSec?: number;    // トークン生成速度（トークン/秒）
  totalTokens?: number;     // 合計トークン数（補完分）
  timeSeconds?: number;     // 応答にかかった時間（秒）
  finishReason?: string;    // 停止理由 ("stop", "length", "tool_calls" など)
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;       // 添付画像（Base64）
  timestamp: number;
  stats?: ChatMessageStats;   // トークン統計（アシスタントメッセージのみ）
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ===== LM Studio モデル情報 =====

export interface LMStudioModelInfo {
  id: string;
  displayName: string;
  maxContextLength: number;
  loadedContextLength?: number; // 現在ロード中のコンテキスト長（ロード済みの場合のみ）
  state: string; // 'loaded' | 'not-loaded' | 'loading' | string
  type?: string; // 'llm' | 'vlm' | 'embeddings' | string
}

// ===== 設定関連 =====

export type AIProvider = 'anthropic' | 'lmstudio';

/** AI の人格設定 */
export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  avatarPath: string | null; // カスタムアバター画像パス
}

export interface ArisChatSettings {
  // AI プロバイダー
  provider: AIProvider;

  // Anthropic
  apiKey: string;
  model: string;

  // LM Studio
  lmstudioBaseUrl: string;
  lmstudioModel: string;
  lmstudioContextLength: number; // ロード時に使用するコンテキスト長

  // 共通（人格未選択時のカスタムプロンプト）
  systemPrompt: string;

  // 人格
  personas: Persona[];
  activePersonaId: string | null; // null = カスタムプロンプトを使用

  // 外観
  theme: 'dark' | 'light';
  accentColor: string;          // HEX カラーコード
  customIconPath: string | null; // カスタムアイコンパス（null=デフォルト）
  customTrayIconPath: string | null;
  customAvatarPath: string | null;

  // 動作
  hotkey: string;               // グローバルホットキー
  launchAtStartup: boolean;
  alwaysOnTop: boolean;
  windowWidth: number;
  windowHeight: number;
  enableInteractiveUI: boolean; // インタラクティブAI機能
}

/** 現在日時を [yyyy:MM:DD;hh:mm] 形式で返す */
function currentDateTimeTag(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `[${yyyy}:${MM}:${DD};${hh}:${mm}]`;
}

const INTERACTIVE_UI_INSTRUCTIONS = `
## Interactive UI

あなたはチャットメッセージ内にインタラクティブなUIコンポーネントを埋め込むことができます。
ユーザーとの対話をより効率的にするために、適切な場面でUIコンポーネントを活用してください。

### 使用方法

\`\`\`interactive-ui ブロック内にJSON定義を記述します:

\`\`\`interactive-ui
{
  "id": "ユニークなID",
  "title": "タイトル（省略可）",
  "root": { ...UIノードツリー },
  "actions": [ ...submitボタン等 ]
}
\`\`\`

### 利用可能なプリミティブ

**レイアウト系**: box（direction/gap/padding/align/bg/rounded）, grid（cols/rows/cellWidth/cellHeight）, scroll, divider
**表示系**: text（content/size/weight/color）, icon（emoji/size）, badge（content/color/bg）, progress-bar（value/max/color/showLabel）, image（src/alt/width/height/rounded/fit）
**入力系**: button（label/actionId/variant）, input（inputId/placeholder/multiline）, select（inputId/options）, checkbox（inputId/label）, slider（inputId/min/max/step）, chips（inputId/options/multi）, clickable（actionId）

### UIノード構造

\`\`\`json
{
  "primitive": "プリミティブ名",
  "props": { "プロパティ": "値" },
  "bind": "state内のキーパス（入力系のみ）",
  "children": [ ...子ノード ]
}
\`\`\`

### progress-bar の bind サポート

progress-bar は \`bind\` でstateの値を動的に参照できる:
\`\`\`json
{ "primitive": "progress-bar", "bind": "hp", "props": { "max": 100, "color": "success", "showLabel": true } }
\`\`\`
AIが patch で hp の値を更新すると自動的に反映される。

### image プリミティブ

\`\`\`json
{ "primitive": "image", "props": { "src": "data:image/...", "width": 200, "height": 150, "rounded": "md", "fit": "cover" } }
\`\`\`
- src: data:image/... または blob: URL（外部URLは表示されません）
- fit: "cover" / "contain" / "fill" / "none" / "scale-down"（デフォルト: "cover"）
- bind でstateの画像URLを動的に参照可能

### actionsのsubmit

\`\`\`json
"actions": [{ "type": "submit", "label": "送信", "variant": "primary" }]
\`\`\`

### デザイントークン（colorプロパティ）

アプリはダークテーマです。コントラストを意識して色を選んでください。

**セマンティック**: "primary" / "secondary" / "success" / "warning" / "danger" / "muted" / "text" / "text-inverse" / "bg" / "surface" / "border"
**高コントラスト**: "black"（濃紺） / "white"（オフホワイト） / "dark"（ダークスレート） / "light"（ライトスレート）
**カスタム**: "#RRGGBB"（例: "#000000", "#ffffff", "#8b5cf6"）

**ゲーム・ボードUI での推奨:**
- 黒駒の背景: "black" または "#111111" → テキスト色: "white"
- 白駒の背景: "white" または "#eeeeee" → テキスト色: "black"
- 盤面マス（空）: "surface" → ホバー: "border"
- ハイライトマス: "primary"

### 例: ボタン選択肢

\`\`\`interactive-ui
{
  "id": "choice-1",
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 8 },
    "children": [
      { "primitive": "text", "props": { "content": "どれにしますか？", "size": "sm" } },
      {
        "primitive": "box",
        "props": { "direction": "row", "gap": 8 },
        "children": [
          { "primitive": "button", "props": { "label": "選択肢A", "actionId": "choose_a", "variant": "primary" } },
          { "primitive": "button", "props": { "label": "選択肢B", "actionId": "choose_b", "variant": "secondary" } }
        ]
      }
    ]
  }
}
\`\`\`

### ガイドライン

- 単純なyes/noにはUIを使わず通常のテキストで十分
- 3つ以上の選択肢や複数入力が必要な場面でUIを活用
- UIブロックの前後に説明テキストを添える
- ユーザーがUIを操作すると [interactive-ui-response] として送信されるので、それを受けて次の応答をする

### ライブUIモード（mode: "live"）

継続的なインタラクション（ゲーム、タスクボード等）には mode: "live" を使用:
- ユーザーの操作はチャットに表示されず、AIに直接送信される
- AIは \`\`\`interactive-ui-update ブロックで状態だけを返す

\`\`\`interactive-ui-update
{
  "id": "ブロックID",
  "patch": { "更新するstateキー": "値" }
}
\`\`\`

- patch に "status": "finished" を含めるとUI終了（操作不可）
- ゲーム終了時などは update ブロックの後に通常テキストで締めのコメントを書く
- ライブUIには actions（submitボタン）を含めない
- ユーザーの操作は {"_type":"live_ui_action","ui_id":"...","action":"...","data":{...}} 形式で届く

### ローカルアクション（local: true）

ライブUIでAIに送信せずstateだけ更新したい要素（選択・ハイライト・入力途中等）には **local: true** を指定:
- button / clickable に \`"local": true\` を付けるとクリックしてもAIに送信されない
- ノードの \`bind\` プロパティで更新するstateキーを指定
- button は \`value\` プロパティ、clickable は \`stateValue\` プロパティで設定する値を指定

例: ボード上のマスをクリックで選択し、「置く」ボタンでAIに送信
\`\`\`json
{
  "primitive": "clickable",
  "bind": "selectedCell",
  "props": { "local": true, "stateValue": "A5" },
  "children": [{ "primitive": "text", "props": { "content": "A5" } }]
}
\`\`\`
\`\`\`json
{ "primitive": "button", "props": { "label": "ここに置く", "actionId": "place_stone" } }
\`\`\`
AIには selectedCell の値が currentState に含まれた状態で届く。

### サンドボックスHTML（interactive-html）

プリミティブでは表現できない複雑なUIには HTML/CSS/JS を直接記述できます:

\`\`\`interactive-html
{"id": "gomoku", "mode": "live", "title": "五目並べ", "width": "500px", "height": "540px"}
---
<!DOCTYPE html>
<html>
<style>
  body { margin: 0; background: #DEB887; display: flex; flex-direction: column; align-items: center; font-family: sans-serif; }
  canvas { cursor: pointer; }
  #status { padding: 8px; color: #333; font-size: 14px; }
</style>
<body>
  <div id="status">あなたの番です（● 黒）</div>
  <canvas id="board" width="480" height="480"></canvas>
<script>
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const SIZE = 15, CELL = 32;
  const board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
  let gameOver = false;

  function drawBoard() {
    ctx.clearRect(0, 0, 480, 480);
    ctx.strokeStyle = '#000';
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(16 + i*CELL, 16); ctx.lineTo(16 + i*CELL, 16+14*CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 16+i*CELL); ctx.lineTo(16+14*CELL, 16+i*CELL); ctx.stroke();
    }
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (board[r][c]) {
        ctx.beginPath(); ctx.arc(16+c*CELL, 16+r*CELL, 13, 0, Math.PI*2);
        ctx.fillStyle = board[r][c] === 1 ? '#000' : '#fff'; ctx.fill(); ctx.stroke();
      }
    }
  }

  canvas.addEventListener('click', (e) => {
    if (gameOver) return;
    const col = Math.round((e.offsetX - 16) / CELL);
    const row = Math.round((e.offsetY - 16) / CELL);
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE || board[row][col]) return;
    board[row][col] = 1;
    drawBoard();
    window.parent.postMessage({ type: 'interactive-ui-action', uiId: 'gomoku', action: 'place_stone', data: { row, col } }, '*');
  });

  window.addEventListener('message', (e) => {
    if (e.data.type !== 'interactive-ui-update' || e.data.uiId !== 'gomoku') return;
    const p = e.data.patch;
    if (p.row !== undefined) board[p.row][p.col] = 2;
    if (p.status === 'finished') gameOver = true;
    if (p.message) document.getElementById('status').textContent = p.message;
    drawBoard();
  });

  drawBoard();
</script>
</body>
</html>
\`\`\`

**ルール:**
- ブロックの最初はJSON（id必須、mode/title/width/height省略可）、次の行に \`---\`、その後HTMLを記述
- iframeはネットワーク切断環境で動作する（外部CDNは使用不可）
- 親への通知: \`window.parent.postMessage({ type: 'interactive-ui-action', uiId: 'YOUR_ID', action: 'ACTION', data: {...} }, '*')\`
- 親からの更新受信: \`window.addEventListener('message', e => { if (e.data.type === 'interactive-ui-update') {...} })\`
- live モードで patch に "status": "finished" を含めると終了（通常の \`\`\`interactive-ui-update と同じ）
- ゲーム・アニメーション・グラフなど複雑なビジュアルに使用する

**使い分け:**
- ボタン・フォーム・簡単な選択肢 → \`\`\`interactive-ui（プリミティブ）
- ゲーム・Canvas描画・複雑なアニメーション → \`\`\`interactive-html（サンドボックス）`;

/** アクティブな人格のシステムプロンプトを返す（人格名・日時・Interactive UI指示を付加） */
export function getEffectiveSystemPrompt(settings: ArisChatSettings, skills?: Skill[]): string {
  const dateTime = currentDateTimeTag();
  const uiInstructions = settings.enableInteractiveUI !== false ? INTERACTIVE_UI_INSTRUCTIONS : '';

  // スキル概要の注入
  let skillsSection = '';
  if (skills && skills.length > 0) {
    const rows = skills.map((s) => `| ${s.id} | ${s.name} | ${s.description} |`).join('\n');
    skillsSection = `\n\n## あなたが持つスキル\n\n以下のスキルを活用できます。ユーザーの要求にスキルが役立つと判断した場合は、\`get_skill_details\` ツールでスキルの詳細を取得してから回答してください。\n\n| ID | 名前 | 概要 |\n|----|------|------|\n${rows}`;
  }

  if (settings.activePersonaId) {
    const persona = settings.personas.find((p) => p.id === settings.activePersonaId);
    if (persona) {
      const namePrefix = `あなたの名前は「${persona.name}」です。\n\n`;
      return namePrefix + persona.systemPrompt + uiInstructions + skillsSection + `\n\n現在日時: ${dateTime}`;
    }
  }
  return settings.systemPrompt + uiInstructions + skillsSection + `\n\n現在日時: ${dateTime}`;
}

/** アクティブな人格のアバターパスを返す */
export function getEffectiveAvatarPath(settings: ArisChatSettings): string | null {
  if (settings.activePersonaId) {
    const persona = settings.personas.find((p) => p.id === settings.activePersonaId);
    if (persona) return persona.avatarPath;
  }
  return settings.customAvatarPath;
}

export const DEFAULT_SETTINGS: ArisChatSettings = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',

  lmstudioBaseUrl: 'http://localhost:1234/v1',
  lmstudioModel: '',
  lmstudioContextLength: 4096,

  systemPrompt: 'あなたはArisChat（アリスチャット）という名前のAIアシスタントです。ユーザーの質問に丁寧かつ的確に日本語で回答してください。コードを含む回答にはマークダウンを使用してください。',

  personas: [],
  activePersonaId: null,

  theme: 'dark',
  accentColor: '#6366f1',
  customIconPath: null,
  customTrayIconPath: null,
  customAvatarPath: null,

  hotkey: 'CommandOrControl+Shift+A',
  launchAtStartup: false,
  alwaysOnTop: false,
  windowWidth: 480,
  windowHeight: 720,
  enableInteractiveUI: true,
};

// ===== スキル =====

/** スキルに紐付けられたスクリプト設定 */
export interface SkillScript {
  type: 'file' | 'command' | 'url';
  value: string;
}

/** スキルのメタ情報（本文はファイルから動的に読み込む） */
export interface Skill {
  id: string;           // ファイル名（拡張子なし）
  name: string;         // frontmatter.name
  description: string;  // frontmatter.description（システムプロンプトに載せる概要）
  trigger?: string;     // frontmatter.trigger（例: "/review"）
  script?: SkillScript; // frontmatter.script
  filePath: string;     // 絶対ファイルパス
}

// ===== MCP 設定 =====

export interface MCPServerConfig {
  name: string;           // サーバーラベル（一意のキー）
  type: 'stdio' | 'http' | 'streamable-http';

  // stdio 型
  command?: string;       // 例: "npx"
  args?: string[];        // 例: ["-y", "@modelcontextprotocol/server-filesystem", "C:/path"]
  env?: Record<string, string>;

  // http 型
  url?: string;           // 例: "http://localhost:3000/mcp"
  headers?: Record<string, string>;

  enabled: boolean;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
}

export const DEFAULT_MCP_CONFIG: MCPConfig = {
  servers: [],
};

export interface MCPServerStatus {
  name: string;
  status: 'connected' | 'error' | 'disabled';
  toolCount: number;
  error?: string;
}

export interface MCPToolInfo {
  serverName: string;
  /** "serverName__toolName" 形式の複合キー */
  name: string;
  originalName: string;
  description: string;
}

// ===== IPC チャンネル =====

export const IPC_CHANNELS = {
  // チャット
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_STREAM_END: 'chat:stream-end',
  CHAT_STREAM_ERROR: 'chat:stream-error',
  CHAT_ABORT: 'chat:abort',

  // セッション管理
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_CREATE: 'session:create',
  SESSION_DELETE: 'session:delete',

  // 設定
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // アイコン
  ICON_SELECT: 'icon:select',
  ICON_RESET: 'icon:reset',
  PERSONA_ICON_SELECT: 'persona:icon-select',

  // スクリーンキャプチャ
  CAPTURE_SCREEN: 'capture:screen',
  CAPTURE_REGION: 'capture:region',
  CLIPBOARD_READ_IMAGE: 'clipboard:read-image',

  // ウィンドウ操作
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TOGGLE: 'window:toggle',

  // ウィジェット
  WIDGET_EXPAND: 'widget:expand',
  WIDGET_COLLAPSE: 'widget:collapse',
  WIDGET_MOVE_BY: 'widget:move-by',

  // LM Studio モデル操作
  LMSTUDIO_LIST_MODELS: 'lmstudio:list-models',
  LMSTUDIO_LOAD_MODEL: 'lmstudio:load-model',

  // チャット（サイレント送信）
  CHAT_SEND_SILENT: 'chat:send-silent',

  // MCP
  MCP_GET_CONFIG: 'mcp:get-config',
  MCP_SAVE_CONFIG: 'mcp:save-config',
  MCP_GET_STATUS: 'mcp:get-status',
  MCP_LIST_TOOLS: 'mcp:list-tools',
  MCP_RECONNECT: 'mcp:reconnect',

  // スキル
  SKILL_LIST: 'skill:list',
  SKILL_GET_CONTENT: 'skill:get-content',
  SKILL_SAVE: 'skill:save',
  SKILL_CREATE: 'skill:create',
  SKILL_DELETE: 'skill:delete',
  SKILL_OPEN_EDITOR: 'skill:open-editor',
  SKILL_OPEN_FOLDER: 'skill:open-folder',
  SKILL_INVOKE_SCRIPT: 'skill:invoke-script',

  // セッション同期（ウィジェット ↔ メインウィンドウ）
  SESSION_SET_ACTIVE: 'session:set-active',
  SESSION_GET_ACTIVE: 'session:get-active',
  SESSION_ACTIVE_CHANGED: 'session:active-changed',
  SESSION_UPDATED: 'session:updated',
} as const;
