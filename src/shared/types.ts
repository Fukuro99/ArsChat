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
**表示系**: text（content/size/weight/color）, icon（emoji/size）, badge（content/color/bg）, progress-bar（value/max）
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

### actionsのsubmit

\`\`\`json
"actions": [{ "type": "submit", "label": "送信", "variant": "primary" }]
\`\`\`

### デザイントークン（colorプロパティ）

"primary" / "secondary" / "success" / "warning" / "danger" / "muted" / "text" / "#RRGGBB"

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
- ユーザーの操作は {"_type":"live_ui_action","ui_id":"...","action":"...","data":{...}} 形式で届く`;

/** アクティブな人格のシステムプロンプトを返す（人格名・日時・Interactive UI指示を付加） */
export function getEffectiveSystemPrompt(settings: ArisChatSettings): string {
  const dateTime = currentDateTimeTag();
  if (settings.activePersonaId) {
    const persona = settings.personas.find((p) => p.id === settings.activePersonaId);
    if (persona) {
      const namePrefix = `あなたの名前は「${persona.name}」です。\n\n`;
      return namePrefix + persona.systemPrompt + INTERACTIVE_UI_INSTRUCTIONS + `\n\n現在日時: ${dateTime}`;
    }
  }
  return settings.systemPrompt + INTERACTIVE_UI_INSTRUCTIONS + `\n\n現在日時: ${dateTime}`;
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
};

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
} as const;
