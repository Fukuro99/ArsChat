import { autoUpdater } from 'electron-updater';
import { ipcMain, BrowserWindow } from 'electron';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdaterInfo {
  status: UpdaterStatus;
  version?: string;      // 利用可能なバージョン
  progress?: number;     // ダウンロード進捗 0–100
  error?: string;
}

let currentStatus: UpdaterInfo = { status: 'idle' };

/** メインウィンドウにステータスを送信する */
function sendStatus(win: BrowserWindow | null, info: UpdaterInfo): void {
  currentStatus = info;
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:status', info);
  }
}

export function setupUpdater(win: BrowserWindow): void {
  // 開発環境ではアップデートチェックをスキップ
  if (!win.webContents.getURL().startsWith('http://localhost')) {
    // 本番環境のみ
  }

  autoUpdater.autoDownload = false;        // ユーザー確認後にダウンロード
  autoUpdater.autoInstallOnAppQuit = true; // 終了時に自動インストール

  // ===== イベントリスナー =====

  autoUpdater.on('checking-for-update', () => {
    sendStatus(win, { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus(win, { status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus(win, { status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus(win, {
      status: 'downloading',
      progress: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus(win, { status: 'ready', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    sendStatus(win, { status: 'error', error: err.message });
    console.error('[Updater] エラー:', err.message);
  });

  // ===== IPC ハンドラ =====

  /** レンダラーから「今すぐチェック」 */
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err: any) {
      sendStatus(win, { status: 'error', error: err?.message ?? 'Unknown error' });
    }
    return currentStatus;
  });

  /** レンダラーから「ダウンロード開始」 */
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err: any) {
      sendStatus(win, { status: 'error', error: err?.message ?? 'Unknown error' });
    }
    return currentStatus;
  });

  /** レンダラーから「再起動してインストール」 */
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  /** レンダラーから「現在のステータスを取得」 */
  ipcMain.handle('updater:get-status', () => currentStatus);

  // ===== 起動時の自動チェック（パッケージ済みビルドのみ） =====
  const { app } = require('electron');
  if (app.isPackaged) {
    // 起動後 5 秒待ってからチェック（起動処理の邪魔をしない）
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[Updater] 起動時チェックエラー:', err?.message);
      });
    }, 5000);
  }
}
