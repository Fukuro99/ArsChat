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

  // 共通
  systemPrompt: string;

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

export const DEFAULT_SETTINGS: ArisChatSettings = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',

  lmstudioBaseUrl: 'http://localhost:1234/api/v1',
  lmstudioModel: '',
  lmstudioContextLength: 4096,

  systemPrompt: 'あなたはArisChat（アリスチャット）という名前のAIアシスタントです。ユーザーの質問に丁寧かつ的確に日本語で回答してください。コードを含む回答にはマークダウンを使用してください。',

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

  // MCP
  MCP_GET_CONFIG: 'mcp:get-config',
  MCP_SAVE_CONFIG: 'mcp:save-config',
  MCP_GET_STATUS: 'mcp:get-status',
  MCP_LIST_TOOLS: 'mcp:list-tools',
  MCP_RECONNECT: 'mcp:reconnect',
} as const;
