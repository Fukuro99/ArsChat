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
  mcpTokenSaving: boolean;      // MCPツール省トークン化（サーバー選択→ツール取得の2段階方式）
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

export function getEffectiveSystemPrompt(settings: ArisChatSettings, skills?: Skill[]): string {
  const dateTime = currentDateTimeTag();

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
      return namePrefix + persona.systemPrompt + skillsSection + `\n\n現在日時: ${dateTime}`;
    }
  }
  return settings.systemPrompt + skillsSection + `\n\n現在日時: ${dateTime}`;
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
  mcpTokenSaving: false,
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
  description?: string;   // サーバーの説明（省トークンモードでシステムプロンプトに注入）
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
  MCP_GENERATE_DESC: 'mcp:generate-desc',

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

  // 拡張機能
  EXT_LIST: 'ext:list',
  EXT_INSTALL: 'ext:install',
  EXT_UNINSTALL: 'ext:uninstall',
  EXT_TOGGLE: 'ext:toggle',
  EXT_UPDATE: 'ext:update',
  EXT_READ_RENDERER: 'ext:read-renderer',
  EXT_RELOAD: 'ext:reload',
  EXT_INVOKE: 'ext:invoke',
  EXT_UPDATED: 'ext:updated',
} as const;

// ===== 拡張機能 =====

/** 拡張機能の権限 */
export type ExtensionPermission =
  | 'ai:stream'
  | 'ai:send'
  | 'ai:config-read'
  | 'session:read'
  | 'session:write'
  | 'settings:read'
  | 'settings:write'
  | 'shell:execute'
  | 'fs:read'
  | 'fs:write'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'notification'
  | 'window:create';

/** 拡張機能のページ定義 */
export interface ExtensionPageDef {
  id: string;
  title: string;
  icon: string;           // 絵文字 or Lucide icon名
  sidebar?: boolean;      // 左サイドバーのナビリンクに表示するか（デフォルト true）
  sidebarPanel?: boolean; // 左サイドバー内にインラインパネルとして描画するか
  rightPanel?: boolean;   // 右パネルのタブとして描画するか
}

/** 拡張機能の設定パネル定義 */
export interface ExtensionSettingsDef {
  id: string;
  title: string;
}

/** package.json の arischat フィールド */
export interface ExtensionManifest {
  displayName: string;
  icon: string;
  minAppVersion?: string;
  permissions: ExtensionPermission[];
  main?: string;         // Main Process エントリ（dist/main.js 等）
  renderer: string;      // Renderer エントリ（dist/renderer.js 等）
  pages?: ExtensionPageDef[];
  settings?: ExtensionSettingsDef[];
}

/** registry.json に保存される拡張エントリ */
export interface ExtensionRegistryEntry {
  id: string;            // リポジトリ名（arischat-ext-xxx）
  source: string;        // GitHub URL
  version: string;       // package.json の version
  installedAt: string;   // ISO 8601
  enabled: boolean;
  permissions: ExtensionPermission[];
  manifest: ExtensionManifest;
}

/** Renderer 側に渡す拡張情報 */
export interface ExtensionInfo {
  id: string;
  source: string;
  version: string;
  enabled: boolean;
  manifest: ExtensionManifest;
  /** Renderer Entry の絶対パス（file:// 用） */
  rendererPath: string;
}
