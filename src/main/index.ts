import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  screen,
  shell,
  protocol,
} from 'electron';
import type { Rectangle, Display } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import * as pty from 'node-pty';

// ローカル画像ファイルを http://localhost から安全に読み込むためのカスタムスキーム
// ※ app.ready より前に呼び出す必要がある
protocol.registerSchemesAsPrivileged([
  { scheme: 'arschat-file', privileges: { bypassCSP: true, corsEnabled: true, supportFetchAPI: true } },
]);

// Windows コンソールを UTF-8 に設定
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }); } catch {}
}
import { ArsChatSettings, DEFAULT_SETTINGS, IPC_CHANNELS, ChatMessage, ChatMessageStats, ChatSession, MCPServerConfig } from '../shared/types';
import { createStore } from './store';
import { createClaudeService } from './claude';
import { createIconManager } from './icon-manager';
import { createMCPManager } from './mcp-manager';
import { createSkillManager } from './skill-manager';
import { createMemoryManager } from './memory-manager';
import { createChatMemoryManager, chunkText } from './chat-memory-manager';
import { createExtensionManager } from './extension-manager';
import { createExtensionContext } from './extension-context';
import { createHookManager } from './hook-manager';
import { setupUpdater } from './updater';

// ===== PTY セッション管理 =====
interface PtySession {
  process: pty.IPty;
  cols: number;
  rows: number;
}
const ptySessions = new Map<string, PtySession>();

// ===== グローバル変数 =====
let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let miniModeActive = false;
let normalWindowBounds: Rectangle | null = null;
let activeSessionId: string | null = null;

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const CAPTURE_HOTKEY = 'CommandOrControl+Shift+S';
const MINI_WINDOW_WIDTH = 380;
const MINI_WINDOW_HEIGHT = 560;
const WIDGET_WINDOW_SIZE = 96;
const WIDGET_EXPANDED_WIDTH = 320;
const WIDGET_EXPANDED_HEIGHT = 440;
const IPC_CAPTURE_IMAGE_READY = 'capture:image-ready';
const START_IN_WIDGET_MODE = true;
let regionCaptureWindow: BrowserWindow | null = null;

// ===== ストア初期化 =====
const store = createStore();
const iconManager = createIconManager();
const mcpManager = createMCPManager();
const skillManager = createSkillManager(store.getDataDir());
const memoryManager = createMemoryManager(store.getDataDir());
const chatMemoryManager = createChatMemoryManager(store.getDataDir());
const extensionManager = createExtensionManager(store.getDataDir());
const hookManager = createHookManager();

async function captureDisplayBase64(targetDisplay?: Display): Promise<string> {
  const display = targetDisplay ?? screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });

  if (sources.length === 0) {
    throw new Error('画面ソースを取得できませんでした。');
  }

  const matched = sources.find((source) => {
    const displayId = Number(source.display_id);
    return Number.isFinite(displayId) && displayId === display.id;
  });
  const source = matched || sources[0];
  const png = source.thumbnail.toPNG();
  if (!png || png.length === 0) {
    throw new Error('キャプチャ画像の生成に失敗しました。');
  }
  return png.toString('base64');
}

/** BrowserWindow が存在するディスプレイを返す */
function getDisplayForWindow(win: BrowserWindow): Display {
  const bounds = win.getBounds();
  const center = {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
  return screen.getDisplayNearestPoint(center);
}

function showMainWindow(options: { mini: boolean } = { mini: false }): void {
  if (!mainWindow) return;

  // メインウィンドウを表示する際はウィジェットを必ず非表示にする（同時表示禁止）
  if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
    widgetWindow.hide();
  }

  if (options.mini) {
    if (!miniModeActive) {
      normalWindowBounds = mainWindow.getBounds();
    }
    miniModeActive = true;
    mainWindow.setSize(MINI_WINDOW_WIDTH, MINI_WINDOW_HEIGHT);
    mainWindow.center();
  } else if (miniModeActive && normalWindowBounds) {
    mainWindow.setBounds(normalWindowBounds);
    miniModeActive = false;
    normalWindowBounds = null;
  }

  mainWindow.show();
  mainWindow.focus();
}

function sendCapturedImageToRenderer(imageBase64: string): void {
  if (!mainWindow) return;

  const dispatch = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('navigate', 'chat');
    mainWindow.webContents.send(IPC_CAPTURE_IMAGE_READY, imageBase64);
  };

  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once('did-finish-load', dispatch);
  } else {
    dispatch();
  }
}

async function startCaptureWorkflow(): Promise<void> {
  try {
    const imageBase64 = await captureDisplayBase64();
    showMainWindow({ mini: true });
    sendCapturedImageToRenderer(imageBase64);
  } catch (err: any) {
    dialog.showErrorBox('ArsChat', `キャプチャ起動に失敗しました: ${err?.message || 'unknown error'}`);
  }
}

// ===== 範囲キャプチャ（透明オーバーレイ → 座標取得 → クロップ方式） =====
async function startRegionCaptureWorkflow(): Promise<string | null> {
  try {
    // 1. メインウィンドウ・ウィジェットを一時非表示
    const mainWasVisible = mainWindow?.isVisible() ?? false;
    const widgetWasVisible = widgetWindow?.isVisible() ?? false;
    mainWindow?.hide();
    widgetWindow?.hide();

    // 少し待って画面が更新されるのを待つ
    await new Promise((r) => setTimeout(r, 150));

    // 2. フルスクリーン透明オーバーレイウィンドウを作成
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    regionCaptureWindow = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width,
      height,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreen: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // 透明キャンバスによる直接選択オーバーレイ
    // clearRect した領域は透明になり、実際の画面が透けて見える
    const overlayHTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; cursor: crosshair; user-select: none; }
  canvas { display: block; }
  #hint {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.75); color: #fff; padding: 8px 18px;
    border-radius: 8px; font: 13px/1.4 sans-serif; pointer-events: none;
    z-index: 10; white-space: nowrap;
  }
  #size-label {
    position: fixed; background: rgba(0,0,0,0.75); color: #fff;
    padding: 3px 8px; border-radius: 4px; font: 12px monospace;
    pointer-events: none; z-index: 10; display: none;
  }
</style></head><body>
  <canvas id="c"></canvas>
  <div id="hint">ドラッグで範囲を選択　Esc でキャンセル</div>
  <div id="size-label" id="sz"></div>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    const hint = document.getElementById('hint');
    const szLabel = document.querySelector('#size-label');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    function redraw(selX, selY, selW, selH, active) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 全体に半透明の暗幕
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (active && selW > 1 && selH > 1) {
        // 選択領域をクリア（実際の画面が透けて見える）
        ctx.clearRect(selX, selY, selW, selH);
        // 枠線
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.strokeRect(selX + 1, selY + 1, selW - 2, selH - 2);
        // 四隅のハンドル
        ctx.fillStyle = '#6366f1';
        const hs = 6;
        [[selX, selY],[selX+selW-hs, selY],[selX, selY+selH-hs],[selX+selW-hs, selY+selH-hs]].forEach(([hx,hy]) => {
          ctx.fillRect(hx, hy, hs, hs);
        });
      }
    }

    redraw(0, 0, 0, 0, false);

    let startX = 0, startY = 0, dragging = false;

    document.addEventListener('mousedown', (e) => {
      startX = e.clientX; startY = e.clientY; dragging = true;
      hint.style.display = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      redraw(x, y, w, h, true);
      // サイズラベル
      szLabel.style.display = 'block';
      szLabel.style.left = (x + w + 6) + 'px';
      szLabel.style.top = (y + h + 4) + 'px';
      szLabel.textContent = w + ' × ' + h;
    });

    document.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      if (w < 8 || h < 8) {
        document.title = 'CANCEL';
        return;
      }
      // 座標をメインプロセスに通知（クロップはメインプロセスで行う）
      document.title = 'RESULT:' + JSON.stringify({ x, y, w, h });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.title = 'CANCEL';
    });
  </script>
</body></html>`;

    regionCaptureWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHTML)}`);

    regionCaptureWindow.once('ready-to-show', () => {
      regionCaptureWindow?.show();
      regionCaptureWindow?.focus();
    });

    // 3. タイトル変更を監視して選択座標を取得
    const coordsJson = await new Promise<string | null>((resolve) => {
      if (!regionCaptureWindow) { resolve(null); return; }
      const checkTitle = () => {
        if (!regionCaptureWindow) { resolve(null); return; }
        const title = regionCaptureWindow.getTitle();
        if (title === 'CANCEL') {
          resolve(null);
        } else if (title.startsWith('RESULT:')) {
          resolve(title.slice(7));
        }
      };
      regionCaptureWindow.webContents.on('page-title-updated', checkTitle);
      regionCaptureWindow.on('closed', () => resolve(null));
    });

    // 4. オーバーレイを閉じてから実際にキャプチャ
    if (regionCaptureWindow && !regionCaptureWindow.isDestroyed()) {
      regionCaptureWindow.close();
    }
    regionCaptureWindow = null;

    let result: string | null = null;

    if (coordsJson) {
      const { x, y, w, h } = JSON.parse(coordsJson) as { x: number; y: number; w: number; h: number };

      // オーバーレイが消えるのを待ってからキャプチャ
      await new Promise((r) => setTimeout(r, 150));

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });
      const matched = sources.find((s) => {
        const did = Number(s.display_id);
        return Number.isFinite(did) && did === primaryDisplay.id;
      });
      const source = matched || sources[0];

      if (source) {
        // DPIスケールを考慮してクロップ
        const scaleFactor = primaryDisplay.scaleFactor;
        const cropped = source.thumbnail.crop({
          x: Math.floor(x * scaleFactor),
          y: Math.floor(y * scaleFactor),
          width: Math.max(1, Math.floor(w * scaleFactor)),
          height: Math.max(1, Math.floor(h * scaleFactor)),
        });
        result = cropped.toPNG().toString('base64');
      }
    }

    // 5. ウィンドウを復元（メインとウィジェットは排他 — どちらか一方のみ復元）
    if (mainWasVisible) {
      mainWindow?.show();
    } else if (widgetWasVisible) {
      widgetWindow?.showInactive();
    }

    return result;
  } catch (err: any) {
    // エラー時もウィンドウを復元
    if (regionCaptureWindow && !regionCaptureWindow.isDestroyed()) {
      regionCaptureWindow.close();
    }
    regionCaptureWindow = null;
    widgetWindow?.showInactive();
    dialog.showErrorBox('ArsChat', `範囲キャプチャに失敗しました: ${err?.message || 'unknown error'}`);
    return null;
  }
}

// ===== ウィンドウ作成 =====
function createMainWindow(): BrowserWindow {
  const settings = store.getSettings();

  const win = new BrowserWindow({
    width: settings.windowWidth,
    height: settings.windowHeight,
    minWidth: 380,
    minHeight: 500,
    frame: false,           // カスタムタイトルバー
    transparent: false,
    resizable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    show: false,
    icon: iconManager.getAppIcon(settings),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 読み込み
  if (isDev) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // 準備完了で表示
  win.once('ready-to-show', () => {
    if (!START_IN_WIDGET_MODE || isDev) {
      win.show();
    }
  });

  // 外部リンクはデフォルトブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // 閉じるボタンでトレイに格納
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // メインウィンドウが非表示になったらウィジェットを復元
  win.on('hide', () => {
    if (widgetWindow && !widgetWindow.isDestroyed() && !widgetWindow.isVisible()) {
      widgetWindow.showInactive();
      // メインウィンドウで使っていたセッションをウィジェットに通知
      if (activeSessionId) {
        widgetWindow.webContents.send(IPC_CHANNELS.SESSION_ACTIVE_CHANGED, activeSessionId);
      }
    }
  });

  return win;
}

function createWidgetWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const x = Math.round(workArea.x + workArea.width - WIDGET_WINDOW_SIZE - 24);
  const y = Math.round(workArea.y + workArea.height - WIDGET_WINDOW_SIZE - 120);

  const win = new BrowserWindow({
    width: WIDGET_WINDOW_SIZE,
    height: WIDGET_WINDOW_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    // transparent: true だけでは別モニターへ移動時に黒背景が出る場合があるため
    // ARGB 完全透明を明示指定する（Windows マルチモニター対策）
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: true,
    icon: iconManager.getAppIcon(store.getSettings()),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // モニター移動後に透明が崩れた場合の再描画
  win.on('moved', () => {
    win.setBackgroundColor('#00000000');
  });

  if (isDev) {
    win.loadURL(`${DEV_SERVER_URL}/?mode=widget`);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { mode: 'widget' } });
  }

  win.once('ready-to-show', () => {
    win.setAlwaysOnTop(true, 'screen-saver');
    // メインウィンドウが非表示のときのみウィジェットを表示
    if (!mainWindow || !mainWindow.isVisible()) {
      win.showInactive();
    }
  });

  win.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Ars を開く',
        click: () => {
          showMainWindow({ mini: false });
          mainWindow?.webContents.send('navigate', 'chat');
        },
      },
      {
        label: '画面をキャプチャ',
        click: () => {
          void startCaptureWorkflow();
        },
      },
      { type: 'separator' },
      {
        label: '終了',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    menu.popup({ window: win });
  });

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

// ===== システムトレイ =====
function createTray(): Tray {
  const settings = store.getSettings();
  const icon = iconManager.getTrayIcon(settings);
  const newTray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ars を開く',
      click: () => {
        showMainWindow({ mini: false });
      },
    },
    {
      label: 'キャプチャして起動（小型）',
      click: () => {
        void startCaptureWorkflow();
      },
    },
    { type: 'separator' },
    {
      label: '設定',
      click: () => {
        showMainWindow({ mini: false });
        mainWindow?.webContents.send('navigate', 'settings');
      },
    },
    { type: 'separator' },
    {
      label: '終了',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  newTray.setToolTip('ArsChat - AI Assistant');
  newTray.setContextMenu(contextMenu);

  newTray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showMainWindow({ mini: false });
    }
  });

  return newTray;
}

// ===== グローバルホットキー登録 =====
function registerHotkeys(hotkey: string): void {
  globalShortcut.unregisterAll();

  const toggleMain = () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showMainWindow({ mini: false });
    }
  };

  try {
    globalShortcut.register(hotkey, toggleMain);
  } catch (err) {
    console.error('Failed to register hotkey:', err);
  }

  if (hotkey !== CAPTURE_HOTKEY) {
    try {
      globalShortcut.register(CAPTURE_HOTKEY, () => {
        void startCaptureWorkflow();
      });
    } catch (err) {
      console.error('Failed to register capture hotkey:', err);
    }
  }

  if (isDev) {
    try {
      globalShortcut.register('CommandOrControl+Shift+I', () => {
        mainWindow?.webContents.toggleDevTools();
      });
    } catch (err) {
      console.error('Failed to register devtools hotkey:', err);
    }
  }
}

// ===== IPC ハンドラー設定 =====
function setupIPC(): void {
  const claude = createClaudeService(mcpManager);

  // --- チャット送信（ストリーミング） ---
  ipcMain.on(IPC_CHANNELS.CHAT_SEND, async (event, payload: {
    messages: ChatMessage[];
    sessionId: string;
    thinkMode?: boolean;
    openFilePaths?: string[];
  }) => {
    const settings = store.getSettings();
    if (settings.provider === 'anthropic' && !settings.apiKey) {
      event.sender.send(IPC_CHANNELS.CHAT_STREAM_ERROR, 'APIキーが設定されていません。設定画面からAPIキーを入力してください。');
      return;
    }

    // ビルトインスキル（Interactive UI）＋ アクティブペルソナのスキルを結合
    const builtinSkills = settings.enableInteractiveUI !== false
      ? skillManager.getBuiltinSkills()
      : [];
    const personaId = settings.activePersonaId ?? '';
    const personaSkills = personaId
      ? skillManager.listAllSkills(personaId)
      : [];
    const skills = [...builtinSkills, ...personaSkills];

    // アクティブペルソナのユーザーメモリ
    const userMemory = personaId ? memoryManager.getMemory(personaId) : null;

    // チャット履歴メモリ（MemOS）: 直近のユーザーメッセージで関連履歴を検索して注入
    let chatMemoriesText: string | undefined;
    if (settings.chatHistoryEnabled && personaId && settings.chatHistoryEmbeddingModel) {
      const lastUserMsg = [...payload.messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        hookManager.emit('memory:beforeSearch', { personaId, query: lastUserMsg.content });
        try {
          const _searchStart = Date.now();
          const results = await chatMemoryManager.searchMemories(personaId, lastUserMsg.content, {
            topK: settings.chatHistoryTopK ?? 3,
            baseUrl: settings.lmstudioBaseUrl,
            embeddingModel: settings.chatHistoryEmbeddingModel,
          });
          hookManager.emit('memory:afterSearch', { personaId, query: lastUserMsg.content, resultCount: results.length, durationMs: Date.now() - _searchStart });
          if (results.length > 0) {
            chatMemoriesText = results
              .map((r) => {
                const date = new Date(r.item.createdAt).toLocaleDateString('ja-JP');
                return `[${date}]\n${r.item.content}`;
              })
              .join('\n\n---\n\n');
          }
        } catch {
          // 失敗しても無視（LM Studio 未起動等）
        }
      }
    }

    const fileBrowserState = store.getFileBrowserState();

    // AI スキル管理コールバック（permission チェック込み）
    const skillContext = {
      skills,
      getContent: (skillId: string) =>
        skillManager.getSkillContent(personaId, skillId),
      invokeScript: async (skillId: string) => {
        const skill = skills.find((s) => s.id === skillId);
        if (!skill) return `スキル "${skillId}" が見つかりません`;
        return skillManager.invokeSkillScript(skill);
      },
      createAISkill: (name: string, description: string, body: string, trigger?: string) => {
        if (!personaId) return { success: false as const, message: 'アクティブなペルソナがありません' };
        try {
          const skill = skillManager.createAISkill(personaId, { name, description, body, trigger });
          mainWindow?.webContents.send(IPC_CHANNELS.SKILLS_UPDATED, personaId);
          return { success: true as const, skill, message: `スキル「${skill.name}」を作成しました` };
        } catch (e: any) {
          return { success: false as const, message: e.message };
        }
      },
      editSkill: (skillId: string, fields: { name?: string; description?: string; body?: string; trigger?: string }) => {
        if (!personaId) return { success: false as const, message: 'アクティブなペルソナがありません' };
        const existing = skillManager.findSkill(personaId, skillId);
        if (!existing) return { success: false as const, message: `スキル "${skillId}" が見つかりません` };
        if (existing.source === 'user') {
          const persona = settings.personas.find((p) => p.id === personaId);
          if (!persona?.allowAIEditUserSkills) {
            return { success: false as const, message: 'ユーザー作成スキルの編集は許可されていません。設定で「AIによるユーザースキル編集を許可」を有効にしてください。' };
          }
        }
        const body = fields.body ?? skillManager.getSkillContent(personaId, skillId) ?? '';
        skillManager.saveSkill(personaId, skillId, {
          name: fields.name ?? existing.name,
          description: fields.description ?? existing.description,
          trigger: fields.trigger ?? existing.trigger,
          body,
        });
        mainWindow?.webContents.send(IPC_CHANNELS.SKILLS_UPDATED, personaId);
        return { success: true as const };
      },
      deleteAISkill: (skillId: string) => {
        if (!personaId) return { success: false as const, message: 'アクティブなペルソナがありません' };
        const existing = skillManager.findSkill(personaId, skillId);
        if (!existing) return { success: false as const, message: `スキル "${skillId}" が見つかりません` };
        if (existing.source === 'user') {
          return { success: false as const, message: 'ユーザー作成スキルはAIが削除できません。削除が必要な場合はユーザーにお願いしてください。' };
        }
        skillManager.deleteAISkill(personaId, skillId);
        mainWindow?.webContents.send(IPC_CHANNELS.SKILLS_UPDATED, personaId);
        return { success: true as const };
      },
      updateMemory: (content: string) => {
        if (personaId) memoryManager.setMemory(personaId, content);
      },
    };

    // チャット後にアシスタント応答を蓄積してメモリ保存するためのバッファ
    let assistantBuffer = '';

    hookManager.emit('chat:beforeSend', { messages: payload.messages, systemPrompt: settings.systemPrompt });

    try {
      await claude.streamChat(
        settings,
        payload.messages,
        (chunk: string) => {
          assistantBuffer += chunk;
          event.sender.send(IPC_CHANNELS.CHAT_STREAM, chunk);

        },
        (stats: ChatMessageStats) => {
          hookManager.emit('chat:afterResponse', { messages: payload.messages, response: assistantBuffer, stats });
          event.sender.send(IPC_CHANNELS.CHAT_STREAM_END, stats);

          // チャット履歴メモリへ自動保存（非同期・失敗無視）
          if (settings.chatHistoryEnabled && personaId && assistantBuffer.trim()) {
            const lastUserMsg = [...payload.messages].reverse().find((m) => m.role === 'user');
            if (lastUserMsg) {
              const cleanResponse = assistantBuffer.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
              // 512 トークン制限に収まるようチャンク分割して保存
              const fullText = `ユーザー: ${lastUserMsg.content}\nアシスタント: ${cleanResponse}`;
              const chunks = chunkText(fullText);
              const storeOpts = {
                sessionId: payload.sessionId,
                baseUrl: settings.lmstudioBaseUrl,
                embeddingModel: settings.chatHistoryEmbeddingModel,
              };
              Promise.all(
                chunks.map((chunk) => {
                  hookManager.emit('memory:beforeStore', { personaId, content: chunk });
                  const _storeStart = Date.now();
                  return chatMemoryManager
                    .storeMemory(personaId, chunk, storeOpts)
                    .then(() => {
                      hookManager.emit('memory:afterStore', { personaId, content: chunk, durationMs: Date.now() - _storeStart });
                    });
                }),
              )
                .then(() => {
                  // 全チャンク保存後に1回だけプルーニング
                  chatMemoryManager.pruneMemories(personaId, settings.chatHistoryMaxItems ?? 200);
                })
                .catch(() => {});
            }
          }
        },
        {
          thinkMode: payload.thinkMode ?? false,
          fileBrowserState: fileBrowserState.rootPath ? fileBrowserState : undefined,
          openFilePaths: payload.openFilePaths && payload.openFilePaths.length > 0 ? payload.openFilePaths : undefined,
          userMemory: userMemory ?? undefined,
          chatMemories: chatMemoriesText,
          skillContext,
          onToolBefore: (toolName, input) =>
            hookManager.emit('tool:beforeExecute', { toolName, input }),
          onToolAfter: (toolName, input, result) =>
            hookManager.emit('tool:afterExecute', { toolName, input, result }),
        },
      );
    } catch (err: any) {
      event.sender.send(IPC_CHANNELS.CHAT_STREAM_ERROR, err.message || 'Unknown error');
    }
  });

  // --- チャット中断 ---
  ipcMain.on(IPC_CHANNELS.CHAT_ABORT, () => {
    claude.abort();
  });

  // --- サイレント送信（ライブUIモード用・ストリーミングなし・履歴保存なし） ---
  ipcMain.handle(IPC_CHANNELS.CHAT_SEND_SILENT, async (_event, messages: ChatMessage[], _sessionId: string) => {
    const settings = store.getSettings();
    if (settings.provider === 'anthropic' && !settings.apiKey) {
      return { content: '', error: 'APIキーが設定されていません。設定画面からAPIキーを入力してください。' };
    }
    try {
      const result = await claude.sendSilent(settings, messages);
      return result;
    } catch (err: any) {
      return { content: '', error: err.message || 'Unknown error', stats: {} };
    }
  });

  // --- セッション管理 ---
  ipcMain.handle(IPC_CHANNELS.SESSION_LIST, () => {
    return store.listSessions();
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET, (_e, sessionId: string) => {
    return store.getSession(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_CREATE, (_e, session: ChatSession) => {
    hookManager.emit('session:beforeSave', { session });
    const _saveStart = Date.now();
    store.saveSession(session);
    hookManager.emit('session:afterSave', { session, durationMs: Date.now() - _saveStart });
    // 送信元以外のウィンドウへセッション更新を通知（リアルタイム同期）
    const sender = _e.sender;
    for (const win of [mainWindow, widgetWindow]) {
      if (win && !win.isDestroyed() && win.webContents !== sender) {
        win.webContents.send(IPC_CHANNELS.SESSION_UPDATED, session.id);
      }
    }
    return session;
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DELETE, (_e, sessionId: string) => {
    store.deleteSession(sessionId);
  });

  // --- アクティブセッション同期（ウィジェット ↔ メインウィンドウ） ---
  ipcMain.on(IPC_CHANNELS.SESSION_SET_ACTIVE, (_e, sessionId: string | null) => {
    activeSessionId = sessionId;
    // 変更を両方のウィンドウへブロードキャスト（送信元以外）
    const sender = _e.sender;
    for (const win of [mainWindow, widgetWindow]) {
      if (win && !win.isDestroyed() && win.webContents !== sender) {
        win.webContents.send(IPC_CHANNELS.SESSION_ACTIVE_CHANGED, activeSessionId);
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ACTIVE, () => {
    return activeSessionId;
  });

  // --- 設定 ---
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return store.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_e, newSettings: Partial<ArsChatSettings>) => {
    const current = store.getSettings();
    const merged = { ...current, ...newSettings };
    store.saveSettings(merged);

    // ホットキー変更時は再登録
    if (newSettings.hotkey && newSettings.hotkey !== current.hotkey) {
      registerHotkeys(merged.hotkey);
    }

    // トレイアイコン変更
    if (newSettings.customTrayIconPath !== undefined || newSettings.accentColor) {
      const icon = iconManager.getTrayIcon(merged);
      tray?.setImage(icon);
    }

    // 常に最前面に表示の即時反映
    if (newSettings.alwaysOnTop !== undefined) {
      mainWindow?.setAlwaysOnTop(merged.alwaysOnTop);
    }

    // スタートアップ登録の即時反映
    if (newSettings.launchAtStartup !== undefined) {
      app.setLoginItemSettings({ openAtLogin: merged.launchAtStartup });
    }

    return merged;
  });

  // --- アイコン選択ダイアログ ---
  ipcMain.handle(IPC_CHANNELS.ICON_SELECT, async (_e, target: 'app' | 'tray' | 'avatar') => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'アイコン画像を選択',
      filters: [
        { name: '画像ファイル', extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const savedPath = await iconManager.saveCustomIcon(filePath, target);
    return savedPath;
  });

  // --- ペルソナアイコン選択ダイアログ ---
  ipcMain.handle(IPC_CHANNELS.PERSONA_ICON_SELECT, async (_e, personaId: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'ペルソナアイコン画像を選択',
      filters: [
        { name: '画像ファイル', extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const srcPath = result.filePaths[0];
    const ext = path.extname(srcPath);
    const iconsDir = store.getIconsDir();
    const destPath = path.join(iconsDir, `persona-${personaId}${ext}`);
    fs.copyFileSync(srcPath, destPath);
    return destPath;
  });

  // --- スクリーンキャプチャ（全画面） ---
  ipcMain.handle(IPC_CHANNELS.CAPTURE_SCREEN, async (event) => {
    try {
      // 送信元ウィンドウが存在するディスプレイを特定
      const senderWin = BrowserWindow.fromWebContents(event.sender);
      const targetDisplay = senderWin
        ? getDisplayForWindow(senderWin)
        : screen.getPrimaryDisplay();

      // ARIA自身が映り込まないようにウィンドウを一時非表示
      const mainWasVisible = mainWindow?.isVisible() ?? false;
      const widgetWasVisible = widgetWindow?.isVisible() ?? false;
      mainWindow?.hide();
      widgetWindow?.hide();
      await new Promise((r) => setTimeout(r, 150));

      const result = await captureDisplayBase64(targetDisplay);

      // ウィンドウを復元（メインとウィジェットは排他 — どちらか一方のみ復元）
      if (mainWasVisible) {
        mainWindow?.show();
      } else if (widgetWasVisible) {
        widgetWindow?.showInactive();
      }

      return result;
    } catch (err: any) {
      // エラー時も復元
      mainWindow?.show();
      throw new Error(`スクリーンキャプチャに失敗しました: ${err?.message || 'unknown error'}`);
    }
  });

  // --- クリップボード画像取得 ---
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_READ_IMAGE, () => {
    const direct = clipboard.readImage();
    if (!direct.isEmpty()) {
      const png = direct.toPNG();
      if (png && png.length > 0) return png.toString('base64');
    }

    const formats = clipboard.availableFormats();
    const candidates = ['image/png', 'PNG', 'image/jpeg', 'image/jpg', 'CF_DIB', 'CF_BITMAP'];
    for (const format of candidates) {
      if (!formats.includes(format)) continue;
      try {
        const buffer = clipboard.readBuffer(format);
        if (!buffer || buffer.length === 0) continue;
        const image = nativeImage.createFromBuffer(buffer);
        if (image.isEmpty()) continue;
        const png = image.toPNG();
        if (png && png.length > 0) return png.toString('base64');
      } catch {
        // フォーマット依存の変換失敗は次候補へ
      }
    }

    return null;
  });

  // --- ウィンドウ操作 ---
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => mainWindow?.minimize());
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => mainWindow?.hide());
  ipcMain.on(IPC_CHANNELS.WINDOW_TOGGLE, () => {
    showMainWindow({ mini: false });
    mainWindow?.webContents.send('navigate', 'chat');
    // メインウィンドウ表示時はウィジェットを非表示にする
    if (widgetWindow?.isVisible()) widgetWindow.hide();
    // ウィジェットで使っていたセッションをメインウィンドウに通知
    if (activeSessionId) {
      mainWindow?.webContents.send(IPC_CHANNELS.SESSION_ACTIVE_CHANGED, activeSessionId);
    }
  });

  // --- ウィジェット拡大/縮小 ---
  ipcMain.on(IPC_CHANNELS.WIDGET_EXPAND, () => {
    if (!widgetWindow) return;
    const bounds = widgetWindow.getBounds();
    // 右下を基準に拡大
    const newX = bounds.x + bounds.width - WIDGET_EXPANDED_WIDTH;
    const newY = bounds.y + bounds.height - WIDGET_EXPANDED_HEIGHT;
    widgetWindow.setBounds({
      x: newX,
      y: newY,
      width: WIDGET_EXPANDED_WIDTH,
      height: WIDGET_EXPANDED_HEIGHT,
    });
  });

  ipcMain.on(IPC_CHANNELS.WIDGET_COLLAPSE, () => {
    if (!widgetWindow) return;
    const bounds = widgetWindow.getBounds();
    // 右下を基準に縮小
    const newX = bounds.x + bounds.width - WIDGET_WINDOW_SIZE;
    const newY = bounds.y + bounds.height - WIDGET_WINDOW_SIZE;
    widgetWindow.setBounds({
      x: newX,
      y: newY,
      width: WIDGET_WINDOW_SIZE,
      height: WIDGET_WINDOW_SIZE,
    });
  });

  // --- ウィジェット移動（ドラッグ量を受け取って位置を更新） ---
  ipcMain.on('widget:move-by', (_event, dx: number, dy: number) => {
    if (!widgetWindow) return;
    const [x, y] = widgetWindow.getPosition();
    widgetWindow.setPosition(x + dx, y + dy);
  });

  // --- 範囲キャプチャ（オーバーレイ方式） ---
  ipcMain.handle(IPC_CHANNELS.CAPTURE_REGION, async () => {
    return await startRegionCaptureWorkflow();
  });

  // --- LM Studio モデル一覧取得 ---
  ipcMain.handle(IPC_CHANNELS.LMSTUDIO_LIST_MODELS, async () => {
    const settings = store.getSettings();
    return await claude.listLMStudioModels(settings.lmstudioBaseUrl);
  });

  // --- LM Studio モデルロード ---
  ipcMain.handle(IPC_CHANNELS.LMSTUDIO_LOAD_MODEL, async (_, modelId: string, contextLength: number) => {
    const settings = store.getSettings();
    await claude.loadLMStudioModel(settings.lmstudioBaseUrl, modelId, contextLength);
  });

  // --- MCP: 設定取得 ---
  ipcMain.handle(IPC_CHANNELS.MCP_GET_CONFIG, () => {
    return store.getMCPConfig();
  });

  // --- MCP: 設定保存 & 再接続 ---
  ipcMain.handle(IPC_CHANNELS.MCP_SAVE_CONFIG, async (_, config) => {
    store.saveMCPConfig(config);
    await mcpManager.connect(config.servers);
    return mcpManager.getStatus(config.servers);
  });

  // --- MCP: 接続状態取得 ---
  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, () => {
    const config = store.getMCPConfig();
    return mcpManager.getStatus(config.servers);
  });

  // --- MCP: ツール一覧取得 ---
  ipcMain.handle(IPC_CHANNELS.MCP_LIST_TOOLS, () => {
    return mcpManager.getToolInfoList();
  });

  // --- MCP: 手動再接続 ---
  ipcMain.handle(IPC_CHANNELS.MCP_RECONNECT, async () => {
    const config = store.getMCPConfig();
    await mcpManager.connect(config.servers);
    return mcpManager.getStatus(config.servers);
  });

  // --- MCP: サーバー説明をAIで自動生成 ---
  ipcMain.handle(IPC_CHANNELS.MCP_GENERATE_DESC, async (_e, serverConfig: MCPServerConfig) => {
    // 接続済みならキャッシュ利用、未接続なら一時接続してツール取得→即切断
    const tools = await mcpManager.getToolsTemporarily(serverConfig);
    if (tools.length === 0) throw new Error(`サーバー "${serverConfig.name}" のツールが0件のため説明を生成できません`);
    const settings = store.getSettings();
    const systemPrompt =
      '以下のMCPサーバーのツール一覧を見て、このサーバーが何をするものか2〜3行の簡潔な日本語で説明してください。' +
      '機能の概要のみを記述し、前置きや「このサーバーは」などの冗長な表現は不要です。';
    const userMessage = JSON.stringify(tools, null, 2);
    return claude.generateText(settings, systemPrompt, userMessage);
  });

  // --- メモリ: 取得 ---
  ipcMain.handle(IPC_CHANNELS.MEMORY_GET, (_e, personaId: string) => {
    return memoryManager.getMemory(personaId);
  });

  // --- メモリ: 保存 ---
  ipcMain.handle(IPC_CHANNELS.MEMORY_SET, (_e, personaId: string, content: string) => {
    memoryManager.setMemory(personaId, content);
  });

  // --- メモリ: クリア ---
  ipcMain.handle(IPC_CHANNELS.MEMORY_CLEAR, (_e, personaId: string) => {
    memoryManager.clearMemory(personaId);
  });

  // --- チャット履歴メモリ: 一覧取得 ---
  ipcMain.handle(IPC_CHANNELS.CHAT_MEMORY_LIST, (_e, personaId: string, limit?: number) => {
    return chatMemoryManager.listMemories(personaId, limit ?? 50);
  });

  // --- チャット履歴メモリ: 件数取得 ---
  ipcMain.handle(IPC_CHANNELS.CHAT_MEMORY_COUNT, (_e, personaId: string) => {
    return chatMemoryManager.getMemoryCount(personaId);
  });

  // --- チャット履歴メモリ: クリア ---
  ipcMain.handle(IPC_CHANNELS.CHAT_MEMORY_CLEAR, (_e, personaId: string) => {
    chatMemoryManager.clearMemories(personaId);
  });

  // --- スキル: 一覧取得（ユーザー + AI 両方） ---
  ipcMain.handle(IPC_CHANNELS.SKILL_LIST, (_e, personaId: string) => {
    return skillManager.listAllSkills(personaId);
  });

  // --- スキル: 本文取得 ---
  ipcMain.handle(IPC_CHANNELS.SKILL_GET_CONTENT, (_e, personaId: string, skillId: string) => {
    return skillManager.getSkillContent(personaId, skillId);
  });

  // --- スキル: 新規作成（テンプレート生成 + エディタで開く） ---
  ipcMain.handle(IPC_CHANNELS.SKILL_CREATE, (_e, personaId: string) => {
    return skillManager.createSkill(personaId);
  });

  // --- スキル: 保存（インライン編集） ---
  ipcMain.handle(IPC_CHANNELS.SKILL_SAVE, (_e, personaId: string, skillId: string, fields: { name: string; description: string; trigger?: string; scriptType?: string; scriptValue?: string; body: string }) => {
    return skillManager.saveSkill(personaId, skillId, fields);
  });

  // --- スキル: 削除 ---
  ipcMain.handle(IPC_CHANNELS.SKILL_DELETE, (_e, personaId: string, skillId: string) => {
    skillManager.deleteSkill(personaId, skillId);
  });

  // --- スキル: エディタで開く ---
  ipcMain.handle(IPC_CHANNELS.SKILL_OPEN_EDITOR, (_e, filePath: string) => {
    skillManager.openSkillInEditor(filePath);
  });

  // --- スキル: フォルダを開く ---
  ipcMain.handle(IPC_CHANNELS.SKILL_OPEN_FOLDER, (_e, personaId: string) => {
    skillManager.openSkillsFolder(personaId);
  });

  // --- スキル: スクリプト実行 ---
  ipcMain.handle(IPC_CHANNELS.SKILL_INVOKE_SCRIPT, async (_e, personaId: string, skillId: string) => {
    const skills = skillManager.listSkills(personaId);
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return `スキル "${skillId}" が見つかりません`;
    return skillManager.invokeSkillScript(skill);
  });

  // ===== 拡張機能 IPC =====

  // --- 拡張一覧 ---
  ipcMain.handle(IPC_CHANNELS.EXT_LIST, () => {
    return extensionManager.listForRenderer();
  });

  // --- 拡張インストール ---
  ipcMain.handle(IPC_CHANNELS.EXT_INSTALL, async (event, url: string) => {
    try {
      const entry = await extensionManager.install(url, (progress) => {
        event.sender.send('ext:install-progress', progress);
      });
      // インストール後にロード
      const claude = createClaudeService(mcpManager);
      await extensionManager.loadAll((e) =>
        createExtensionContext(e, extensionManager.getExtensionsDir(), store, claude, mainWindow, hookManager),
      );
      // レンダラーへ変更を通知
      mainWindow?.webContents.send('ext:changed');
      return { success: true, entry };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 拡張アンインストール ---
  ipcMain.handle(IPC_CHANNELS.EXT_UNINSTALL, async (_e, extId: string) => {
    try {
      await extensionManager.uninstall(extId);
      // レンダラーへ変更を通知
      mainWindow?.webContents.send('ext:changed');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 拡張有効/無効切り替え ---
  ipcMain.handle(IPC_CHANNELS.EXT_TOGGLE, async (_e, extId: string, enabled: boolean) => {
    try {
      await extensionManager.toggle(extId, enabled);
      // 切り替え後にメインプロセスの拡張を再ロードし、レンダラーへ通知
      await extensionManager.unloadAll();
      hookManager.removeAll();
      const claude = createClaudeService(mcpManager);
      await extensionManager.loadAll((e) =>
        createExtensionContext(e, extensionManager.getExtensionsDir(), store, claude, mainWindow, hookManager),
      );
      mainWindow?.webContents.send('ext:changed');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 拡張更新 ---
  ipcMain.handle(IPC_CHANNELS.EXT_UPDATE, async (event, extId: string) => {
    try {
      await extensionManager.update(extId, (progress) => {
        event.sender.send('ext:install-progress', progress);
      });
      // 更新後にメインプロセスの拡張を再ロードし、レンダラーへ通知
      await extensionManager.unloadAll();
      hookManager.removeAll();
      const claude = createClaudeService(mcpManager);
      await extensionManager.loadAll((e) =>
        createExtensionContext(e, extensionManager.getExtensionsDir(), store, claude, mainWindow, hookManager),
      );
      mainWindow?.webContents.send('ext:changed');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- README 取得 ---
  ipcMain.handle(IPC_CHANNELS.EXT_READ_README, (_e, extId: string) => {
    try {
      const entry = extensionManager.list().find((e) => e.id === extId);
      if (!entry) return { success: false, error: '拡張が見つかりません' };
      const extDir = path.isAbsolute(entry.source) && fs.existsSync(entry.source)
        ? entry.source
        : path.join(extensionManager.getExtensionsDir(), extId);
      const readmePath = path.join(extDir, 'README.md');
      if (!fs.existsSync(readmePath)) return { success: false, error: 'README.md が見つかりません' };
      return { success: true, content: fs.readFileSync(readmePath, 'utf-8') };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- Renderer Entry コード取得 ---
  ipcMain.handle(IPC_CHANNELS.EXT_READ_RENDERER, (_e, extId: string) => {
    try {
      return { success: true, code: extensionManager.readRendererCode(extId) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 拡張強制リロード ---
  ipcMain.handle(IPC_CHANNELS.EXT_RELOAD, async () => {
    try {
      await extensionManager.unloadAll();
      hookManager.removeAll();
      const claude = createClaudeService(mcpManager);
      await extensionManager.loadAll((e) =>
        createExtensionContext(e, extensionManager.getExtensionsDir(), store, claude, mainWindow, hookManager),
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- 拡張専用 IPC invoke（Renderer → Main Entry） ---
  // チャンネル名: ext:{extId}:{channel}
  // 拡張の activate() が ipcMain.handle で登録するため、ここでは追加不要。
  // ただし Renderer から invoke できるように preload でラップする。

  // ===== ファイルブラウザ IPC（標準搭載） =====

  ipcMain.handle('filebrowser:get-home', async () => ({ path: os.homedir() }));

  ipcMain.handle('filebrowser:get-drives', async () => {
    if (process.platform === 'win32') {
      return new Promise<{ path: string; name: string }[]>((resolve) => {
        exec('wmic logicaldisk get name', { timeout: 4000 }, (err, stdout) => {
          if (err) { resolve([{ path: 'C:\\', name: 'C:' }]); return; }
          const drives = stdout.trim().split('\n').slice(1)
            .map((l) => l.trim()).filter((l) => /^[A-Z]:$/.test(l))
            .map((d) => ({ path: d + '\\', name: d }));
          resolve(drives.length ? drives : [{ path: 'C:\\', name: 'C:' }]);
        });
      });
    }
    return [{ path: '/', name: '/' }, { path: os.homedir(), name: '~' }];
  });

  ipcMain.handle('filebrowser:open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'フォルダを開く',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || !result.filePaths.length
      ? { success: false, path: null }
      : { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('filebrowser:list-dir', async (_e, { dirPath }: { dirPath: string }) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        let size: number | null = null;
        let mtime: number | null = null;
        try {
          const st = fs.statSync(fullPath);
          size = entry.isFile() ? st.size : null;
          mtime = st.mtimeMs;
        } catch {}
        return {
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          isFile: entry.isFile(),
          ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
          size,
          mtime,
        };
      });
      items.sort((a, b) =>
        a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, 'ja'),
      );
      return { success: true, items, dirPath };
    } catch (err: any) {
      return { success: false, error: err.message, items: [], dirPath };
    }
  });

  ipcMain.handle('filebrowser:open-file', async (_e, { filePath, maxBytes = 5242880 }: { filePath: string; maxBytes?: number }) => {
    try {
      const st = fs.statSync(filePath);
      if (st.size > maxBytes) {
        return { success: false, error: `ファイルが大きすぎます (${(st.size / 1048576).toFixed(1)} MB)` };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, path: filePath, content, size: st.size };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('filebrowser:save-file', async (_e, { filePath, content }: { filePath: string; content: string }) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('filebrowser:open-external', async (_e, { targetPath }: { targetPath: string }) => {
    try {
      await shell.openPath(targetPath);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('filebrowser:get-state', () => {
    return store.getFileBrowserState();
  });

  ipcMain.handle('filebrowser:save-state', (_e, state: { rootPath: string; expandedPaths: string[] }) => {
    store.saveFileBrowserState(state);
  });

  // ===== ターミナル (node-pty) =====
  ipcMain.handle('terminal:create', (event, { id, cols, rows, cwd, shell: shellExec }: { id: string; cols: number; rows: number; cwd?: string; shell?: string }) => {
    if (ptySessions.has(id)) return;

    const shell = shellExec || (process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash'));
    const workDir = cwd || os.homedir();

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workDir,
      env: { ...process.env } as Record<string, string>,
    });

    ptyProcess.onData((data) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.webContents.send(`terminal:data:${id}`, data);
    });

    ptyProcess.onExit(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.webContents.send(`terminal:exit:${id}`);
      ptySessions.delete(id);
    });

    ptySessions.set(id, { process: ptyProcess, cols, rows });
  });

  ipcMain.on('terminal:write', (_e, { id, data }: { id: string; data: string }) => {
    ptySessions.get(id)?.process.write(data);
  });

  ipcMain.on('terminal:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    const session = ptySessions.get(id);
    if (session) {
      session.process.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    }
  });

  ipcMain.handle('terminal:destroy', (_e, { id }: { id: string }) => {
    const session = ptySessions.get(id);
    if (session) {
      try { session.process.kill(); } catch {}
      ptySessions.delete(id);
    }
  });
}

// ===== アプリ起動 =====
app.whenReady().then(() => {
  // arschat-file:///C:/path/to/file → ローカルファイルとして提供
  protocol.handle('arschat-file', (request) => {
    // "arschat-file:///C:/Users/..." → "/C:/Users/..."
    const withoutScheme = request.url.slice('arschat-file://'.length);
    const decoded = decodeURIComponent(withoutScheme);
    // Windows: "/C:/Users/..." → "C:/Users/..."  Unix: "/home/..." → "/home/..."
    const filePath = process.platform === 'win32'
      ? decoded.replace(/^\/([A-Za-z]:)/, '$1')
      : decoded;
    try {
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime =
        ext === 'png' ? 'image/png' :
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'svg' ? 'image/svg+xml' :
        ext === 'ico' ? 'image/x-icon' :
        'image/png';
      return new Response(data, { headers: { 'Content-Type': mime } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  setupIPC();
  mainWindow = createMainWindow();
  widgetWindow = createWidgetWindow();
  tray = createTray();

  // アップデーター初期化
  setupUpdater(mainWindow);

  const settings = store.getSettings();
  registerHotkeys(settings.hotkey);

  // MCP サーバーへの自動接続（バックグラウンド）
  const mcpConfig = store.getMCPConfig();
  if (mcpConfig.servers.some((s) => s.enabled)) {
    mcpManager.connect(mcpConfig.servers).catch((err) => {
      console.error('[MCP] 初期接続エラー:', err?.message);
    });
  }

  // 拡張機能の自動ロード（バックグラウンド）
  const claudeForExt = createClaudeService(mcpManager);
  extensionManager.loadAll((entry) =>
    createExtensionContext(entry, extensionManager.getExtensionsDir(), store, claudeForExt, mainWindow, hookManager),
  ).catch((err) => {
    console.error('[Extension] 初期ロードエラー:', err?.message);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      widgetWindow = createWidgetWindow();
    } else {
      showMainWindow({ mini: false });
      // メインウィンドウ表示中はウィジェットを非表示にする
      if (widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible()) {
        widgetWindow.hide();
      }
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  extensionManager.unloadAll().catch(() => {});
  hookManager.removeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
