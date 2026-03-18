// arischat-ext-filebrowser / dist/renderer.js
// ファイル単位でメインタブバーにタブを開くファイルブラウザ
// FileViewerPage は window.monaco（メインアプリが公開）を利用してシンタックスハイライトを実現

// ===== ファイルデータストア（tabId → ファイル初期データ） =====
const pendingFiles = new Map();

// ===== vscode-icons SVG キャッシュ（iconName → data URL）=====
const vsIcons = {};

// ===== スタイル定数 =====
const S = {
  panel:      { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontFamily:'sans-serif', fontSize:13 },
  toolbar:    { display:'flex', alignItems:'center', gap:4, padding:'6px 8px', borderBottom:'1px solid var(--aria-border,#2a2a2a)', flexShrink:0 },
  btn:        { padding:'3px 8px', borderRadius:4, border:'1px solid var(--aria-border,#444)', background:'var(--aria-bg,#1e1e1e)', color:'var(--aria-text,#ccc)', cursor:'pointer', fontSize:12 },
  btnPrimary: { padding:'3px 10px', borderRadius:4, border:'none', background:'var(--aria-primary,#7c6af7)', color:'#fff', cursor:'pointer', fontSize:12 },
  tree:       { flex:1, overflowY:'auto', overflowX:'hidden' },
  statusBar:  { padding:'2px 8px', fontSize:11, color:'var(--aria-text-muted,#666)', borderTop:'1px solid var(--aria-border,#2a2a2a)', flexShrink:0, display:'flex', justifyContent:'space-between' },
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
  'js','mjs','cjs','ts','tsx','jsx','json','jsonc','md','html','htm',
  'css','scss','sass','less','py','rs','go','rb','php','java','cs',
  'cpp','c','h','hpp','swift','kt','kts','dart','r','lua','ex','exs',
  'txt','log','sh','bash','zsh','ps1','bat','cmd','yaml','yml','toml',
  'xml','svg','sql','graphql','gql','env','gitignore','gitattributes',
  'editorconfig','prettierrc','eslintrc','babelrc','nvmrc',
]);

// Monaco の言語 ID へのマッピング
const EXT_LANG = {
  js:'javascript', mjs:'javascript', cjs:'javascript',
  jsx:'javascript', ts:'typescript', tsx:'typescript',
  json:'json', jsonc:'json',
  md:'markdown', markdown:'markdown',
  html:'html', htm:'html',
  css:'css', scss:'scss', sass:'scss', less:'less',
  py:'python', rb:'ruby', php:'php',
  java:'java', cs:'csharp',
  cpp:'cpp', c:'cpp', h:'cpp', hpp:'cpp',
  rs:'rust', go:'go', swift:'swift', kt:'kotlin', kts:'kotlin',
  dart:'dart', r:'r', lua:'lua', ex:'elixir', exs:'elixir',
  sh:'shell', bash:'shell', zsh:'shell',
  ps1:'powershell', bat:'bat', cmd:'bat',
  yaml:'yaml', yml:'yaml', toml:'ini',
  xml:'xml', svg:'xml',
  sql:'sql', graphql:'graphql', gql:'graphql',
  dockerfile:'dockerfile',
};

// 言語バッジの色
const LANG_COLORS = {
  typescript:'#3178c6', javascript:'#f0d040', python:'#3572a5',
  rust:'#dea584', go:'#00add8', css:'#9b59b6', html:'#e44d26',
  json:'#888', markdown:'#5b8dee', cpp:'#f34b7d', java:'#b07219',
  csharp:'#9b4f96', ruby:'#701516', php:'#4f5d95', shell:'#89e051',
  kotlin:'#7f52ff', swift:'#fa7343', dart:'#00b4ab', sql:'#e38c00',
  powershell:'#012456',
};

function fileIcon(name, isDir) {
  if (isDir) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_ICONS[ext] ?? '📄';
}

// ===== vscode-icons アイコン名マッピング（拡張子 → codicon 名）=====
const EXT_ICON_NAMES = {
  // コード・スクリプト
  js:'file-code', mjs:'file-code', cjs:'file-code',
  ts:'file-code', tsx:'file-code', jsx:'file-code',
  json:'file-code', jsonc:'file-code',
  md:'file-code', markdown:'file-code',
  html:'file-code', htm:'file-code',
  css:'file-code', scss:'file-code', sass:'file-code', less:'file-code',
  py:'file-code', rb:'file-code', php:'file-code',
  java:'file-code', cs:'file-code',
  cpp:'file-code', c:'file-code', h:'file-code', hpp:'file-code',
  rs:'file-code', go:'file-code', swift:'file-code',
  kt:'file-code', kts:'file-code', dart:'file-code',
  r:'file-code', lua:'file-code', ex:'file-code', exs:'file-code',
  sh:'file-code', bash:'file-code', zsh:'file-code',
  ps1:'file-code', bat:'file-code', cmd:'file-code',
  yaml:'file-code', yml:'file-code', toml:'file-code',
  xml:'file-code', sql:'file-code',
  graphql:'file-code', gql:'file-code',
  // メディア
  png:'file-media', jpg:'file-media', jpeg:'file-media',
  gif:'file-media', svg:'file-media', ico:'file-media',
  webp:'file-media', bmp:'file-media',
  mp4:'file-media', mov:'file-media', avi:'file-media', mkv:'file-media',
  mp3:'file-media', wav:'file-media', ogg:'file-media', flac:'file-media',
  // PDF
  pdf:'file-pdf',
  // アーカイブ
  zip:'file-zip', tar:'file-zip', gz:'file-zip',
  rar:'file-zip', '7z':'file-zip', bz2:'file-zip', xz:'file-zip',
  // バイナリ
  exe:'file-binary', dll:'file-binary', so:'file-binary',
  bin:'file-binary', wasm:'file-binary',
};

// アイコン名を解決する（isDir + 開閉状態を考慮）
function resolveIconName(name, isDir, expanded) {
  if (isDir) return expanded ? 'folder-opened' : 'folder';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_ICON_NAMES[ext] ?? 'file';
}

// vscode-icons SVG の <img> 要素を返す。未ロード時は絵文字にフォールバック
function renderFileIconEl(name, isDir, expanded) {
  const iconName = resolveIconName(name, isDir, expanded);
  const svgUrl = vsIcons[iconName];
  if (svgUrl) {
    return React.createElement('img', {
      src: svgUrl,
      width: 16, height: 16,
      style: { flexShrink:0, display:'block', opacity:0.85 },
      alt: '',
    });
  }
  // フォールバック: 絵文字
  const emoji = isDir ? '📁' : (EXT_ICONS[name.split('.').pop()?.toLowerCase() ?? ''] ?? '📄');
  return React.createElement('span', { style: { flexShrink:0 } }, emoji);
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

function getMonacoLanguage(filePath) {
  const name = (filePath || '').split(/[\\/]/).pop() ?? '';
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  if (name.toLowerCase().startsWith('.env')) return 'ini';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
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
      renderFileIconEl(item.name, item.isDir, item._expanded),
      React.createElement('span', { style: { flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, item.name),
      item.isFile && item.size != null
        ? React.createElement('span', { style: { fontSize:10, color:'#666', flexShrink:0 } }, fmtSize(item.size))
        : null,
      hover
        ? React.createElement('span', {
            style: { fontSize:10, padding:'1px 4px', marginLeft:4, borderRadius:3, background:'rgba(255,255,255,0.1)', flexShrink:0 },
            onClick: (e) => { e.stopPropagation(); onCopyPath(item.path); },
            title: 'パスをコピー',
          }, '\u{1F4CB}')
        : null,
    )
  );
}

// ===== FileBrowserPanel（sidebarPanel）=====
function FileBrowserPanel({ api }) {
  const [rootPath, setRootPath] = useState('');
  const [treeData, setTreeData] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState([]);
  const [showDrives, setShowDrives] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [, setIconsLoaded] = useState(false); // アイコンロード完了で再レンダリングを発火

  useEffect(() => {
    // vscode-icons SVG をロードしてキャッシュ
    api.ipc.invoke('get-vscode-icons').then(result => {
      if (result && typeof result === 'object') {
        Object.entries(result).forEach(([name, svg]) => {
          vsIcons[name] = 'data:image/svg+xml,' + encodeURIComponent(svg);
        });
        setIconsLoaded(true); // 再レンダリングをトリガー
      }
    });
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
      React.createElement('button', { style: S.btn, onClick: handleOpenFolder, title: 'フォルダを開く' }, '\u{1F4C2} 開く'),
      drives.length > 0
        ? React.createElement('button', { style: S.btn, onClick: () => setShowDrives(v => !v), title: 'ドライブを選択' }, '\u{1F4BE}')
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

// ===== FileViewerPage（pages.viewer）Monaco エディタ版 =====
// tabId 例: 'file:/path/to/foo.ts'
function FileViewerPage({ api, tabId }) {
  const initial  = pendingFiles.get(tabId) ?? { path:'', name:'', content:'' };
  const [filePath]  = useState(initial.path);
  const [fileName]  = useState(initial.name);
  const [modified, setModified]   = useState(false);
  const [lineCount, setLineCount] = useState(() => (initial.content.match(/\n/g)?.length ?? 0) + 1);

  const containerRef = useRef(null);
  const editorRef    = useRef(null);
  const originalRef  = useRef(initial.content);
  const modifiedRef  = useRef(false); // stale closure 回避

  const language = getMonacoLanguage(fileName || filePath);

  // ===== Monaco エディタ生成（マウント時に一度だけ）=====
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const monaco = window.monaco;
    if (!monaco) {
      console.warn('[FileViewer] window.monaco が未定義。monaco-global.ts が正しくロードされているか確認してください。');
      return;
    }

    const editor = monaco.editor.create(container, {
      value:                   initial.content,
      language,
      theme:                   'vs-dark',
      automaticLayout:         true,
      minimap:                 { enabled: true, scale: 1 },
      fontSize:                13,
      fontFamily:              "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
      fontLigatures:           true,
      lineNumbers:             'on',
      lineNumbersMinChars:     4,
      scrollBeyondLastLine:    false,
      wordWrap:                'off',
      renderLineHighlight:     'line',
      smoothScrolling:         true,
      cursorBlinking:          'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      guides:                  { bracketPairs: true, indentation: true },
      renderWhitespace:        'selection',
      tabSize:                 2,
    });

    editorRef.current = editor;

    // 変更追跡
    const changeDisposable = editor.onDidChangeModelContent(() => {
      const isChanged = editor.getValue() !== originalRef.current;
      if (isChanged !== modifiedRef.current) {
        modifiedRef.current = isChanged;
        setModified(isChanged);
      }
      setLineCount(editor.getModel()?.getLineCount() ?? 0);
    });

    // Ctrl+S / Cmd+S 保存
    const saveAction = editor.addAction({
      id:           'arischat-save-file',
      label:        'ファイルを保存',
      keybindings:  [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: async (ed) => {
        if (!modifiedRef.current || !filePath) return;
        const content = ed.getValue();
        const result  = await api.ipc.invoke('save-file', { filePath, content });
        if (!result.success) {
          alert('保存に失敗しました: ' + result.error);
        } else {
          originalRef.current  = content;
          modifiedRef.current  = false;
          setModified(false);
        }
      },
    });

    return () => {
      changeDisposable.dispose();
      saveAction.dispose();
      editor.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // マウント時一度だけ

  // ===== ツールバー保存 =====
  async function handleSave() {
    if (!modifiedRef.current || !filePath || !editorRef.current) return;
    const content = editorRef.current.getValue();
    const result  = await api.ipc.invoke('save-file', { filePath, content });
    if (!result.success) {
      alert('保存に失敗しました: ' + result.error);
    } else {
      originalRef.current = content;
      modifiedRef.current = false;
      setModified(false);
    }
  }

  // ===== ファイルが見つからない場合 =====
  if (!filePath) {
    return React.createElement('div', {
      style: { display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#666', fontSize:13, fontFamily:'sans-serif' },
    }, 'ファイルが見つかりません');
  }

  const langColor = LANG_COLORS[language] ?? '#666';

  return React.createElement('div', {
    style: { display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontFamily:'sans-serif' },
  },

    // ===== ツールバー =====
    React.createElement('div', {
      style: {
        display:'flex', alignItems:'center', gap:6, padding:'4px 8px',
        borderBottom:'1px solid var(--aria-border,#2a2a2a)', flexShrink:0,
        background:'var(--aria-bg-light,#252525)',
      },
    },
      // ファイルパス（省略表示）
      React.createElement('span', {
        style: { fontSize:11, color:'#888', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 },
        title: filePath,
      }, filePath),

      // 言語バッジ
      React.createElement('span', {
        style: {
          fontSize:10, padding:'1px 6px', borderRadius:3, flexShrink:0,
          background: langColor + '22',
          color: langColor,
          border: `1px solid ${langColor}55`,
          fontFamily:'monospace', fontWeight:'bold',
        },
      }, language),

      // 保存ボタン
      React.createElement('button', {
        style: { ...S.btnPrimary, opacity: modified ? 1 : 0.4, cursor: modified ? 'pointer' : 'default' },
        onClick: handleSave,
        disabled: !modified,
        title: 'Ctrl+S',
      }, '\u{1F4BE} 保存'),

      // 外部で開く
      React.createElement('button', {
        style: S.btn,
        onClick: () => api.ipc.invoke('open-external', { targetPath: filePath }),
        title: 'システムの既定アプリで開く',
      }, '\u2197 外部'),
    ),

    // ===== Monaco コンテナ =====
    React.createElement('div', {
      ref: containerRef,
      style: { flex:1, overflow:'hidden' },
    }),

    // ===== ステータスバー =====
    React.createElement('div', { style: S.statusBar },
      React.createElement('span', null, fileName + (modified ? ' \u2014 未保存の変更あり' : ' \u2014 保存済み')),
      React.createElement('span', null, lineCount + ' 行'),
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
