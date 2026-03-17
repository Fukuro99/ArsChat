/**
 * arischat-ext-filebrowser / dist/renderer.js
 *
 * extension-loader が先頭に以下を注入:
 *   const React = window.__ARISCHAT_REACT__;
 *   const { useState, useEffect, useRef, useCallback, useMemo, ... } = React;
 */

// ===== スタイル定数 =====

const S = {
  // カラー
  text:       'rgba(255,255,255,0.85)',
  textMuted:  'rgba(255,255,255,0.45)',
  textDim:    'rgba(255,255,255,0.25)',
  border:     'rgba(255,255,255,0.08)',
  hover:      'rgba(255,255,255,0.06)',
  activeBtn:  'rgba(99,102,241,0.35)',
  errorBg:    'rgba(239,68,68,0.12)',
  errorText:  '#f87171',
  accent:     '#818cf8',
  // サイズ
  fontSm:  '11px',
  fontXs:  '10px',
  fontBase:'12px',
};

// ===== ユーティリティ =====

function fmtSize(bytes) {
  if (bytes == null || bytes < 0) return '';
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1048576)      return (bytes / 1024).toFixed(1)    + ' KB';
  if (bytes < 1073741824)   return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

const EXT_ICONS = {
  // Web
  '.html': '🌐', '.htm': '🌐', '.css': '🎨', '.scss': '🎨', '.sass': '🎨',
  // JS / TS
  '.js': '🟨', '.jsx': '🟨', '.ts': '🔷', '.tsx': '🔷', '.mjs': '🟨',
  // Data
  '.json': '📋', '.yaml': '📋', '.yml': '📋', '.toml': '📋', '.xml': '📋', '.csv': '📊',
  // Docs
  '.md': '📝', '.txt': '📝', '.rst': '📝', '.pdf': '📕',
  '.doc': '📘', '.docx': '📘', '.xls': '📗', '.xlsx': '📗', '.ppt': '📙', '.pptx': '📙',
  // Images
  '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.gif': '🖼️',
  '.svg': '🖼️', '.webp': '🖼️', '.ico': '🖼️', '.bmp': '🖼️',
  // Media
  '.mp4': '🎬', '.mov': '🎬', '.avi': '🎬', '.mkv': '🎬', '.webm': '🎬',
  '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.aac': '🎵', '.ogg': '🎵',
  // Archive
  '.zip': '🗜️', '.tar': '🗜️', '.gz': '🗜️', '.rar': '🗜️', '.7z': '🗜️',
  // Code (others)
  '.py': '🐍', '.go': '🐹', '.rs': '🦀', '.c': '⚙️', '.cpp': '⚙️',
  '.h': '⚙️', '.java': '☕', '.kt': '🟣', '.swift': '🍎', '.rb': '💎',
  '.php': '🐘', '.sh': '📜', '.bat': '📜', '.ps1': '📜',
  // Binary
  '.exe': '⚙️', '.msi': '⚙️', '.dmg': '💿', '.dll': '⚙️',
  // Font
  '.ttf': '🔤', '.otf': '🔤', '.woff': '🔤', '.woff2': '🔤',
};

function fileIcon(item) {
  if (item.isDir) return '📁';
  return EXT_ICONS[item.ext] || '📄';
}

function isTextFile(ext) {
  return [
    '.txt','.md','.rst','.json','.yaml','.yml','.toml','.xml','.csv',
    '.js','.mjs','.jsx','.ts','.tsx','.html','.htm','.css','.scss','.sass',
    '.py','.go','.rs','.c','.cpp','.h','.java','.kt','.rb','.php',
    '.sh','.bat','.ps1','.svg','.gitignore','.env',
  ].includes(ext);
}

// パスから親ディレクトリを取得
function parentDir(p) {
  const isWin = p.includes('\\');
  const sep   = isWin ? '\\' : '/';
  if (p.endsWith(sep)) {
    // ルート（C:\ や /）
    return null;
  }
  const idx = p.lastIndexOf(sep);
  if (idx <= 0) return isWin ? null : '/';
  const parent = p.slice(0, idx);
  // Windows: "C:" → "C:\"
  return (isWin && /^[A-Z]:$/.test(parent)) ? parent + '\\' : parent;
}

// ===== コンポーネント =====

const e = React.createElement;

// ─── ボタン ───
function IconBtn({ onClick, disabled, title, children, style }) {
  const [hov, setHov] = useState(false);
  return e('button', {
    onClick,
    disabled,
    title,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    style: {
      background:   hov && !disabled ? 'rgba(255,255,255,0.1)' : 'transparent',
      border:       'none',
      borderRadius: '4px',
      padding:      '3px 6px',
      color:        disabled ? S.textDim : S.textMuted,
      cursor:       disabled ? 'default' : 'pointer',
      fontSize:     '13px',
      lineHeight:   1,
      transition:   'background 0.1s',
      ...style,
    },
  }, children);
}

// ─── ブレッドクラム ───
function Breadcrumb({ filePath, onNavigate }) {
  const isWin = filePath.includes('\\');
  const sep   = isWin ? '\\' : '/';
  const raw   = filePath.split(sep).filter(Boolean);

  // crumbs: [{label, path}]
  const crumbs = raw.map((part, i) => {
    const joined = isWin
      ? raw.slice(0, i + 1).join(sep)
      : '/' + raw.slice(0, i + 1).join(sep);
    return {
      label: part,
      path:  isWin && i === 0 ? part + '\\' : joined,
    };
  });
  if (!isWin) crumbs.unshift({ label: '/', path: '/' });

  return e('div', {
    style: {
      display:      'flex',
      alignItems:   'center',
      flexWrap:     'wrap',
      gap:          '0',
      padding:      '5px 8px',
      fontSize:     S.fontSm,
      borderBottom: '1px solid ' + S.border,
      overflowX:    'auto',
      whiteSpace:   'nowrap',
      scrollbarWidth: 'none',
      flexShrink:   0,
    },
  },
    crumbs.map((c, i) => [
      e('button', {
        key:     'c' + i,
        onClick: () => onNavigate(c.path),
        style: {
          background: 'none',
          border:     'none',
          padding:    '0 1px',
          fontSize:   S.fontSm,
          color:      i === crumbs.length - 1 ? S.text : S.textMuted,
          fontWeight: i === crumbs.length - 1 ? '600' : '400',
          cursor:     'pointer',
          maxWidth:   '80px',
          overflow:   'hidden',
          textOverflow: 'ellipsis',
        },
        title: c.path,
      }, c.label),
      i < crumbs.length - 1 && e('span', {
        key:   's' + i,
        style: { color: S.textDim, fontSize: '10px', padding: '0 1px' },
      }, isWin ? '\\' : '/'),
    ]),
  );
}

// ─── ファイル行 ───
function FileRow({ item, onNavigate, onInsertPath, onPreview }) {
  const [hov, setHov] = useState(false);
  const canPreview = item.isFile && isTextFile(item.ext);

  return e('div', {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    onClick:      () => { if (item.isDir) onNavigate(item.path); },
    title:        item.path,
    style: {
      display:    'flex',
      alignItems: 'center',
      gap:        '5px',
      padding:    '3px 6px',
      cursor:     item.isDir ? 'pointer' : 'default',
      background: hov ? S.hover : 'transparent',
      borderRadius: '4px',
      userSelect: 'none',
    },
  },
    // アイコン
    e('span', { style: { fontSize: '13px', flexShrink: 0 } }, fileIcon(item)),
    // 名前
    e('span', {
      style: {
        flex:          1,
        fontSize:      S.fontBase,
        color:         item.isDir ? S.text : 'rgba(255,255,255,0.72)',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      },
    }, item.name),
    // サイズ
    !item.isDir && item.size != null &&
      e('span', { style: { fontSize: S.fontXs, color: S.textDim, flexShrink: 0 } }, fmtSize(item.size)),
    // ホバー時のアクション
    hov && e('div', { style: { display: 'flex', gap: '2px', flexShrink: 0 } },
      // プレビュー（テキストファイルのみ）
      canPreview && e('button', {
        onClick: (ev) => { ev.stopPropagation(); onPreview(item); },
        title: 'プレビュー',
        style: {
          background:   'rgba(99,102,241,0.25)',
          border:       'none',
          borderRadius: '3px',
          padding:      '1px 4px',
          fontSize:     '10px',
          color:        'rgba(255,255,255,0.75)',
          cursor:       'pointer',
        },
      }, '👁'),
      // パスコピー
      e('button', {
        onClick: (ev) => { ev.stopPropagation(); onInsertPath(item.path); },
        title: 'パスをクリップボードにコピー',
        style: {
          background:   'rgba(99,102,241,0.25)',
          border:       'none',
          borderRadius: '3px',
          padding:      '1px 4px',
          fontSize:     '10px',
          color:        'rgba(255,255,255,0.75)',
          cursor:       'pointer',
        },
      }, '📋'),
    ),
  );
}

// ─── ファイルプレビューモーダル ───
function PreviewModal({ item, api, onClose }) {
  const [content, setContent] = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    api.ipc.invoke('read-file', { filePath: item.path }).then(res => {
      if (res.success) setContent(res.content);
      else             setError(res.error);
    });
  }, [item.path]);

  return e('div', {
    style: {
      position:   'absolute',
      inset:      0,
      background: 'rgba(10,10,20,0.92)',
      display:    'flex',
      flexDirection: 'column',
      zIndex:     100,
    },
  },
    // ヘッダー
    e('div', {
      style: {
        display:    'flex',
        alignItems: 'center',
        gap:        '8px',
        padding:    '8px 10px',
        borderBottom: '1px solid ' + S.border,
        flexShrink: 0,
      },
    },
      e('span', { style: { fontSize: '12px', color: S.accent } }, '👁'),
      e('span', {
        style: { flex: 1, fontSize: S.fontSm, color: S.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        title: item.path,
      }, item.name),
      e('button', {
        onClick: onClose,
        style: {
          background: 'none', border: 'none', color: S.textMuted,
          cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 2px',
        },
      }, '✕'),
    ),
    // コンテンツ
    e('div', {
      style: { flex: 1, overflow: 'auto', padding: '10px' },
    },
      error   && e('p', { style: { color: S.errorText, fontSize: S.fontSm } }, '⚠ ' + error),
      !content && !error && e('p', { style: { color: S.textMuted, fontSize: S.fontSm } }, '読み込み中...'),
      content && e('pre', {
        style: {
          margin: 0,
          fontSize: '11px',
          lineHeight: '1.5',
          color: 'rgba(255,255,255,0.8)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
        },
      }, content),
    ),
  );
}

// ─── メインパネル ───
function FileBrowserPanel({ api }) {
  const [currentPath, setCurrentPath] = useState(null);
  const [items,       setItems]       = useState([]);
  const [history,     setHistory]     = useState([]);  // 戻る用スタック
  const [drives,      setDrives]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [preview,     setPreview]     = useState(null); // プレビュー中のファイル
  const [notification, setNotification] = useState(null);
  const [search,      setSearch]      = useState('');

  // 初期化: ホームディレクトリ + ドライブ一覧
  useEffect(() => {
    api.ipc.invoke('get-home').then(res => navigate(res.path, null));
    api.ipc.invoke('get-drives').then(setDrives);
  }, []);

  // ===== ナビゲーション =====
  function navigate(dir, fromPath) {
    setLoading(true);
    setError(null);
    setSearch('');
    api.ipc.invoke('list-dir', { dirPath: dir }).then(res => {
      setLoading(false);
      if (res.success) {
        // 履歴に前パスを積む
        if (fromPath != null) setHistory(h => [...h, fromPath]);
        setCurrentPath(dir);
        setItems(res.items);
      } else {
        setError(res.error);
      }
    });
  }

  // 戻る
  function goBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setLoading(true);
    setSearch('');
    api.ipc.invoke('list-dir', { dirPath: prev }).then(res => {
      setLoading(false);
      if (res.success) { setCurrentPath(prev); setItems(res.items); }
    });
  }

  // 上へ
  function goUp() {
    if (!currentPath) return;
    const parent = parentDir(currentPath);
    if (parent) navigate(parent, currentPath);
  }

  // パスをクリップボードにコピーして通知
  function onInsertPath(p) {
    navigator.clipboard.writeText(p)
      .then(() => showNotification('📋 パスをコピーしました'))
      .catch(() => showNotification('⚠ コピー失敗'));
  }

  function showNotification(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2000);
  }

  // ===== 表示アイテム（検索フィルター）=====
  const visibleItems = search.trim()
    ? items.filter(it => it.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const folderCount = visibleItems.filter(i => i.isDir).length;
  const fileCount   = visibleItems.filter(i => i.isFile).length;

  // ===== レンダリング =====
  return e('div', {
    style: {
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      position:      'relative',
      fontSize:      S.fontBase,
    },
  },

    // ===== トップバー（戻る・上へ・ドライブ）=====
    e('div', {
      style: {
        display:      'flex',
        alignItems:   'center',
        gap:          '2px',
        padding:      '6px 6px 6px 4px',
        borderBottom: '1px solid ' + S.border,
        flexShrink:   0,
      },
    },
      e(IconBtn, { onClick: goBack, disabled: history.length === 0, title: '戻る' }, '←'),
      e(IconBtn, { onClick: goUp,   title: '上のフォルダへ' }, '↑'),
      // フォルダを開く（システムダイアログ）
      e(IconBtn, {
        onClick: () => {
          api.ipc.invoke('open-folder-dialog').then(res => {
            if (res.success && res.path) navigate(res.path, currentPath);
          });
        },
        title: 'フォルダを開く...',
      }, '📂'),
      e(IconBtn, {
        onClick: () => currentPath && navigate(currentPath, null),
        title:   '更新',
        style:   { marginLeft: 'auto' },
      }, '↺'),
      // ドライブボタン（複数の場合）
      drives.length > 1 && e('div', { style: { display: 'flex', gap: '2px', marginLeft: '4px' } },
        drives.map(d =>
          e('button', {
            key:     d.path,
            onClick: () => navigate(d.path, currentPath),
            title:   d.path,
            style: {
              background:   currentPath?.startsWith(d.path.slice(0, -1)) ? S.activeBtn : 'rgba(255,255,255,0.06)',
              border:       'none',
              borderRadius: '4px',
              padding:      '2px 6px',
              fontSize:     S.fontXs,
              color:        S.textMuted,
              cursor:       'pointer',
            },
          }, d.name),
        ),
      ),
    ),

    // ===== ブレッドクラム =====
    currentPath && e(Breadcrumb, { filePath: currentPath, onNavigate: dir => navigate(dir, currentPath) }),

    // ===== 検索ボックス =====
    e('div', { style: { padding: '5px 6px', flexShrink: 0 } },
      e('input', {
        type:        'text',
        placeholder: 'フィルター...',
        value:       search,
        onChange:    ev => setSearch(ev.target.value),
        style: {
          width:        '100%',
          boxSizing:    'border-box',
          background:   'rgba(255,255,255,0.06)',
          border:       '1px solid rgba(255,255,255,0.12)',
          borderRadius: '5px',
          padding:      '4px 8px',
          fontSize:     S.fontSm,
          color:        S.text,
          outline:      'none',
        },
      }),
    ),

    // ===== ファイルリスト =====
    e('div', {
      style: { flex: 1, overflowY: 'auto', padding: '2px 4px' },
    },
      loading && e('div', {
        style: { textAlign: 'center', padding: '24px', color: S.textMuted, fontSize: S.fontSm },
      }, '読み込み中...'),

      error && e('div', {
        style: { margin: '8px', padding: '8px', background: S.errorBg, borderRadius: '5px', fontSize: S.fontSm, color: S.errorText },
      }, '⚠ ', error),

      !loading && !error && visibleItems.length === 0 && e('div', {
        style: { textAlign: 'center', padding: '24px', color: S.textDim, fontSize: S.fontSm },
      }, search ? '一致なし' : 'フォルダが空です'),

      !loading && visibleItems.map(item =>
        e(FileRow, {
          key:          item.path,
          item,
          onNavigate:   dir => navigate(dir, currentPath),
          onInsertPath,
          onPreview:    it => setPreview(it),
        }),
      ),
    ),

    // ===== フッター（件数）=====
    currentPath && e('div', {
      style: {
        padding:     '4px 8px',
        fontSize:    S.fontXs,
        color:       S.textDim,
        borderTop:   '1px solid ' + S.border,
        flexShrink:  0,
        whiteSpace:  'nowrap',
        overflow:    'hidden',
      },
    }, `${folderCount} フォルダ・${fileCount} ファイル`),

    // ===== プレビューモーダル =====
    preview && e(PreviewModal, {
      item:    preview,
      api,
      onClose: () => setPreview(null),
    }),

    // ===== コピー通知 =====
    notification && e('div', {
      style: {
        position:     'absolute',
        bottom:       '36px',
        left:         '50%',
        transform:    'translateX(-50%)',
        background:   'rgba(30,30,50,0.95)',
        border:       '1px solid rgba(99,102,241,0.4)',
        borderRadius: '6px',
        padding:      '5px 12px',
        fontSize:     S.fontSm,
        color:        S.accent,
        whiteSpace:   'nowrap',
        pointerEvents: 'none',
      },
    }, notification),
  );
}

// ===== エクスポート =====
export default {
  sidebarPanels: {
    browser: FileBrowserPanel,
  },
};
