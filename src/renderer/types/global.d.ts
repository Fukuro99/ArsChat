import { ArsChatSettings, ChatMessage, ChatMessageStats, ChatSession, LMStudioModelInfo, MCPConfig, MCPServerConfig, MCPServerStatus, MCPToolInfo, Skill, ExtensionInfo } from '../../shared/types';

interface FileBrowserItem {
  name: string;
  path: string;
  isDir: boolean;
  isFile: boolean;
  ext: string;
  size: number | null;
  mtime: number | null;
}

declare global {
  interface Window {
    arsChatAPI: {
      // チャット
      sendMessage: (messages: ChatMessage[], sessionId: string, options?: { thinkMode?: boolean; openFilePaths?: string[] }) => void;
      onStreamChunk: (callback: (chunk: string) => void) => () => void;
      onStreamEnd: (callback: (stats: ChatMessageStats) => void) => () => void;
      onStreamError: (callback: (error: string) => void) => () => void;
      abortChat: () => void;
      sendSilentMessage: (messages: ChatMessage[], sessionId: string) => Promise<{ content: string; stats?: ChatMessageStats; error?: string }>;

      // セッション
      listSessions: () => Promise<ChatSession[]>;
      getSession: (sessionId: string) => Promise<ChatSession | null>;
      createSession: (session: ChatSession) => Promise<ChatSession>;
      deleteSession: (sessionId: string) => Promise<void>;

      // 設定
      getSettings: () => Promise<ArsChatSettings>;
      setSettings: (settings: Partial<ArsChatSettings>) => Promise<ArsChatSettings>;

      // アイコン
      selectIcon: (target: 'app' | 'tray' | 'avatar') => Promise<string | null>;
      selectPersonaIcon: (personaId: string) => Promise<string | null>;

      // スクリーンキャプチャ
      captureScreen: () => Promise<string>;
      captureRegion: () => Promise<string | null>;
      readClipboardImage: () => Promise<string | null>;

      // ウィンドウ
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      openChatWindow: () => void;

      // ウィジェット
      expandWidget: () => void;
      collapseWidget: () => void;

      // LM Studio
      listLMStudioModels: () => Promise<LMStudioModelInfo[]>;
      loadLMStudioModel: (modelId: string, contextLength: number) => Promise<void>;

      // ウィジェット (追加)
      moveWidget: (dx: number, dy: number) => void;

      // セッション同期
      setActiveSession: (sessionId: string | null) => void;
      getActiveSession: () => Promise<string | null>;
      onActiveSessionChanged: (callback: (sessionId: string | null) => void) => () => void;
      onSessionUpdated: (callback: (sessionId: string) => void) => () => void;

      // MCP
      getMCPConfig: () => Promise<MCPConfig>;
      saveMCPConfig: (config: MCPConfig) => Promise<MCPServerStatus[]>;
      getMCPStatus: () => Promise<MCPServerStatus[]>;
      listMCPTools: () => Promise<MCPToolInfo[]>;
      reconnectMCP: () => Promise<MCPServerStatus[]>;
      generateMCPDescription: (serverConfig: MCPServerConfig) => Promise<string>;

      // メモリ
      getMemory: (personaId: string) => Promise<string | null>;
      setMemory: (personaId: string, content: string) => Promise<void>;
      clearMemory: (personaId: string) => Promise<void>;
      onSkillsUpdated: (callback: (personaId: string) => void) => () => void;

      // チャット履歴メモリ（MemOS）
      chatMemory: {
        list: (personaId: string, limit?: number) => Promise<any[]>;
        count: (personaId: string) => Promise<number>;
        clear: (personaId: string) => Promise<void>;
      };

      // スキル
      listSkills: (personaId: string) => Promise<Skill[]>;
      getSkillContent: (personaId: string, skillId: string) => Promise<string | null>;
      saveSkill: (personaId: string, skillId: string, fields: { name: string; description: string; trigger?: string; scriptType?: string; scriptValue?: string; body: string }) => Promise<Skill | null>;
      createSkill: (personaId: string) => Promise<string>;
      deleteSkill: (personaId: string, skillId: string) => Promise<void>;
      openSkillInEditor: (filePath: string) => Promise<void>;
      openSkillsFolder: (personaId: string) => Promise<void>;
      invokeSkillScript: (personaId: string, skillId: string) => Promise<string>;

      // 拡張機能
      extensions: {
        list: () => Promise<ExtensionInfo[]>;
        install: (url: string) => Promise<{ success: boolean; entry?: any; error?: string }>;
        uninstall: (extId: string) => Promise<{ success: boolean; error?: string }>;
        toggle: (extId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
        update: (extId: string) => Promise<{ success: boolean; error?: string }>;
        readRendererCode: (extId: string) => Promise<{ success: boolean; code?: string; error?: string }>;
        readReadme: (extId: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        onInstallProgress: (callback: (progress: { step: string; message: string }) => void) => () => void;
        on: (extId: string, channel: string, callback: (data: any) => void) => () => void;
        invoke: (extId: string, channel: string, data?: any) => Promise<any>;
        send: (extId: string, channel: string, data?: any) => void;
      };

      // ファイルブラウザ
      fileBrowser: {
        getHome: () => Promise<{ path: string }>;
        getDrives: () => Promise<{ path: string; name: string }[]>;
        openFolderDialog: () => Promise<{ success: boolean; path: string | null }>;
        listDir: (dirPath: string) => Promise<{ success: boolean; items: FileBrowserItem[]; dirPath: string; error?: string }>;
        openFile: (filePath: string) => Promise<{ success: boolean; path?: string; content?: string; size?: number; error?: string }>;
        saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
        openExternal: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
        getState: () => Promise<{ rootPath: string; expandedPaths: string[] }>;
        saveState: (state: { rootPath: string; expandedPaths: string[] }) => Promise<void>;
      };

      // ターミナル
      terminal: {
        create: (id: string, cols: number, rows: number, cwd?: string) => Promise<void>;
        write: (id: string, data: string) => void;
        resize: (id: string, cols: number, rows: number) => void;
        destroy: (id: string) => Promise<void>;
        onData: (id: string, callback: (data: string) => void) => () => void;
        onExit: (id: string, callback: () => void) => () => void;
      };

      // 拡張機能変更通知
      onExtChanged?: (callback: () => void) => () => void;

      // ナビゲーション
      onNavigate: (callback: (page: string) => void) => () => void;
      onCapturedImage: (callback: (imageBase64: string) => void) => () => void;
    };
  }
}

export {};
