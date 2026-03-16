import { contextBridge, ipcRenderer } from 'electron';
// 型のみのインポート（コンパイル後に require を生成しない）
import type { ArisChatSettings, ChatMessage, ChatMessageStats, ChatSession, LMStudioModelInfo, MCPConfig, MCPServerStatus, MCPToolInfo, Skill } from '../shared/types';

// sandbox preload 環境では require('../shared/types') が使えないため直接定義
const IPC_CHANNELS = {
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_STREAM_END: 'chat:stream-end',
  CHAT_STREAM_ERROR: 'chat:stream-error',
  CHAT_ABORT: 'chat:abort',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_CREATE: 'session:create',
  SESSION_DELETE: 'session:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  ICON_SELECT: 'icon:select',
  PERSONA_ICON_SELECT: 'persona:icon-select',
  CAPTURE_SCREEN: 'capture:screen',
  CLIPBOARD_READ_IMAGE: 'clipboard:read-image',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TOGGLE: 'window:toggle',
  WIDGET_EXPAND: 'widget:expand',
  WIDGET_COLLAPSE: 'widget:collapse',
  CAPTURE_REGION: 'capture:region',
  LMSTUDIO_LIST_MODELS: 'lmstudio:list-models',
  LMSTUDIO_LOAD_MODEL: 'lmstudio:load-model',
  MCP_GET_CONFIG: 'mcp:get-config',
  MCP_SAVE_CONFIG: 'mcp:save-config',
  MCP_GET_STATUS: 'mcp:get-status',
  MCP_LIST_TOOLS: 'mcp:list-tools',
  MCP_RECONNECT: 'mcp:reconnect',
  MCP_GENERATE_DESC: 'mcp:generate-desc',
  CHAT_SEND_SILENT: 'chat:send-silent',
  SKILL_LIST: 'skill:list',
  SKILL_GET_CONTENT: 'skill:get-content',
  SKILL_SAVE: 'skill:save',
  SKILL_CREATE: 'skill:create',
  SKILL_DELETE: 'skill:delete',
  SKILL_OPEN_EDITOR: 'skill:open-editor',
  SKILL_OPEN_FOLDER: 'skill:open-folder',
  SKILL_INVOKE_SCRIPT: 'skill:invoke-script',
  SESSION_SET_ACTIVE: 'session:set-active',
  SESSION_GET_ACTIVE: 'session:get-active',
  SESSION_ACTIVE_CHANGED: 'session:active-changed',
  SESSION_UPDATED: 'session:updated',
} as const;
const IPC_CAPTURE_IMAGE_READY = 'capture:image-ready';

// レンダラープロセスに公開するAPI
contextBridge.exposeInMainWorld('arisChatAPI', {
  // === チャット ===
  sendMessage: (messages: ChatMessage[], sessionId: string, options?: { thinkMode?: boolean }) => {
    ipcRenderer.send(IPC_CHANNELS.CHAT_SEND, { messages, sessionId, thinkMode: options?.thinkMode ?? false });
  },
  onStreamChunk: (callback: (chunk: string) => void) => {
    const handler = (_: any, chunk: string) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM, handler);
  },
  onStreamEnd: (callback: (stats: ChatMessageStats) => void) => {
    const handler = (_: any, stats: ChatMessageStats) => callback(stats ?? {});
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_END, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_END, handler);
  },
  onStreamError: (callback: (error: string) => void) => {
    const handler = (_: any, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, handler);
  },
  abortChat: () => {
    ipcRenderer.send(IPC_CHANNELS.CHAT_ABORT);
  },
  sendSilentMessage: (messages: ChatMessage[], sessionId: string): Promise<{ content: string; stats?: ChatMessageStats; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_SILENT, messages, sessionId);
  },

  // === セッション管理 ===
  listSessions: (): Promise<ChatSession[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST);
  },
  getSession: (sessionId: string): Promise<ChatSession | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET, sessionId);
  },
  createSession: (session: ChatSession): Promise<ChatSession> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE, session);
  },
  deleteSession: (sessionId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, sessionId);
  },

  // === 設定 ===
  getSettings: (): Promise<ArisChatSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET);
  },
  setSettings: (settings: Partial<ArisChatSettings>): Promise<ArisChatSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings);
  },

  // === アイコン ===
  selectIcon: (target: 'app' | 'tray' | 'avatar'): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.ICON_SELECT, target);
  },
  selectPersonaIcon: (personaId: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PERSONA_ICON_SELECT, personaId);
  },

  // === スクリーンキャプチャ ===
  captureScreen: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREEN);
  },
  readClipboardImage: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_READ_IMAGE);
  },

  // === ウィンドウ操作 ===
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  openChatWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_TOGGLE),

  // === ウィジェット ===
  expandWidget: () => ipcRenderer.send(IPC_CHANNELS.WIDGET_EXPAND),
  collapseWidget: () => ipcRenderer.send(IPC_CHANNELS.WIDGET_COLLAPSE),
  moveWidget: (dx: number, dy: number) => ipcRenderer.send('widget:move-by', dx, dy),

  // === 範囲キャプチャ ===
  captureRegion: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_REGION);
  },

  // === LM Studio モデル操作 ===
  listLMStudioModels: (): Promise<LMStudioModelInfo[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LMSTUDIO_LIST_MODELS);
  },
  loadLMStudioModel: (modelId: string, contextLength: number): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LMSTUDIO_LOAD_MODEL, modelId, contextLength);
  },

  // === MCP ===
  getMCPConfig: (): Promise<MCPConfig> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_CONFIG);
  },
  saveMCPConfig: (config: MCPConfig): Promise<MCPServerStatus[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MCP_SAVE_CONFIG, config);
  },
  getMCPStatus: (): Promise<MCPServerStatus[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_STATUS);
  },
  listMCPTools: (): Promise<MCPToolInfo[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_TOOLS);
  },
  reconnectMCP: (): Promise<MCPServerStatus[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MCP_RECONNECT);
  },
  generateMCPDescription: (serverConfig: import('../shared/types').MCPServerConfig): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MCP_GENERATE_DESC, serverConfig);
  },

  // === スキル ===
  listSkills: (personaId: string): Promise<Skill[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST, personaId);
  },
  getSkillContent: (personaId: string, skillId: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_CONTENT, personaId, skillId);
  },
  saveSkill: (personaId: string, skillId: string, fields: { name: string; description: string; trigger?: string; scriptType?: string; scriptValue?: string; body: string }): Promise<Skill | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_SAVE, personaId, skillId, fields);
  },
  createSkill: (personaId: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_CREATE, personaId);
  },
  deleteSkill: (personaId: string, skillId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE, personaId, skillId);
  },
  openSkillInEditor: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_OPEN_EDITOR, filePath);
  },
  openSkillsFolder: (personaId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_OPEN_FOLDER, personaId);
  },
  invokeSkillScript: (personaId: string, skillId: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_INVOKE_SCRIPT, personaId, skillId);
  },

  // === セッション同期 ===
  setActiveSession: (sessionId: string | null) => {
    ipcRenderer.send(IPC_CHANNELS.SESSION_SET_ACTIVE, sessionId);
  },
  getActiveSession: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_ACTIVE);
  },
  onActiveSessionChanged: (callback: (sessionId: string | null) => void) => {
    const handler = (_: any, sessionId: string | null) => callback(sessionId);
    ipcRenderer.on(IPC_CHANNELS.SESSION_ACTIVE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_ACTIVE_CHANGED, handler);
  },
  onSessionUpdated: (callback: (sessionId: string) => void) => {
    const handler = (_: any, sessionId: string) => callback(sessionId);
    ipcRenderer.on(IPC_CHANNELS.SESSION_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_UPDATED, handler);
  },

  // === ナビゲーション ===
  onNavigate: (callback: (page: string) => void) => {
    const handler = (_: any, page: string) => callback(page);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },
  onCapturedImage: (callback: (imageBase64: string) => void) => {
    const handler = (_: any, imageBase64: string) => callback(imageBase64);
    ipcRenderer.on(IPC_CAPTURE_IMAGE_READY, handler);
    return () => ipcRenderer.removeListener(IPC_CAPTURE_IMAGE_READY, handler);
  },
});

// 型定義をグローバルに公開
export type ArisChatAPI = typeof import('./preload');
