import { ArisChatSettings, ChatMessage, ChatMessageStats, ChatSession, LMStudioModelInfo, MCPConfig, MCPServerStatus, MCPToolInfo } from '../../shared/types';

declare global {
  interface Window {
    arisChatAPI: {
      // チャット
      sendMessage: (messages: ChatMessage[], sessionId: string, options?: { thinkMode?: boolean }) => void;
      onStreamChunk: (callback: (chunk: string) => void) => () => void;
      onStreamEnd: (callback: (stats: ChatMessageStats) => void) => () => void;
      onStreamError: (callback: (error: string) => void) => () => void;
      abortChat: () => void;

      // セッション
      listSessions: () => Promise<ChatSession[]>;
      getSession: (sessionId: string) => Promise<ChatSession | null>;
      createSession: (session: ChatSession) => Promise<ChatSession>;
      deleteSession: (sessionId: string) => Promise<void>;

      // 設定
      getSettings: () => Promise<ArisChatSettings>;
      setSettings: (settings: Partial<ArisChatSettings>) => Promise<ArisChatSettings>;

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

      // MCP
      getMCPConfig: () => Promise<MCPConfig>;
      saveMCPConfig: (config: MCPConfig) => Promise<MCPServerStatus[]>;
      getMCPStatus: () => Promise<MCPServerStatus[]>;
      listMCPTools: () => Promise<MCPToolInfo[]>;
      reconnectMCP: () => Promise<MCPServerStatus[]>;

      // ナビゲーション
      onNavigate: (callback: (page: string) => void) => () => void;
      onCapturedImage: (callback: (imageBase64: string) => void) => () => void;
    };
  }
}

export {};
