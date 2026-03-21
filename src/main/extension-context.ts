/**
 * ExtensionContext
 *
 * 拡張機能の Main Entry に渡すコンテキストオブジェクト。
 * 権限に基づいてアクセスできる API を制御する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn as spawnChild } from 'child_process';
import { promisify } from 'util';
import { dialog, BrowserWindow, Notification, clipboard } from 'electron';
import { ipcMain } from 'electron';
import type {
  ExtensionRegistryEntry,
  ExtensionPermission,
  ChatMessage,
  ChatMessageStats,
  ChatSession,
} from '../shared/types';
import type { createStore } from './store';
import type { createClaudeService } from './claude';
import type { HookEventName, HookListener, HookManager } from './hook-manager';

const execAsync = promisify(exec);

// ===== 型定義 =====

export interface AIStreamParams {
  messages: ChatMessage[];
  systemPrompt?: string;
  onChunk: (chunk: string) => void;
  onEnd: (stats: ChatMessageStats) => void;
  onError: (error: string) => void;
}

export interface ShellExecOptions {
  cwd?: string;
  timeout?: number;
  encoding?: string;
}

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnHandle {
  onStdout: (cb: (data: string) => void) => void;
  onStderr: (cb: (data: string) => void) => void;
  onExit: Promise<number>;
  kill(): void;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  mtime: number;
}

export interface ExtensionContext {
  extension: {
    id: string;
    version: string;
    dataDir: string;
  };
  ai: {
    stream(params: AIStreamParams): AbortController;
    send(params: { messages: ChatMessage[]; systemPrompt?: string }): Promise<{ content: string; stats: ChatMessageStats }>;
    getProviderInfo(): Promise<{ provider: string; model: string }>;
  };
  shell: {
    exec(command: string, options?: ShellExecOptions): Promise<ShellExecResult>;
    spawn(command: string, args: string[], options?: { cwd?: string; env?: Record<string, string> }): SpawnHandle;
  };
  fs: {
    readFile(filePath: string, encoding?: BufferEncoding): Promise<string>;
    readFileRaw(filePath: string): Promise<Buffer>;
    writeFile(filePath: string, content: string | Buffer): Promise<void>;
    readDir(dirPath: string): Promise<DirEntry[]>;
    stat(filePath: string): Promise<FileStat>;
    exists(filePath: string): Promise<boolean>;
    mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
    remove(filePath: string): Promise<void>;
    showOpenDialog(options: Electron.OpenDialogOptions): Promise<string[] | null>;
    showSaveDialog(options: Electron.SaveDialogOptions): Promise<string | null>;
  };
  sessions: {
    list(): Promise<ChatSession[]>;
    get(id: string): Promise<ChatSession | null>;
    create(session: Omit<ChatSession, 'id'>): Promise<ChatSession>;
    update(id: string, patch: Partial<ChatSession>): Promise<void>;
  };
  settings: {
    get(): Promise<Record<string, any>>;
    set(patch: Record<string, any>): Promise<void>;
  };
  store: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  clipboard: {
    read(): Promise<string>;
    write(text: string): void;
  };
  ipc: {
    send(channel: string, data: any): void;
    on(channel: string, handler: (data: any) => void): () => void;
    handle(channel: string, handler: (data: any) => Promise<any>): () => void;
  };
  hooks: {
    on<K extends HookEventName>(event: K, listener: HookListener<K>): () => void;
  };
  log: {
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
  };
}

// ===== パーミッションガード =====

function permissionError(permission: string): never {
  throw new Error(`Permission denied: "${permission}" が必要です`);
}

function guarded<T extends object>(
  permission: ExtensionPermission,
  granted: Set<ExtensionPermission>,
  api: T,
): T {
  if (granted.has(permission)) return api;
  // Proxy ですべてのプロパティアクセスをブロック
  return new Proxy(api, {
    get(_target, _prop) {
      return () => permissionError(permission);
    },
  });
}

// ===== ファクトリ =====

export function createExtensionContext(
  entry: ExtensionRegistryEntry,
  extensionsDir: string,
  store: ReturnType<typeof createStore>,
  claudeService: ReturnType<typeof createClaudeService>,
  mainWindow: BrowserWindow | null,
  hookManager: HookManager,
): ExtensionContext {
  const granted = new Set<ExtensionPermission>(entry.permissions);
  const extId = entry.id;
  const extDataDir = path.join(extensionsDir, extId, 'data');

  // 拡張専用データディレクトリ確保
  if (!fs.existsSync(extDataDir)) {
    fs.mkdirSync(extDataDir, { recursive: true });
  }

  // 拡張固有 KV ストア（JSON ファイル）
  const kvPath = path.join(extDataDir, 'kv.json');
  function readKV(): Record<string, any> {
    try {
      if (fs.existsSync(kvPath)) return JSON.parse(fs.readFileSync(kvPath, 'utf-8'));
    } catch {}
    return {};
  }
  function writeKV(data: Record<string, any>): void {
    fs.writeFileSync(kvPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // 拡張専用 IPC チャンネルプレフィックス
  const ipcPrefix = `ext:${extId}:`;
  const registeredHandlers: string[] = [];

  // ===== AI API =====

  const aiAPI = {
    stream(params: AIStreamParams): AbortController {
      const settings = store.getSettings();
      const abortController = new AbortController();

      // 拡張専用 systemPrompt を使って streamChat
      const effectiveMessages: ChatMessage[] = params.systemPrompt
        ? [
            {
              id: '_ext_sys',
              role: 'user' as const,
              content: `[システム指示]\n${params.systemPrompt}`,
              timestamp: Date.now(),
            },
            ...params.messages,
          ]
        : params.messages;

      claudeService.streamChat(
        settings,
        effectiveMessages,
        (chunk: string) => params.onChunk(chunk),
        (stats: ChatMessageStats) => params.onEnd(stats),
        {},
      ).catch((err: any) => {
        if (!abortController.signal.aborted) {
          params.onError(err?.message ?? 'Unknown error');
        }
      });

      return abortController;
    },

    async send(params: { messages: ChatMessage[]; systemPrompt?: string }): Promise<{ content: string; stats: ChatMessageStats }> {
      const settings = store.getSettings();
      const effectiveMessages: ChatMessage[] = params.systemPrompt
        ? [
            {
              id: '_ext_sys',
              role: 'user' as const,
              content: `[システム指示]\n${params.systemPrompt}`,
              timestamp: Date.now(),
            },
            ...params.messages,
          ]
        : params.messages;

      return claudeService.sendSilent(settings, effectiveMessages);
    },

    async getProviderInfo(): Promise<{ provider: string; model: string }> {
      const settings = store.getSettings();
      return {
        provider: settings.provider,
        model: settings.provider === 'anthropic' ? settings.model : settings.lmstudioModel,
      };
    },
  };

  // ===== Shell API =====

  const shellAPI = {
    async exec(command: string, options: ShellExecOptions = {}): Promise<ShellExecResult> {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: options.cwd,
          timeout: options.timeout,
          encoding: (options.encoding as BufferEncoding) ?? 'utf-8',
        });
        return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
      } catch (err: any) {
        return {
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? err.message ?? '',
          exitCode: err.code ?? 1,
        };
      }
    },

    spawn(
      command: string,
      args: string[],
      options: { cwd?: string; env?: Record<string, string> } = {},
    ): SpawnHandle {
      const stdoutCallbacks: ((data: string) => void)[] = [];
      const stderrCallbacks: ((data: string) => void)[] = [];

      const proc = spawnChild(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: true,
      });

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stdoutCallbacks.forEach((cb) => cb(text));
      });
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stderrCallbacks.forEach((cb) => cb(text));
      });

      const exitPromise = new Promise<number>((resolve) => {
        proc.on('close', (code) => resolve(code ?? 0));
      });

      return {
        onStdout: (cb) => stdoutCallbacks.push(cb),
        onStderr: (cb) => stderrCallbacks.push(cb),
        onExit: exitPromise,
        kill: () => proc.kill(),
      };
    },
  };

  // ===== FS API =====

  const fsAPI = {
    async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
      return fs.promises.readFile(filePath, encoding);
    },
    async readFileRaw(filePath: string): Promise<Buffer> {
      return fs.promises.readFile(filePath);
    },
    async writeFile(filePath: string, content: string | Buffer): Promise<void> {
      await fs.promises.writeFile(filePath, content);
    },
    async readDir(dirPath: string): Promise<DirEntry[]> {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    },
    async stat(filePath: string): Promise<FileStat> {
      const s = await fs.promises.stat(filePath);
      return { size: s.size, isDirectory: s.isDirectory(), mtime: s.mtimeMs };
    },
    async exists(filePath: string): Promise<boolean> {
      try {
        await fs.promises.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(dirPath: string, options: { recursive?: boolean } = {}): Promise<void> {
      await fs.promises.mkdir(dirPath, options);
    },
    async remove(filePath: string): Promise<void> {
      const s = await fs.promises.stat(filePath);
      if (s.isDirectory()) {
        await fs.promises.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(filePath);
      }
    },
    async showOpenDialog(options: Electron.OpenDialogOptions): Promise<string[] | null> {
      const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const result = await dialog.showOpenDialog(win!, options);
      return result.canceled ? null : result.filePaths;
    },
    async showSaveDialog(options: Electron.SaveDialogOptions): Promise<string | null> {
      const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const result = await dialog.showSaveDialog(win!, options);
      return result.canceled ? null : result.filePath ?? null;
    },
  };

  // ===== Sessions API =====

  const sessionsAPI = {
    list: () => Promise.resolve(store.listSessions()),
    get: (id: string) => Promise.resolve(store.getSession(id)),
    async create(session: Omit<ChatSession, 'id'>): Promise<ChatSession> {
      const id = require('crypto').randomUUID() as string;
      const newSession: ChatSession = { ...(session as any), id };
      store.saveSession(newSession);
      return newSession;
    },
    async update(id: string, patch: Partial<ChatSession>): Promise<void> {
      const existing = store.getSession(id);
      if (!existing) throw new Error(`セッション "${id}" が見つかりません`);
      store.saveSession({ ...existing, ...patch });
    },
  };

  // ===== Settings API =====

  const settingsAPI = {
    async get(): Promise<Record<string, any>> {
      const s = store.getSettings() as any;
      // APIキーをマスク
      const { apiKey: _, ...safe } = s;
      return safe;
    },
    async set(patch: Record<string, any>): Promise<void> {
      const current = store.getSettings();
      // APIキーの変更は settings:write でも不可（セキュリティ）
      const { apiKey: _, ...safePatch } = patch;
      store.saveSettings({ ...current, ...safePatch });
    },
  };

  // ===== KV Store =====

  const storeAPI = {
    async get<T>(key: string): Promise<T | null> {
      return readKV()[key] ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      const kv = readKV();
      kv[key] = value;
      writeKV(kv);
    },
    async delete(key: string): Promise<void> {
      const kv = readKV();
      delete kv[key];
      writeKV(kv);
    },
    async keys(): Promise<string[]> {
      return Object.keys(readKV());
    },
  };

  // ===== Clipboard API =====

  const clipboardAPI = {
    async read(): Promise<string> {
      return clipboard.readText();
    },
    write(text: string): void {
      clipboard.writeText(text);
    },
  };

  // ===== IPC（拡張↔Renderer 間） =====

  const ipcAPI = {
    send(channel: string, data: any): void {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ipcPrefix + channel, data);
      }
    },
    on(channel: string, handler: (data: any) => void): () => void {
      const fullChannel = ipcPrefix + channel;
      const wrappedHandler = (_event: any, data: any) => handler(data);
      ipcMain.on(fullChannel, wrappedHandler);
      return () => ipcMain.removeListener(fullChannel, wrappedHandler);
    },
    handle(channel: string, handler: (data: any) => Promise<any>): () => void {
      const fullChannel = ipcPrefix + channel;
      const wrappedHandler = (_event: any, data: any) => handler(data);
      ipcMain.handle(fullChannel, wrappedHandler);
      registeredHandlers.push(fullChannel);
      return () => {
        ipcMain.removeHandler(fullChannel);
        const idx = registeredHandlers.indexOf(fullChannel);
        if (idx >= 0) registeredHandlers.splice(idx, 1);
      };
    },
  };

  // ===== Hooks API =====

  const hooksAPI = {
    on: <K extends HookEventName>(event: K, listener: HookListener<K>) =>
      hookManager.on(extId, event, listener),
  };

  // ===== Log =====

  const log = {
    info: (...args: any[]) => console.log(`[ext:${extId}]`, ...args),
    warn: (...args: any[]) => console.warn(`[ext:${extId}]`, ...args),
    error: (...args: any[]) => console.error(`[ext:${extId}]`, ...args),
  };

  // ===== コンテキスト組み立て（権限フィルタ） =====

  return {
    extension: {
      id: extId,
      version: entry.version,
      dataDir: extDataDir,
    },
    ai: (granted.has('ai:stream') || granted.has('ai:send'))
      ? aiAPI
      : guarded('ai:stream', granted, aiAPI),
    shell: granted.has('shell:execute')
      ? shellAPI
      : guarded('shell:execute', granted, shellAPI),
    fs: (granted.has('fs:read') || granted.has('fs:write'))
      ? fsAPI
      : guarded('fs:read', granted, fsAPI),
    sessions: (granted.has('session:read') || granted.has('session:write'))
      ? sessionsAPI
      : guarded('session:read', granted, sessionsAPI),
    settings: granted.has('settings:read')
      ? settingsAPI
      : guarded('settings:read', granted, settingsAPI),
    store: storeAPI,  // KV ストアは常に利用可能
    clipboard: (granted.has('clipboard:read') || granted.has('clipboard:write'))
      ? clipboardAPI
      : guarded('clipboard:read', granted, clipboardAPI),
    ipc: ipcAPI,
    hooks: granted.has('hooks:observe')
      ? hooksAPI
      : guarded('hooks:observe', granted, hooksAPI),
    log,
  };
}
