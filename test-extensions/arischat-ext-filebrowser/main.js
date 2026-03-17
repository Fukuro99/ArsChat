/**
 * arischat-ext-filebrowser / main.js
 *
 * ファイルシステム操作を IPC で公開する Main Entry
 */
'use strict';

const os   = require('os');
const path = require('path');
const fs   = require('fs');

function activate(ctx) {

  // ===== ホームディレクトリ =====
  ctx.ipc.handle('get-home', async () => ({
    path: os.homedir(),
  }));

  // ===== ドライブ一覧 (Windows) / ルートパス =====
  ctx.ipc.handle('get-drives', async () => {
    if (process.platform === 'win32') {
      return new Promise((resolve) => {
        require('child_process').exec(
          'wmic logicaldisk get name',
          { timeout: 4000 },
          (err, stdout) => {
            if (err) {
              resolve([{ path: 'C:\\', name: 'C:' }]);
              return;
            }
            const drives = stdout
              .trim()
              .split('\n')
              .slice(1)
              .map(l => l.trim())
              .filter(l => /^[A-Z]:$/.test(l))
              .map(d => ({ path: d + '\\', name: d }));
            resolve(drives.length > 0 ? drives : [{ path: 'C:\\', name: 'C:' }]);
          },
        );
      });
    }
    // macOS / Linux
    return [
      { path: '/',            name: '/'  },
      { path: os.homedir(),   name: '~'  },
    ];
  });

  // ===== ディレクトリ一覧 =====
  ctx.ipc.handle('list-dir', async (_event, { dirPath }) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map(entry => {
        const fullPath = path.join(dirPath, entry.name);
        let size  = null;
        let mtime = null;
        try {
          const st = fs.statSync(fullPath);
          size  = entry.isFile() ? st.size : null;
          mtime = st.mtimeMs;
        } catch { /* アクセス不可のエントリは無視 */ }
        return {
          name:  entry.name,
          path:  fullPath,
          isDir: entry.isDirectory(),
          isFile: entry.isFile(),
          ext:   entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
          size,
          mtime,
        };
      });

      // フォルダ優先・名前順
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, 'ja');
      });

      return { success: true, items, dirPath };
    } catch (err) {
      return { success: false, error: err.message, items: [], dirPath };
    }
  });

  // ===== システムのデフォルトアプリで開く =====
  ctx.ipc.handle('open-external', async (_event, { targetPath }) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(targetPath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ===== テキストファイル読み込み（プレビュー用・上限 64 KB）=====
  ctx.ipc.handle('read-file', async (_event, { filePath, maxBytes = 65536 }) => {
    try {
      const st = fs.statSync(filePath);
      if (st.size > maxBytes) {
        return { success: false, error: `ファイルが大きすぎます (${(st.size / 1024).toFixed(0)} KB)`, size: st.size };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content, size: st.size };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { activate };
