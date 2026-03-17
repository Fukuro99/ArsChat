// arischat-ext-filebrowser / dist/renderer.js
// ファイル単位でメインタブバーにタブを開くファイルブラウザ

// ===== ファイルデータストア（tabId → ファイル初期データ） =====
// openTab 呼び出し時にデータを格納し、FileViewerPage が初期化時に読む
const pendingFiles = new Map();
// tabId → { path, name, content, originalContent }

// ===== スタイル定数 =====
const S = {
  panel: { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontFamily:'sans-serif', fontSize:13 },
  toolbar: { display:'flex', alignItems:'center', gap:4, padding:'6px 8px', borderBottom:'1px solid var(--aria-border,#2a2a2a)', flexShrink:0 },
  btn: { padding:'3px 8px', borderRadius:4, border:'1px solid var(--aria-border,#444)', background:'var(--aria-bg,#1e1e1e)', color:'var(--aria-text,#ccc)', cursor:'pointer', fontSize:12 },
  btnPrimary: { padding:'3px 10px', borderRadius:4, border:'none', background:'var(--aria-primary,#7c6af7)', color:'#fff', cursor:'pointer', fontSize:12 },
  tree: { flex:1, overflowY:'auto', overflowX:'hidden' },
  statusBar: { padding:'2px 8px', fontSize:11, color:'var(--aria-text-muted,#666)', borderTop:'1px solid var(--aria-border,#2a2a2a)', flexShrink:0, display:'flex', justifyContent:'space-between' },
};

function treeRowStyle(depth, selected, hover) {
  return {
    display:'flex', alignItems:'center', padding:`2px 8px 2px ${8 + depth*16}px`,
    cursor:'pointer', userSelect:'none', fontSize:13, gap:4,
    background: selected ? 'rgba(124,106,247,0.2)' : hover ? 'rgba(255,255,255,0.05)' : 'transparent',
    color: selected ? 'var(--aria-primary,#7c6af7)' : 'var(--aria-text,#ccc)',
  };
}

// ===== ファイル種別ヘルパー =====
const EXT_ICONS = {
  js:'📄', ts:'📄', tsx:'⚛️', jsx:'⚛️', json:'📋', md:'📝',
  html:'🌐', css:'🎨', scss:'🎨', py:'🐍', rs:'🦀', go:'🐹',
  txt:'📄', log:'📄', sh:'⚙️', bat:'⚙️', yaml:'📋', yml:'📋',
  toml:'📋', xml:'📋', sql:'🗄️', csv:'📊', png:'🖼️', jpg:'🖼️',
  jpeg:'🖼️', gif:'🖼️', svg:'🖼️', ico:'🖼️', pdf:'📕',
};
const TEXT_EXTS = new Set([
  'js','ts','tsx','jsx','json','md','html','css','scss','py','rs','go',
  'txt','log','sh','bat','yaml','yml','toml','xml','sql','csv','env',
  'gitignore','gitattributes','editorconfig','prettierrc','eslintrc',
]);

function fileIcon(name, isDir) {
  if (isDir) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_ICONS[ext] ?? '📄';
}

function isTextFile(name) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTS.has(ext);
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

// ===== TreeRow コンポーネント =====
function TreeRow({ row, selectedPath, onExpand, onFileClick, onCopyPath }) {
  const [hover, setHover] = useState(false);
  const { item, depth } = row;

  return (
    React.createElement('div', {
      style: treeRowStyle(depth, selectedPath === item.path, hover),
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onClick: () => item.isDir ? onExpand(item) : onFileClick(item),
      title: item.path,
    },
      item.isDir
        ? React.createElement('span', { style: { fontSize:10, width:12, textAlign:'center', flexShrink:0, color:'#888' } },
            item._expanded ? '▼' : '▶')
        : React.createElement('span', { style: { width:12, flexShrink:0 } }),
      React.createElement('span', { style: { flexShrink:0 } }, fileIcon(item.name, item.isDir)),
      React.createElement('span', { style: { flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, item.name),
      item.isFile && item.size != null
        ? React.createElement('span', { style: { fontSize:10, color:'#666', flexShrink:0 } }, fmtSize(item.size))
        : null,
      hover
        ? React.createElement('span', {
            style: { fontSize:10, padding:'1px 4px', marginLeft:4, borderRadius:3, background:'rgba(255,255,255,0.1)', flexShrink:0 },
            onClick: (e) => { e.stopPropagation(); onCopyPath(item.path); },
            title: 'パスをコピー',
          }, '📋')
        : null,
    )
  );
}

// ===== FileBrowserPanel（sidebarPanel）=====
function FileBrowserPanel({ api }) {
  const [rootPath, setRootPath] = useState('');
  const [treeData, setTreeData] = useState(new Map());   // dirPath → items[]
  const [expanded, setExpanded] = useState(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState([]);
  const [showDrives, setShowDrives] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    api.ipc.invoke('get-home').then(r => {
      if (r?.path) loadDir(r.path);
    });
    api.ipc.invoke('get-drives').then(r => {
      if (Array.isArray(r)) setDrives(r);
    });
  }, []);

  async function loadDir(dirPath) {
    setLoading(true);
    setRootPath(dirPath);
    setTreeData(new Map());
    setExpanded(new Set());
    setSelectedPath('');
    setStatusMsg('');
    const result = await api.ipc.invoke('list-dir', { dirPath });
    if (result.success) {
      setTreeData(new Map([[dirPath, result.items]]));
    } else {
      setStatusMsg('エラー: ' + result.error);
    }
    setLoading(false);
  }

  async function handleExpand(item) {
    setSelectedPath(item.path);
    const isOpen = expanded.has(item.path);
    if (isOpen) {
      setExpanded(prev => { const n = new Set(prev); n.delete(item.path); return n; });
    } else {
      if (!treeData.has(item.path)) {
        const result = await api.ipc.invoke('list-dir', { dirPath: item.path });
        if (result.success) {
          setTreeData(prev => new Map([...prev, [item.path, result.items]]));
        }
      }
      setExpanded(prev => new Set([...prev, item.path]));
    }
  }

  async function handleFileClick(item) {
    setSelectedPath(item.path);
    if (!isTextFile(item.name)) {
      setStatusMsg(`バイナリファイルは開けません: ${item.name}`);
      return;
    }
    setStatusMsg('読み込み中...');
    const result = await api.ipc.invoke('open-file', { filePath: item.path });
    if (result.success) {
      // ファイル単位でタブを開く
      const tabId = 'file:' + result.path;
      pendingFiles.set(tabId, {
        path: result.path,
        name: item.name,
        content: result.content,
      });
      api.navigation.openTab({
        id: tabId,
        label: item.name,
        icon: fileIcon(item.name, false),
        pageId: 'viewer',
      });
      setStatusMsg(`開きました: ${item.name}`);
    } else {
      setStatusMsg('エラー: ' + result.error);
    }
  }

  async function handleOpenFolder() {
    const result = await api.ipc.invoke('open-folder-dialog');
    if (result.success && result.path) {
      loadDir(result.path);
    }
  }

  function handleCopyPath(p) {
    navigator.clipboard?.writeText(p).catch(() => {});
    setStatusMsg('コピーしました: ' + p);
  }

  // ツリーフラット化（再帰）
  function flattenTree(items, depth) {
    const rows = [];
    for (const item of items) {
      const withFlag = { ...item, _expanded: expanded.has(item.path) };
      rows.push({ item: withFlag, depth });
      if (item.isDir && expanded.has(item.path)) {
        const children = treeData.get(item.path) ?? [];
        rows.push(...flattenTree(children, depth + 1));
      }
    }
    return rows;
  }

  const rootItems = treeData.get(rootPath) ?? [];
  const flatRows = flattenTree(rootItems, 0);

  return React.createElement('div', { style: S.panel },
    // ツールバー
    React.createElement('div', { style: S.toolbar },
      React.createElement('button', { style: S.btn, onClick: handleOpenFolder, title: 'フォルダを開く' }, '📂 開く'),
      drives.length > 0
        ? React.createElement('button', { style: S.btn, onClick: () => setShowDrives(v => !v), title: 'ドライブを選択' }, '💾')
        : null,
    ),

    // ドライブセレクター
    showDrives
      ? React.createElement('div', { style: { borderBottom:'1px solid var(--aria-border,#2a2a2a)', padding:'4px 8px', display:'flex', flexWrap:'wrap', gap:4 } },
          drives.map(d =>
            React.createElement('button', {
              key: d.path, style: { ...S.btn, fontSize:11 },
              onClick: () => { loadDir(d.path); setShowDrives(false); },
            }, d.name)
          )
        )
      : null,

    // 現在パス表示
    rootPath
      ? React.createElement('div', { style: { padding:'2px 8px 4px', fontSize:11, color:'#666', borderBottom:'1px solid var(--aria-border,#2a2a2a)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, rootPath)
      : null,

    // ツリー
    loading
      ? React.createElement('div', { style: { padding:16, color:'#666', fontSize:12 } }, '読み込み中...')
      : React.createElement('div', { style: S.tree },
          flatRows.length === 0 && rootPath
            ? React.createElement('div', { style: { padding:16, color:'#666', fontSize:12 } }, 'フォルダが空です')
            : flatRows.map(row =>
                React.createElement(TreeRow, {
                  key: row.item.path, row, selectedPath,
                  onExpand: handleExpand,
                  onFileClick: handleFileClick,
                  onCopyPath: handleCopyPath,
                })
              )
        ),

    // ステータスバー
    React.createElement('div', { style: S.statusBar },
      React.createElement('span', { style: { overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, statusMsg),
    ),
  );
}

// ===== FileViewerPage（pages.viewer）=====
// tabId prop（例: 'file:/path/to/foo.ts'）でどのファイルを表示するか決まる
function FileViewerPage({ api, tabId }) {
  // マウント時に pendingFiles から初期データを取得
  // display:none で保持されるため useState の値はタブ切り替えでも保持される
  const initial = pendingFiles.get(tabId) ?? { path: '', name: '', content: '' };
  const [content, setContent] = useState(initial.content);
  const [originalContent] = useState(initial.content);
  const [filePath] = useState(initial.path);
  const [fileName] = useState(initial.name);

  const modified = content !== originalContent;

  // Ctrl+S で保存
  const saveRef = useRef(null);
  useEffect(() => {
    saveRef.current = async () => {
      if (!modified || !filePath) return;
      const result = await api.ipc.invoke('save-file', { filePath, content });
      if (!result.success) alert('保存に失敗しました: ' + result.error);
    };
  });

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!filePath) {
    return React.createElement('div', {
      style: { display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#666', fontSize:13 }
    }, 'ファイルが見つかりません');
  }

  return React.createElement('div', {
    style: { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontSize:13 }
  },
    // ツールバー
    React.createElement('div', {
      style: { display:'flex', alignItems:'center', gap:6, padding:'4px 8px', borderBottom:'1px solid var(--aria-border,#2a2a2a)', flexShrink:0, background:'var(--aria-bg-light,#252525)' }
    },
      React.createElement('span', { style: { fontSize:11, color:'#666', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, filePath),
      React.createElement('button', {
        style: { ...S.btnPrimary, opacity: modified ? 1 : 0.4, cursor: modified ? 'pointer' : 'default' },
        onClick: () => saveRef.current?.(),
        disabled: !modified,
        title: 'Ctrl+S',
      }, '💾 保存'),
      React.createElement('button', {
        style: S.btn,
        onClick: () => api.ipc.invoke('open-external', { targetPath: filePath }),
        title: 'システムの既定アプリで開く',
      }, '↗ 外部で開く'),
    ),

    // エディタ
    React.createElement('textarea', {
      style: {
        flex:1, resize:'none', border:'none', outline:'none',
        background:'var(--aria-bg,#1e1e1e)', color:'var(--aria-text,#ccc)',
        padding:16, fontFamily:'monospace', fontSize:13, lineHeight:'1.6',
        overflowY:'auto',
      },
      value: content,
      onChange: (e) => setContent(e.target.value),
      spellCheck: false,
    }),

    // ステータスバー
    React.createElement('div', { style: S.statusBar },
      React.createElement('span', null, fileName + (modified ? ' — 未保存の変更あり' : ' — 保存済み')),
      React.createElement('span', null, content.split('\n').length + ' 行'),
    ),
  );
}

export default {
  sidebarPanels: {
    browser: FileBrowserPanel,
  },
  pages: {
    viewer: FileViewerPage,
  },
};
