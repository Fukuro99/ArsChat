/**
 * FileBrowser.tsx
 * ファイルブラウザ（標準搭載）
 *  - FileBrowserPanel : サイドバーパネル（ツリー表示）
 *  - FileViewerPage   : メインタブのファイルビューワー（Monaco エディタ）
 */
import React, { useState, useEffect, useRef } from 'react';

import { pendingFiles } from './fileBrowserStore';

// ===== 型定義 =====
interface FileBrowserItem {
  name: string;
  path: string;
  isDir: boolean;
  isFile: boolean;
  ext: string;
  size: number | null;
  mtime: number | null;
}

// ===== 拡張子 → アイコンファイル名 マッピング =====
const EXT_ICON: Record<string, string> = {
  js: 'file_type_js', mjs: 'file_type_js', cjs: 'file_type_js',
  ts: 'file_type_typescript', tsx: 'file_type_reactts', jsx: 'file_type_reactjs',
  json: 'file_type_json', jsonc: 'file_type_json',
  yaml: 'file_type_yaml', yml: 'file_type_yaml',
  toml: 'file_type_toml', xml: 'file_type_xml',
  graphql: 'file_type_graphql', gql: 'file_type_graphql',
  sql: 'file_type_sql',
  md: 'file_type_markdown', markdown: 'file_type_markdown',
  html: 'file_type_html', htm: 'file_type_html',
  css: 'file_type_css', scss: 'file_type_scss', sass: 'file_type_sass', less: 'file_type_less',
  py: 'file_type_python',
  rs: 'file_type_rust',
  go: 'file_type_go',
  rb: 'file_type_ruby', php: 'file_type_php', java: 'file_type_java',
  cs: 'file_type_csharp',
  cpp: 'file_type_cpp', cc: 'file_type_cpp', cxx: 'file_type_cpp',
  c: 'file_type_c', h: 'file_type_c', hpp: 'file_type_cpp', hxx: 'file_type_cpp',
  dart: 'file_type_dartlang',
  kt: 'file_type_kotlin', kts: 'file_type_kotlin',
  swift: 'file_type_swift',
  lua: 'file_type_lua',
  ex: 'file_type_elixir', exs: 'file_type_elixir',
  wasm: 'file_type_wasm',
  txt: 'file_type_text', log: 'file_type_log',
  sh: 'file_type_shell', bash: 'file_type_shell', zsh: 'file_type_shell',
  bat: 'file_type_bat', cmd: 'file_type_bat',
  ps1: 'file_type_powershell',
  png: 'file_type_image', jpg: 'file_type_image', jpeg: 'file_type_image',
  gif: 'file_type_image', svg: 'file_type_image', ico: 'file_type_image', webp: 'file_type_image',
  pdf: 'file_type_pdf',
  dockerfile: 'file_type_docker',
  gitignore: 'file_type_git', gitattributes: 'file_type_git',
};

const FILENAME_ICON: Record<string, string> = {
  dockerfile: 'file_type_docker',
  'docker-compose.yml': 'file_type_docker',
  '.gitignore': 'file_type_git',
  '.gitattributes': 'file_type_git',
  '.env': 'file_type_text',
  '.env.local': 'file_type_text',
  '.env.production': 'file_type_text',
  '.nvmrc': 'file_type_text',
  '.editorconfig': 'file_type_text',
};

function resolveIconName(name: string, isDir: boolean, isExpanded: boolean): string {
  if (isDir) return isExpanded ? 'default_folder_opened' : 'default_folder';
  const lower = name.toLowerCase();
  if (FILENAME_ICON[lower]) return FILENAME_ICON[lower];
  if (lower.startsWith('.env')) return 'file_type_text';
  const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
  return EXT_ICON[ext] ?? 'default_file';
}

// ===== FileIcon コンポーネント =====
function FileIcon({ name, isDir, isExpanded }: { name: string; isDir: boolean; isExpanded?: boolean }) {
  const iconName = resolveIconName(name, isDir, isExpanded ?? false);
  return (
    <img
      src={`./file-icons/${iconName}.svg`}
      width={16}
      height={16}
      style={{ flexShrink: 0, objectFit: 'contain', display: 'block' }}
      alt=""
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = './file-icons/default_file.svg';
      }}
    />
  );
}

// ===== テキストファイル判定 =====
const TEXT_EXTS = new Set([
  'js','mjs','cjs','ts','tsx','jsx','json','jsonc','md','html','htm',
  'css','scss','sass','less','py','rs','go','rb','php','java','cs',
  'cpp','c','h','hpp','swift','kt','kts','dart','r','lua','ex','exs',
  'txt','log','sh','bash','zsh','ps1','bat','cmd','yaml','yml','toml',
  'xml','svg','sql','graphql','gql','env','gitignore','gitattributes',
  'editorconfig','prettierrc','eslintrc','babelrc','nvmrc',
]);

// Monaco の言語 ID マッピング
const EXT_LANG: Record<string, string> = {
  js:'javascript', mjs:'javascript', cjs:'javascript', jsx:'javascript',
  ts:'typescript', tsx:'typescript',
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

const LANG_COLORS: Record<string, string> = {
  typescript:'#3178c6', javascript:'#f0d040', python:'#3572a5',
  rust:'#dea584', go:'#00add8', css:'#9b59b6', html:'#e44d26',
  json:'#888', markdown:'#5b8dee', cpp:'#f34b7d', java:'#b07219',
  csharp:'#9b4f96', ruby:'#701516', php:'#4f5d95', shell:'#89e051',
  kotlin:'#7f52ff', swift:'#fa7343', dart:'#00b4ab', sql:'#e38c00',
  powershell:'#012456',
};

function getMonacoLanguage(filePath: string): string {
  const name = (filePath || '').split(/[\\/]/).pop() ?? '';
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  if (name.toLowerCase().startsWith('.env')) return 'ini';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTS.has(ext);
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fileIconEmoji(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const MAP: Record<string, string> = {
    ts:'📄', tsx:'⚛️', jsx:'⚛️', json:'📋', md:'📝',
    html:'🌐', css:'🎨', scss:'🎨', py:'🐍', rs:'🦀', go:'🐹',
    sh:'⚙️', bat:'⚙️', yaml:'📋', yml:'📋', toml:'📋', xml:'📋',
    sql:'🗄️', csv:'📊', png:'🖼️', jpg:'🖼️', jpeg:'🖼️',
    gif:'🖼️', svg:'🖼️', ico:'🖼️', pdf:'📕',
  };
  return MAP[ext] ?? '📄';
}

// ===== TreeRow =====
interface TreeRowData {
  item: FileBrowserItem & { _expanded: boolean };
  depth: number;
}

function TreeRow({
  row,
  selectedPath,
  onExpand,
  onFileClick,
  onCopyPath,
}: {
  row: TreeRowData;
  selectedPath: string;
  onExpand: (item: FileBrowserItem) => void;
  onFileClick: (item: FileBrowserItem) => void;
  onCopyPath: (p: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const { item, depth } = row;
  const selected = selectedPath === item.path;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
        padding: `2px 8px 2px ${8 + depth * 16}px`,
        cursor: 'pointer', userSelect: 'none', fontSize: 13, gap: 4,
        background: selected ? 'rgba(99,102,241,0.2)' : hover ? 'rgba(255,255,255,0.05)' : 'transparent',
        color: selected ? 'var(--aria-primary,#6366f1)' : 'var(--aria-text,#ccc)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => item.isDir ? onExpand(item) : onFileClick(item)}
      title={item.path}
    >
      {item.isDir
        ? <span style={{ fontSize: 10, width: 12, textAlign: 'center', flexShrink: 0, color: '#888' }}>
            {item._expanded ? '▼' : '▶'}
          </span>
        : <span style={{ width: 12, flexShrink: 0 }} />
      }
      <FileIcon name={item.name} isDir={item.isDir} isExpanded={item._expanded} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </span>
      {item.isFile && item.size != null && (
        <span style={{ fontSize: 10, color: '#666', flexShrink: 0 }}>{fmtSize(item.size)}</span>
      )}
      {hover && (
        <span
          style={{ fontSize: 10, padding: '1px 4px', marginLeft: 4, borderRadius: 3, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onCopyPath(item.path); }}
          title="パスをコピー"
        >
          📋
        </span>
      )}
    </div>
  );
}

// ===== FileBrowserPanel =====
export interface FileBrowserPanelProps {
  onOpenFileTab: (tabId: string, label: string, icon: string) => void;
  onPathChange?: (path: string) => void;
}

export function FileBrowserPanel({ onOpenFileTab, onPathChange }: FileBrowserPanelProps) {
  const [rootPath, setRootPath] = useState('');
  const [treeData, setTreeData] = useState<Map<string, FileBrowserItem[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [drives, setDrives] = useState<{ path: string; name: string }[]>([]);
  const [showDrives, setShowDrives] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // 状態の保存（rootPath・expanded変更時）
  const saveStateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveState = (root: string, exp: Set<string>) => {
    if (saveStateRef.current) clearTimeout(saveStateRef.current);
    saveStateRef.current = setTimeout(() => {
      window.arsChatAPI.fileBrowser.saveState({
        rootPath: root,
        expandedPaths: Array.from(exp),
      }).catch(() => {});
    }, 500);
  };

  useEffect(() => {
    // 保存済み状態を復元
    Promise.all([
      window.arsChatAPI.fileBrowser.getState(),
      window.arsChatAPI.fileBrowser.getHome(),
      window.arsChatAPI.fileBrowser.getDrives(),
    ]).then(([state, homeResult, drivesResult]) => {
      if (Array.isArray(drivesResult)) setDrives(drivesResult);
      const startPath = state.rootPath || homeResult.path;
      if (startPath) {
        const savedExpanded = new Set<string>(state.expandedPaths);
        loadDir(startPath, savedExpanded);
      }
    }).catch(() => {
      // フォールバック: ホームディレクトリ
      window.arsChatAPI.fileBrowser.getHome().then((r) => {
        if (r?.path) loadDir(r.path, new Set());
      });
      window.arsChatAPI.fileBrowser.getDrives().then((r) => {
        if (Array.isArray(r)) setDrives(r);
      });
    });

    return () => {
      if (saveStateRef.current) clearTimeout(saveStateRef.current);
    };
  }, []);

  async function loadDir(dirPath: string, initialExpanded?: Set<string>) {
    setLoading(true);
    setRootPath(dirPath);
    onPathChange?.(dirPath);
    setTreeData(new Map());
    const newExpanded = initialExpanded ?? new Set<string>();
    setExpanded(newExpanded);
    setSelectedPath('');
    setStatusMsg('');

    const result = await window.arsChatAPI.fileBrowser.listDir(dirPath);
    if (result.success) {
      setTreeData(new Map([[dirPath, result.items]]));
      // 保存済み展開状態を再現
      if (initialExpanded && initialExpanded.size > 0) {
        await restoreExpanded(dirPath, result.items, initialExpanded, new Map([[dirPath, result.items]]));
      }
    } else {
      setStatusMsg('エラー: ' + result.error);
    }
    setLoading(false);
    saveState(dirPath, newExpanded);
  }

  // 保存された展開状態を再現（子ディレクトリを再帰的にロード）
  async function restoreExpanded(
    _rootDir: string,
    items: FileBrowserItem[],
    savedExpanded: Set<string>,
    existingData: Map<string, FileBrowserItem[]>,
  ) {
    const newData = new Map(existingData);
    for (const item of items) {
      if (item.isDir && savedExpanded.has(item.path)) {
        if (!newData.has(item.path)) {
          const r = await window.arsChatAPI.fileBrowser.listDir(item.path);
          if (r.success) {
            newData.set(item.path, r.items);
            await restoreExpanded(item.path, r.items, savedExpanded, newData);
          }
        }
      }
    }
    setTreeData(new Map(newData));
  }

  async function handleExpand(item: FileBrowserItem) {
    setSelectedPath(item.path);
    const isOpen = expanded.has(item.path);
    if (isOpen) {
      const newExp = new Set(expanded);
      newExp.delete(item.path);
      setExpanded(newExp);
      saveState(rootPath, newExp);
    } else {
      if (!treeData.has(item.path)) {
        const result = await window.arsChatAPI.fileBrowser.listDir(item.path);
        if (result.success) {
          setTreeData((prev) => new Map([...prev, [item.path, result.items]]));
        }
      }
      const newExp = new Set([...expanded, item.path]);
      setExpanded(newExp);
      saveState(rootPath, newExp);
    }
  }

  async function handleFileClick(item: FileBrowserItem) {
    setSelectedPath(item.path);
    if (!isTextFile(item.name)) {
      setStatusMsg(`バイナリファイルは開けません: ${item.name}`);
      return;
    }
    setStatusMsg('読み込み中...');
    const result = await window.arsChatAPI.fileBrowser.openFile(item.path);
    if (result.success && result.path && result.content !== undefined) {
      const tabId = 'fb:' + result.path;
      pendingFiles.set(tabId, {
        path: result.path,
        name: item.name,
        content: result.content,
      });
      onOpenFileTab(tabId, item.name, fileIconEmoji(item.name));
      setStatusMsg(`開きました: ${item.name}`);
    } else {
      setStatusMsg('エラー: ' + result.error);
    }
  }

  async function handleOpenFolder() {
    const result = await window.arsChatAPI.fileBrowser.openFolderDialog();
    if (result.success && result.path) {
      loadDir(result.path, new Set());
    }
  }

  function handleCopyPath(p: string) {
    navigator.clipboard?.writeText(p).catch(() => {});
    setStatusMsg('コピーしました: ' + p);
  }

  function flattenTree(items: FileBrowserItem[], depth: number): TreeRowData[] {
    const rows: TreeRowData[] = [];
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

  const panelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', height: '100%',
    overflow: 'hidden', fontFamily: 'sans-serif', fontSize: 13,
  };
  const toolbarStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px',
    borderBottom: '1px solid var(--aria-border,#2a2a2a)', flexShrink: 0,
  };
  const btnStyle: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 4,
    border: '1px solid var(--aria-border,#444)',
    background: 'var(--aria-bg,#1e1e1e)',
    color: 'var(--aria-text,#ccc)',
    cursor: 'pointer', fontSize: 12,
  };

  return (
    <div style={panelStyle}>
      {/* ツールバー */}
      <div style={toolbarStyle}>
        <button style={btnStyle} onClick={handleOpenFolder} title="フォルダを開く">📂 開く</button>
        {drives.length > 0 && (
          <button style={btnStyle} onClick={() => setShowDrives((v) => !v)} title="ドライブを選択">💾</button>
        )}
      </div>

      {/* ドライブセレクター */}
      {showDrives && (
        <div style={{ borderBottom: '1px solid var(--aria-border,#2a2a2a)', padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {drives.map((d) => (
            <button
              key={d.path}
              style={{ ...btnStyle, fontSize: 11 }}
              onClick={() => { loadDir(d.path, new Set()); setShowDrives(false); }}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* 現在パス */}
      {rootPath && (
        <div style={{ padding: '2px 8px 4px', fontSize: 11, color: '#666', borderBottom: '1px solid var(--aria-border,#2a2a2a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rootPath}
        </div>
      )}

      {/* ツリー */}
      {loading ? (
        <div style={{ padding: 16, color: '#666', fontSize: 12 }}>読み込み中...</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {flatRows.length === 0 && rootPath
            ? <div style={{ padding: 16, color: '#666', fontSize: 12 }}>フォルダが空です</div>
            : flatRows.map((row) => (
                <TreeRow
                  key={row.item.path}
                  row={row}
                  selectedPath={selectedPath}
                  onExpand={handleExpand}
                  onFileClick={handleFileClick}
                  onCopyPath={handleCopyPath}
                />
              ))
          }
        </div>
      )}

      {/* ステータスバー */}
      <div style={{ padding: '2px 8px', fontSize: 11, color: 'var(--aria-text-muted,#666)', borderTop: '1px solid var(--aria-border,#2a2a2a)', flexShrink: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusMsg}</span>
      </div>
    </div>
  );
}

// ===== FileViewerPage =====
// tabId 例: 'fb:/path/to/file.ts'
export function FileViewerPage({ tabId }: { tabId: string }) {
  const initial = pendingFiles.get(tabId) ?? { path: '', name: '', content: '' };
  const [filePath] = useState(initial.path);
  const [fileName] = useState(initial.name);
  const [modified, setModified] = useState(false);
  const [lineCount, setLineCount] = useState(() => (initial.content.match(/\n/g)?.length ?? 0) + 1);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const originalRef = useRef(initial.content);
  const modifiedRef = useRef(false);

  const language = getMonacoLanguage(fileName || filePath);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const monaco = (window as any).monaco;
    if (!monaco) return;

    const editor = monaco.editor.create(container, {
      value: initial.content,
      language,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true, scale: 1 },
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      lineNumbersMinChars: 4,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderLineHighlight: 'line',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      renderWhitespace: 'selection',
      tabSize: 2,
    });

    editorRef.current = editor;

    const changeDisposable = editor.onDidChangeModelContent(() => {
      const isChanged = editor.getValue() !== originalRef.current;
      if (isChanged !== modifiedRef.current) {
        modifiedRef.current = isChanged;
        setModified(isChanged);
      }
      setLineCount(editor.getModel()?.getLineCount() ?? 0);
    });

    const saveAction = editor.addAction({
      id: 'arschat-save-file',
      label: 'ファイルを保存',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: async (ed: any) => {
        if (!modifiedRef.current || !filePath) return;
        const content = ed.getValue();
        const result = await window.arsChatAPI.fileBrowser.saveFile(filePath, content);
        if (!result.success) {
          alert('保存に失敗しました: ' + result.error);
        } else {
          originalRef.current = content;
          modifiedRef.current = false;
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
  }, []);

  async function handleSave() {
    if (!modifiedRef.current || !filePath || !editorRef.current) return;
    const content = editorRef.current.getValue();
    const result = await window.arsChatAPI.fileBrowser.saveFile(filePath, content);
    if (!result.success) {
      alert('保存に失敗しました: ' + result.error);
    } else {
      originalRef.current = content;
      modifiedRef.current = false;
      setModified(false);
    }
  }

  if (!filePath) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: 13, fontFamily: 'sans-serif' }}>
        ファイルが見つかりません
      </div>
    );
  }

  const langColor = LANG_COLORS[language] ?? '#666';
  const btnStyle: React.CSSProperties = {
    padding: '3px 8px', borderRadius: 4,
    border: '1px solid var(--aria-border,#444)',
    background: 'var(--aria-bg,#1e1e1e)',
    color: 'var(--aria-text,#ccc)',
    cursor: 'pointer', fontSize: 12,
  };
  const btnPrimaryStyle: React.CSSProperties = {
    padding: '3px 10px', borderRadius: 4, border: 'none',
    background: 'var(--aria-primary,#6366f1)', color: '#fff',
    cursor: modified ? 'pointer' : 'default',
    opacity: modified ? 1 : 0.4, fontSize: 12,
  };
  const statusBarStyle: React.CSSProperties = {
    padding: '2px 8px', fontSize: 11,
    color: 'var(--aria-text-muted,#666)',
    borderTop: '1px solid var(--aria-border,#2a2a2a)',
    flexShrink: 0, display: 'flex', justifyContent: 'space-between',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'sans-serif' }}>
      {/* ツールバー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--aria-border,#2a2a2a)', flexShrink: 0, background: 'var(--aria-bg-light,#252525)' }}>
        <span style={{ fontSize: 11, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={filePath}>
          {filePath}
        </span>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, flexShrink: 0, background: langColor + '22', color: langColor, border: `1px solid ${langColor}55`, fontFamily: 'monospace', fontWeight: 'bold' }}>
          {language}
        </span>
        <button style={btnPrimaryStyle} onClick={handleSave} disabled={!modified} title="Ctrl+S">
          💾 保存
        </button>
        <button
          style={btnStyle}
          onClick={() => window.arsChatAPI.fileBrowser.openExternal(filePath)}
          title="システムの既定アプリで開く"
        >
          ↗ 外部
        </button>
      </div>

      {/* Monaco コンテナ */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />

      {/* ステータスバー */}
      <div style={statusBarStyle}>
        <span>{fileName}{modified ? ' — 未保存の変更あり' : ' — 保存済み'}</span>
        <span>{lineCount} 行</span>
      </div>
    </div>
  );
}
