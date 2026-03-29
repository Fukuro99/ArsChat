export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  timestamp: number;
}
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
export interface AriaSettings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  theme: 'dark' | 'light';
  accentColor: string;
  customIconPath: string | null;
  customTrayIconPath: string | null;
  customAvatarPath: string | null;
  hotkey: string;
  launchAtStartup: boolean;
  alwaysOnTop: boolean;
  windowWidth: number;
  windowHeight: number;
}
export declare const DEFAULT_SETTINGS: AriaSettings;
export declare const IPC_CHANNELS: {
  readonly CHAT_SEND: 'chat:send';
  readonly CHAT_STREAM: 'chat:stream';
  readonly CHAT_STREAM_END: 'chat:stream-end';
  readonly CHAT_STREAM_ERROR: 'chat:stream-error';
  readonly CHAT_ABORT: 'chat:abort';
  readonly SESSION_LIST: 'session:list';
  readonly SESSION_GET: 'session:get';
  readonly SESSION_CREATE: 'session:create';
  readonly SESSION_DELETE: 'session:delete';
  readonly SETTINGS_GET: 'settings:get';
  readonly SETTINGS_SET: 'settings:set';
  readonly ICON_SELECT: 'icon:select';
  readonly ICON_RESET: 'icon:reset';
  readonly CAPTURE_SCREEN: 'capture:screen';
  readonly CAPTURE_REGION: 'capture:region';
  readonly WINDOW_MINIMIZE: 'window:minimize';
  readonly WINDOW_MAXIMIZE: 'window:maximize';
  readonly WINDOW_CLOSE: 'window:close';
  readonly WINDOW_TOGGLE: 'window:toggle';
};
//# sourceMappingURL=types.d.ts.map
