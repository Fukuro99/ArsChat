/**
 * arischat-ext-filebrowser / dist/renderer.js
 *
 * VS Code 風ツリービュー（サイドバーパネル）+ テキストエディタ（メインページ）
 *
 * extension-loader が先頭に以下を注入:
 *   const React = window.__ARISCHAT_REACT__;
 *   const { useState, useEffect, useRef, useCallback, useMemo, ... } = React;
 */

const e = React.createElement;

// ===== スタイル定数 =====
const S = {
  bg:          '#1e1e2e',
  bgDark:      '#16162a',
  bgBar:       '#1a1a2d',
  text:        'rgba(255,255,255,0.88)',
  textMuted:   'rgba(255,255,255,0.50)',
  textDim:     'rgba(255,255,255,0.28)',
  border:      'rgba(255,255,255,0.08)',
  hover:       'rgba(255,255,255,0.07)',
  selected:    'rgba(99,102,241,0.32)',
  selText:     '#a5b4fc',
  accent:      '#6366f1',
  accentLight: '#818cf8',
  error:       '#f87171',
  fontXs:      '10px',
  fontSm:      '11px',
  fontBase:    '12px',
  mono:        '"Consolas", "Cascadia Code", "Fira Code", "SF Mono", monospace',
};

// ===== ファイルアイコン =====
const EXT_ICONS = {
  '.html':'🌐','.htm':'🌐','.css':'🎨','.scss':'🎨','.sass':'🎨','.less':'🎨',
  '.js':'🟨','.jsx':'🟨','.mjs':'🟨','.cjs':'🟨',
  '.ts':'🔷','.tsx':'🔷',
  '.json':'📋','.yaml':'📋','.yml':'📋','.toml':'📋','.xml':'📋','.csv':'📊',
  '.env':'🔑','.md':'📝','.txt':'📝','.rst':'📝','.pdf':'📕',
  '.png':'🖼️','.jpg':'🖼️','.jpeg':'🖼️','.gif':'🖼️','.svg':'🖼️','.webp':'🖼️','.ico':'🖼️',
  '.mp4':'🎬','.mov':'🎬','.avi':'🎬','.mkv':'🎬',
  '.mp3':'🎵','.wav':'🎵','.flac':'🎵',
  '.zip':'🗜️','.tar':'🗜️','.gz':'🗜️','.rar':'🗜️','.7z':'🗜️',
  '.py':'🐍','.go':'🐹','.rs':'🦀','.c':'⚙️','.cpp':'⚙️','.h':'⚙️',
  '.java':'☕','.kt':'🟣','.swift':'🍎','.rb':'💎','.php':'🐘',
  '.sh':'📜','.bat':'📜','.ps1':'📜','.lua':'🌙',
  '.exe':'⚙️','.dll':'⚙️','.so':'⚙️','.dmg':'💿',
  '.ttf':'🔤','.otf':'🔤','.woff':'🔤','.woff2':'🔤',
};
const TEXT_EXTS = new Set([
  '.txt','.md','.rst','.json','.yaml','.yml','.toml','.xml','.csv','.env',
  '.js','.mjs','.cjs','.jsx','.ts','.tsx','.html','.htm','.css','.scss','.sass','.less',
  '.py','.go','.rs','.c','.cpp','.h','.java','.kt','.rb','.php','.sh','.bat','.ps1','.lua',
  '.svg','.gitignore','.editorconfig','.ini','.cfg','.conf','.log','.lock',
]);

function fileIcon(ext) { return EXT_ICONS[ext] || '📄'; }
function isText(ext)   { return TEXT_EXTS.has(ext); }
function fmtSize(b) {
  if (b == null) return '';
  if (b < 1024)     return b + ' B';
  if (b < 1048576)  return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function basename(p)   { return p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p; }

// ===== ツリーの平坦化 =====
function flattenTree(dir, depth, treeData, expanded) {
  const items = treeData[dir];
  if (!items) return [];
  const rows = [];
  for (const item of items) {
    rows.push({ item, depth });
    if (item.isDir && expanded.has(item.path)) {
      rows.push(...flattenTree(item.path, depth + 1, treeData, expanded));
    }
  }
  return rows;
}

// ===== ツリー行 =====
function TreeRow({ row, isExpanded, isSelected, onToggle, onOpen, onCopy }) {
  const { item, depth } = row;
  const [hov, setHov] = useState(false);

  return e('div', {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
    onClick: () => item.isDir ? onToggle(item.path) : onOpen(item),
    title: item.path,
    style: {
      display:      'flex',
      alignItems:   'center',
      height:       '22px',
      paddingLeft:  (depth * 12 + (item.isDir ? 4 : 20)) + 'px',
      paddingRight: '6px',
      cursor:       'pointer',
      background:   isSelected ? S.selected : hov ? S.hover : 'transparent',
      userSelect:   'none',
      flexShrink:   0,
    },
  },
    // フォルダ矢印
    item.isDir && e('span', {
      style: {
        width: '14px', flexShrink: 0, fontSize: '8px', color: S.textMuted,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transform: isExpanded ? 'rotate(90deg)' : 'none',
        transition: 'transform 0.12s',
      },
    }, '▶'),
    // アイコン
    e('span', {
      style: { fontSize: '13px', marginRight: '5px', flexShrink: 0, lineHeight: 1 },
    }, item.isDir ? (isExpanded ? '📂' : '📁') : fileIcon(item.ext)),
    // 名前
    e('span', {
      style: {
        flex: 1, fontSize: S.fontBase,
        color:        isSelected ? S.selText : item.isDir ? S.text : 'rgba(255,255,255,0.75)',
        fontWeight:   isSelected ? '500' : 'normal',
        overflow:     'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      },
    }, item.name),
    // ホバー時 - サイズ + パスコピー
    hov && !item.isDir && item.size != null &&
      e('span', { style: { fontSize: S.fontXs, color: S.textDim, marginRight: '4px', flexShrink: 0 } },
        fmtSize(item.size)),
    hov && e('button', {
      onClick: ev => { ev.stopPropagation(); onCopy(item.path); },
      title: 'パスをコピー',
      style: {
        background: 'rgba(99,102,241,0.3)', border: 'none', borderRadius: '3px',
        padding: '0 4px', height: '16px', lineHeight: '16px',
        fontSize: '10px', color: 'rgba(200,200,255,0.8)', cursor: 'pointer', flexShrink: 0,
      },
    }, '📋'),
  );
}

// ===== ファイルブラウザ（サイドバーパネル）=====
function FileBrowserPanel({ api }) {
  const [rootPath, setRootPath] = useState(null);
  const [treeData, setTreeData] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    api.ipc.invoke('get-home').then(res => openRoot(res.path));
  }, []);

  function openRoot(dir) {
    setRootPath(dir); setExpanded(new Set()); setTreeData({}); setSelected(null);
    loadDir(dir);
  }
  function loadDir(dir) {
    return api.ipc.invoke('list-dir', { dirPath: dir }).then(res => {
      if (res.success) setTreeData(prev => ({ ...prev, [dir]: res.items }));
      return res;
    });
  }
  function toggleDir(dir) {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(dir)) { s.delete(dir); }
      else            { s.add(dir); if (!treeData[dir]) loadDir(dir); }
      return s;
    });
  }
  function openFile(item) {
    if (!isText(item.ext)) { showToast('⚠ バイナリファイルは開けません'); return; }
    setSelected(item.path);
    api.ipc.invoke('open-file', { filePath: item.path }).then(res => {
      if (res.success) api.navigation.goTo('editor');
      else { showToast('⚠ ' + (res.error || '開けません')); setSelected(null); }
    });
  }
  function openFolderDialog() {
    api.ipc.invoke('open-folder-dialog').then(res => {
      if (res.success && res.path) openRoot(res.path);
    });
  }
  function refresh() {
    if (!rootPath) return;
    setExpanded(new Set()); setTreeData({}); loadDir(rootPath);
  }
  function copyPath(p) {
    navigator.clipboard.writeText(p).then(() => showToast('📋 コピーしました')).catch(() => {});
  }
  function showToast(msg) {
    setToast(msg); setTimeout(() => setToast(null), 2500);
  }

  const rootName = rootPath ? basename(rootPath).toUpperCase() : 'EXPLORER';
  const rows     = rootPath ? flattenTree(rootPath, 0, treeData, expanded) : [];

  return e('div', {
    style: { display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', fontSize: S.fontBase },
  },
    // ─── ヘッダー ───
    e('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '2px',
        padding: '0 8px', height: '35px',
        borderBottom: '1px solid ' + S.border, flexShrink: 0,
      },
    },
      e('span', {
        style: {
          flex: 1, fontSize: S.fontXs, fontWeight: '700', letterSpacing: '0.06em',
          color: S.textMuted, textTransform: 'uppercase',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
        title: rootPath || '',
      }, rootName),
      // フォルダを開く
      e('button', {
        onClick: openFolderDialog, title: 'フォルダを開く...',
        style: { background: 'none', border: 'none', borderRadius: '4px', padding: '4px 5px', fontSize: '14px', color: S.textMuted, cursor: 'pointer' },
      }, '📂'),
      // 更新
      e('button', {
        onClick: refresh, title: '更新',
        style: { background: 'none', border: 'none', borderRadius: '4px', padding: '4px 5px', fontSize: '13px', color: S.textMuted, cursor: 'pointer' },
      }, '↺'),
    ),
    // ─── ツリー ───
    e('div', { style: { flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' } },
      !rootPath &&
        e('div', { style: { padding: '24px 12px', textAlign: 'center', fontSize: S.fontSm, color: S.textDim } },
          '📂 フォルダを開いてください'),
      rootPath && !treeData[rootPath] &&
        e('div', { style: { padding: '24px 12px', textAlign: 'center', fontSize: S.fontSm, color: S.textDim } },
          '読み込み中...'),
      rows.map(row => e(TreeRow, {
        key:        row.item.path,
        row,
        isExpanded: expanded.has(row.item.path),
        isSelected: selected === row.item.path,
        onToggle:   toggleDir,
        onOpen:     openFile,
        onCopy:     copyPath,
      })),
    ),
    // ─── トースト ───
    toast && e('div', {
      style: {
        position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(28,28,48,0.96)', border: '1px solid rgba(99,102,241,0.45)',
        borderRadius: '6px', padding: '5px 12px',
        fontSize: S.fontSm, color: S.accentLight, whiteSpace: 'nowrap',
        pointerEvents: 'none', zIndex: 10,
      },
    }, toast),
  );
}

// ===== エディタページ（メインコンテンツ）=====
function FileEditorPage({ api }) {
  const [fileInfo, setFileInfo] = useState(null);
  const [text,     setText]     = useState('');
  const [modified, setModified] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState(null);

  // stale closure 対策 refs
  const textRef = useRef('');
  const fileRef = useRef(null);
  const modRef  = useRef(false);
  useEffect(() => { textRef.current = text;     }, [text]);
  useEffect(() => { fileRef.current = fileInfo; }, [fileInfo]);
  useEffect(() => { modRef.current  = modified; }, [modified]);

  // 現在開いているファイルをロード
  useEffect(() => {
    api.ipc.invoke('get-current-file').then(res => {
      if (res.success) {
        setFileInfo(res); setText(res.content); setModified(false); setSaveErr(null);
      }
    });
  }, []);

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') { ev.preventDefault(); doSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function doSave() {
    const fi = fileRef.current;
    if (!fi || !modRef.current) return;
    setSaving(true); setSaveErr(null);
    api.ipc.invoke('save-file', { filePath: fi.path, content: textRef.current }).then(res => {
      setSaving(false);
      if (res.success) setModified(false);
      else setSaveErr(res.error || '保存に失敗しました');
    });
  }

  const fileName = fileInfo ? basename(fileInfo.path) : '';
  const extDot   = fileName.lastIndexOf('.');
  const ext      = extDot > 0 ? fileName.slice(extDot).toLowerCase() : '';
  const lineCount = text ? text.split('\n').length : 0;
  const charCount = text ? text.length : 0;

  return e('div', {
    style: { display: 'flex', flexDirection: 'column', height: '100%', background: S.bg, color: S.text },
  },
    // ─── タブバー ───
    e('div', {
      style: {
        display: 'flex', alignItems: 'center',
        background: S.bgDark, borderBottom: '1px solid ' + S.border,
        flexShrink: 0, height: '36px', paddingLeft: '4px', gap: '2px',
      },
    },
      // ← ボタン
      e('button', {
        onClick: () => api.navigation.goToChat(), title: 'チャットに戻る',
        style: {
          background: 'none', border: 'none', borderRadius: '4px', padding: '4px 8px',
          fontSize: S.fontSm, color: S.textMuted, cursor: 'pointer',
        },
      }, '←'),
      // ファイルタブ
      fileInfo && e('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '0 12px 0 10px', height: '100%',
          background: S.bg, borderTop: '2px solid ' + S.accentLight,
          borderRight: '1px solid ' + S.border,
          fontSize: S.fontBase, color: S.text, userSelect: 'none',
        },
      },
        e('span', { style: { fontSize: '13px' } }, fileIcon(ext)),
        e('span', null, modified ? fileName + ' ●' : fileName),
        e('button', {
          onClick: () => api.navigation.goToChat(), title: '閉じる',
          style: {
            background: 'none', border: 'none', color: S.textMuted,
            cursor: 'pointer', fontSize: '12px', padding: '0 2px',
            borderRadius: '3px', marginLeft: '2px',
          },
        }, '✕'),
      ),
    ),

    // ─── ツールバー ───
    e('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '5px 12px', background: S.bgBar,
        borderBottom: '1px solid ' + S.border, flexShrink: 0,
      },
    },
      // ファイルパス
      fileInfo
        ? e('span', {
            title: fileInfo.path,
            style: { flex: 1, fontSize: S.fontXs, color: S.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }, fileInfo.path)
        : e('span', { style: { flex: 1 } }),
      saveErr && e('span', { style: { fontSize: S.fontSm, color: S.error } }, '⚠ ' + saveErr),
      // 保存ボタン
      e('button', {
        onClick: doSave, disabled: !modified || saving, title: 'Ctrl + S',
        style: {
          background:   modified && !saving ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)',
          border:       modified && !saving ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)',
          borderRadius: '5px', padding: '4px 14px',
          fontSize:     S.fontSm,
          color:        modified && !saving ? '#c7d2fe' : S.textDim,
          cursor:       modified && !saving ? 'pointer' : 'default',
          transition:   'all 0.15s', whiteSpace: 'nowrap',
        },
      }, saving ? '保存中...' : modified ? '保存  Ctrl+S' : '保存済み'),
    ),

    // ─── エディタ本体 ───
    e('div', { style: { flex: 1, position: 'relative', overflow: 'hidden' } },
      // ファイル未選択
      !fileInfo && e('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
      },
        e('div', { style: { textAlign: 'center', color: S.textDim } },
          e('div', { style: { fontSize: '52px', marginBottom: '16px' } }, '📄'),
          e('div', { style: { fontSize: '14px' } }, 'ファイルが選択されていません'),
          e('div', { style: { fontSize: S.fontSm, marginTop: '8px' } },
            '左のファイルブラウザからファイルを選択してください'),
        ),
      ),
      // テキストエリア
      fileInfo && e('textarea', {
        value: text,
        onChange: ev => { setText(ev.target.value); setModified(true); setSaveErr(null); },
        spellCheck: false,
        autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off',
        style: {
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          background: 'transparent', border: 'none', outline: 'none', resize: 'none',
          padding: '14px 18px', fontSize: '13px', lineHeight: '1.65',
          fontFamily: S.mono, color: 'rgba(255,255,255,0.88)',
          boxSizing: 'border-box', tabSize: 2,
        },
      }),
    ),

    // ─── ステータスバー ───
    e('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '0 12px', height: '22px',
        background: S.accent, fontSize: S.fontXs, color: 'rgba(255,255,255,0.9)',
        flexShrink: 0,
      },
    },
      e('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        fileName || ''),
      fileInfo && e('span', null, lineCount + ' 行'),
      fileInfo && e('span', null, charCount + ' 文字'),
      ext && e('span', null, ext.slice(1).toUpperCase()),
      e('span', { style: { fontWeight: modified ? '600' : 'normal' } },
        modified ? '● 未保存' : '保存済み'),
    ),
  );
}

// ===== エクスポート =====
export default {
  sidebarPanels: { browser: FileBrowserPanel },
  pages:         { editor:  FileEditorPage  },
};
