/**
 * arischat-ext-filebrowser / main.js
 * ファイル I/O の IPC ハンドラ（タブ管理はレンダラー側の store で行う）
 */
'use strict';

const os   = require('os');
const path = require('path');
const fs   = require('fs');

function activate(ctx) {

  // ===== ホームディレクトリ =====
  ctx.ipc.handle('get-home', async () => ({ path: os.homedir() }));

  // ===== ドライブ一覧 (Windows) / ルート =====
  ctx.ipc.handle('get-drives', async () => {
    if (process.platform === 'win32') {
      return new Promise(resolve => {
        require('child_process').exec('wmic logicaldisk get name', { timeout: 4000 }, (err, stdout) => {
          if (err) { resolve([{ path: 'C:\\', name: 'C:' }]); return; }
          const drives = stdout.trim().split('\n').slice(1)
            .map(l => l.trim()).filter(l => /^[A-Z]:$/.test(l))
            .map(d => ({ path: d + '\\', name: d }));
          resolve(drives.length ? drives : [{ path: 'C:\\', name: 'C:' }]);
        });
      });
    }
    return [{ path: '/', name: '/' }, { path: os.homedir(), name: '~' }];
  });

  // ===== フォルダ選択ダイアログ =====
  ctx.ipc.handle('open-folder-dialog', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'フォルダを開く', properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || !result.filePaths.length
      ? { success: false, path: null }
      : { success: true, path: result.filePaths[0] };
  });

  // ===== ディレクトリ一覧 =====
  ctx.ipc.handle('list-dir', async ({ dirPath }) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map(entry => {
        const fullPath = path.join(dirPath, entry.name);
        let size = null, mtime = null;
        try { const st = fs.statSync(fullPath); size = entry.isFile() ? st.size : null; mtime = st.mtimeMs; } catch {}
        return {
          name: entry.name, path: fullPath,
          isDir: entry.isDirectory(), isFile: entry.isFile(),
          ext: entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
          size, mtime,
        };
      });
      items.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, 'ja')));
      return { success: true, items, dirPath };
    } catch (err) {
      return { success: false, error: err.message, items: [], dirPath };
    }
  });

  // ===== ファイルを読み込む（最大 5 MB）=====
  ctx.ipc.handle('open-file', async ({ filePath, maxBytes = 5242880 }) => {
    try {
      const st = fs.statSync(filePath);
      if (st.size > maxBytes)
        return { success: false, error: `ファイルが大きすぎます (${(st.size / 1048576).toFixed(1)} MB)` };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, path: filePath, content, size: st.size };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ===== ファイルを保存 =====
  ctx.ipc.handle('save-file', async ({ filePath, content }) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ===== システムの既定アプリで開く =====
  ctx.ipc.handle('open-external', async ({ targetPath }) => {
    try { const { shell } = require('electron'); await shell.openPath(targetPath); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });
}

module.exports = { activate };
