import { contextBridge, ipcRenderer } from 'electron';
// 型のみのインポート（コンパイル後に require を生成しない）
import type {
  ArsChatSettings,
  ChatMessage,
  ChatMessageStats,
  ChatSession,
  LMStudioModelInfo,
  MCPConfig,
  MCPServerStatus,
  MCPToolInfo,
  Skill,
} from '../shared/types';

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
  MEMORY_GET: 'memory:get',
  MEMORY_SET: 'memory:set',
  MEMORY_CLEAR: 'memory:clear',
  CHAT_MEMORY_LIST: 'chat-memory:list',
  CHAT_MEMORY_COUNT: 'chat-memory:count',
  CHAT_MEMORY_CLEAR: 'chat-memory:clear',
  SKILLS_UPDATED: 'skills:updated',
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
  // 拡張機能
  EXT_LIST: 'ext:list',
  EXT_INSTALL: 'ext:install',
  EXT_UNINSTALL: 'ext:uninstall',
  EXT_TOGGLE: 'ext:toggle',
  EXT_UPDATE: 'ext:update',
  EXT_READ_RENDERER: 'ext:read-renderer',
  EXT_RELOAD: 'ext:reload',
  EXT_READ_README: 'ext:read-readme',
} as const;
const IPC_CAPTURE_IMAGE_READY = 'capture:image-ready';

// レンダラープロセスに公開するAPI
contextBridge.exposeInMainWorld('arsChatAPI', {
  // === チャット ===
  sendMessage: (
    messages: ChatMessage[],
    sessionId: string,
    options?: { thinkMode?: boolean; openFilePaths?: string[] },
  ) => {
    ipcRenderer.send(IPC_CHANNELS.CHAT_SEND, {
      messages,
      sessionId,
      thinkMode: options?.thinkMode ?? false,
      openFilePaths: options?.openFilePaths ?? [],
    });
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
  sendSilentMessage: (
    messages: ChatMessage[],
    sessionId: string,
  ): Promise<{ content: string; stats?: ChatMessageStats; error?: string }> => {
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
  getSettings: (): Promise<ArsChatSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET);
  },
  setSettings: (settings: Partial<ArsChatSettings>): Promise<ArsChatSettings> => {
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

  // === メモリ ===
  getMemory: (personaId: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET, personaId);
  },
  setMemory: (personaId: string, content: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_SET, personaId, content);
  },
  clearMemory: (personaId: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CLEAR, personaId);
  },
  onSkillsUpdated: (callback: (personaId: string) => void) => {
    const handler = (_: any, personaId: string) => callback(personaId);
    ipcRenderer.on(IPC_CHANNELS.SKILLS_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILLS_UPDATED, handler);
  },

  // === チャット履歴メモリ（MemOS） ===
  chatMemory: {
    list: (personaId: string, limit?: number): Promise<any[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_MEMORY_LIST, personaId, limit),
    count: (personaId: string): Promise<number> => ipcRenderer.invoke(IPC_CHANNELS.CHAT_MEMORY_COUNT, personaId),
    clear: (personaId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CHAT_MEMORY_CLEAR, personaId),
  },

  // === スキル ===
  listSkills: (personaId: string): Promise<Skill[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST, personaId);
  },
  getSkillContent: (personaId: string, skillId: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_CONTENT, personaId, skillId);
  },
  saveSkill: (
    personaId: string,
    skillId: string,
    fields: {
      name: string;
      description: string;
      trigger?: string;
      scriptType?: string;
      scriptValue?: string;
      body: string;
    },
  ): Promise<Skill | null> => {
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

  // === 拡張機能 ===
  extensions: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.EXT_LIST),
    install: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.EXT_INSTALL, url),
    uninstall: (extId: string) => ipcRenderer.invoke(IPC_CHANNELS.EXT_UNINSTALL, extId),
    toggle: (extId: string, enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.EXT_TOGGLE, extId, enabled),
    update: (extId: string) => ipcRenderer.invoke(IPC_CHANNELS.EXT_UPDATE, extId),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.EXT_RELOAD),
    readRendererCode: (extId: string) => ipcRenderer.invoke(IPC_CHANNELS.EXT_READ_RENDERER, extId),
    readReadme: (extId: string) => ipcRenderer.invoke(IPC_CHANNELS.EXT_READ_README, extId),
    /** インストール進捗リスナー */
    onInstallProgress: (callback: (progress: { step: string; message: string }) => void) => {
      const handler = (_: any, progress: any) => callback(progress);
      ipcRenderer.on('ext:install-progress', handler);
      return () => ipcRenderer.removeListener('ext:install-progress', handler);
    },
    /** 拡張→Renderer イベント受信（Main Entry から送信されたもの） */
    on: (extId: string, channel: string, callback: (data: any) => void) => {
      const fullChannel = `ext:${extId}:${channel}`;
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on(fullChannel, handler);
      return () => ipcRenderer.removeListener(fullChannel, handler);
    },
    /** Renderer → Main Entry invoke */
    invoke: (extId: string, channel: string, data?: any) => ipcRenderer.invoke(`ext:${extId}:${channel}`, data),
    /** Renderer → Main Entry 送信（fire-and-forget） */
    send: (extId: string, channel: string, data?: any) => ipcRenderer.send(`ext:${extId}:${channel}`, data),
  },

  // === ファイルブラウザ ===
  fileBrowser: {
    getHome: (): Promise<{ path: string }> => ipcRenderer.invoke('filebrowser:get-home'),
    getDrives: (): Promise<{ path: string; name: string }[]> => ipcRenderer.invoke('filebrowser:get-drives'),
    openFolderDialog: (): Promise<{ success: boolean; path: string | null }> =>
      ipcRenderer.invoke('filebrowser:open-folder-dialog'),
    listDir: (dirPath: string): Promise<{ success: boolean; items: any[]; dirPath: string; error?: string }> =>
      ipcRenderer.invoke('filebrowser:list-dir', { dirPath }),
    openFile: (
      filePath: string,
    ): Promise<{ success: boolean; path?: string; content?: string; size?: number; error?: string }> =>
      ipcRenderer.invoke('filebrowser:open-file', { filePath }),
    saveFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('filebrowser:save-file', { filePath, content }),
    openExternal: (targetPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('filebrowser:open-external', { targetPath }),
    getState: (): Promise<{ rootPath: string; expandedPaths: string[] }> => ipcRenderer.invoke('filebrowser:get-state'),
    saveState: (state: { rootPath: string; expandedPaths: string[] }): Promise<void> =>
      ipcRenderer.invoke('filebrowser:save-state', state),
  },

  // === ターミナル ===
  terminal: {
    create: (id: string, cols: number, rows: number, cwd?: string, shell?: string): Promise<void> =>
      ipcRenderer.invoke('terminal:create', { id, cols, rows, cwd, shell }),
    write: (id: string, data: string): void => ipcRenderer.send('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number): void => ipcRenderer.send('terminal:resize', { id, cols, rows }),
    destroy: (id: string): Promise<void> => ipcRenderer.invoke('terminal:destroy', { id }),
    onData: (id: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${id}`;
      const handler = (_: any, data: string) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onExit: (id: string, callback: () => void) => {
      const channel = `terminal:exit:${id}`;
      const handler = () => callback();
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },

  // === アップデーター ===
  updater: {
    check: (): Promise<any> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<any> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    getStatus: (): Promise<any> => ipcRenderer.invoke('updater:get-status'),
    onStatus: (callback: (info: any) => void) => {
      const handler = (_: any, info: any) => callback(info);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
  },

  // === 拡張機能変更通知 ===
  onExtChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ext:changed', handler);
    return () => ipcRenderer.removeListener('ext:changed', handler);
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
export type ArsChatAPI = typeof import('./preload');
