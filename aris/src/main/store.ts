import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ArisChatSettings, DEFAULT_SETTINGS, ChatSession, MCPConfig, DEFAULT_MCP_CONFIG } from '../shared/types';

const DATA_DIR = path.join(app.getPath('userData'), 'arischat-data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const MCP_CONFIG_FILE = path.join(DATA_DIR, 'mcp-config.json');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const ICONS_DIR = path.join(DATA_DIR, 'custom-icons');

export function createStore() {
  // ディレクトリ作成
  [DATA_DIR, SESSIONS_DIR, ICONS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  return {
    // ===== 設定 =====
    getSettings(): ArisChatSettings {
      try {
        if (fs.existsSync(SETTINGS_FILE)) {
          const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
          return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
      } catch (err) {
        console.error('Failed to read settings:', err);
      }
      return { ...DEFAULT_SETTINGS };
    },

    saveSettings(settings: ArisChatSettings): void {
      try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    },

    // ===== セッション =====
    listSessions(): ChatSession[] {
      try {
        const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
        const sessions: ChatSession[] = files.map((f) => {
          const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8');
          return JSON.parse(raw);
        });
        return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch (err) {
        console.error('Failed to list sessions:', err);
        return [];
      }
    },

    getSession(sessionId: string): ChatSession | null {
      try {
        const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          return JSON.parse(raw);
        }
      } catch (err) {
        console.error('Failed to get session:', err);
      }
      return null;
    },

    saveSession(session: ChatSession): void {
      try {
        const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to save session:', err);
      }
    },

    deleteSession(sessionId: string): void {
      try {
        const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Failed to delete session:', err);
      }
    },

    // ===== MCP 設定 =====
    getMCPConfig(): MCPConfig {
      try {
        if (fs.existsSync(MCP_CONFIG_FILE)) {
          const raw = fs.readFileSync(MCP_CONFIG_FILE, 'utf-8');
          return { ...DEFAULT_MCP_CONFIG, ...JSON.parse(raw) };
        }
      } catch (err) {
        console.error('Failed to read MCP config:', err);
      }
      return { ...DEFAULT_MCP_CONFIG };
    },

    saveMCPConfig(config: MCPConfig): void {
      try {
        fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to save MCP config:', err);
      }
    },

    // ===== パス取得 =====
    getIconsDir(): string {
      return ICONS_DIR;
    },
  };
}
