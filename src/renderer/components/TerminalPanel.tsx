import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

// ===== Console capture =====
interface ConsoleEntry {
  id: number;
  ts: string;
  level: 'log' | 'info' | 'warn' | 'error';
  msg: string;
}
let _logId = 0;
export const capturedLogs: ConsoleEntry[] = [];
const _logListeners = new Set<() => void>();

if (typeof window !== 'undefined' && !(window as any).__arsChatConsoleCaptured) {
  (window as any).__arsChatConsoleCaptured = true;
  const _o = {
    log: console.log.bind(console), info: console.info.bind(console),
    warn: console.warn.bind(console), error: console.error.bind(console),
  };
  const _cap = (level: ConsoleEntry['level'], args: unknown[]) => {
    const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const msg = args.map((a) => {
      if (a instanceof Error) return a.stack ?? a.message;
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return String(a); }
    }).join(' ');
    capturedLogs.push({ id: ++_logId, ts, level, msg });
    if (capturedLogs.length > 2000) capturedLogs.splice(0, capturedLogs.length - 2000);
    _logListeners.forEach((fn) => fn());
  };
  console.log   = (...a) => { _o.log(...a);   _cap('log', a); };
  console.info  = (...a) => { _o.info(...a);  _cap('info', a); };
  console.warn  = (...a) => { _o.warn(...a);  _cap('warn', a); };
  console.error = (...a) => { _o.error(...a); _cap('error', a); };
}

// ===== Shell definitions =====
const isWin = navigator.platform.includes('Win') || navigator.userAgent.includes('Windows');
const SHELLS = isWin
  ? [{ label: 'PowerShell', exec: 'powershell.exe' }, { label: 'コマンドプロンプト', exec: 'cmd.exe' }]
  : [{ label: 'Bash', exec: '/bin/bash' }, { label: 'Zsh', exec: '/bin/zsh' }, { label: 'sh', exec: '/bin/sh' }];

// ===== xterm theme =====
const THEME = {
  background: '#1e1e1e', foreground: '#cccccc', cursor: '#aeafad',
  selectionBackground: '#264f78',
  black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
  blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b',
  brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6',
  brightCyan: '#29b8db', brightWhite: '#e5e5e5',
};

let counter = 0;
interface Tab { id: string; label: string; }
interface TermInstance {
  term: Terminal; fitAddon: FitAddon;
  containerEl: HTMLDivElement; cleanups: (() => void)[];
}
type PanelKind = 'terminal' | 'console';
interface Props { visible: boolean; cwd?: string; }

// ===== Console panel =====
function ConsolePanel() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([...capturedLogs]);
  const [filter, setFilter] = useState<'all' | 'warn' | 'error'>('all');
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    const fn = () => setEntries([...capturedLogs]);
    _logListeners.add(fn);
    return () => { _logListeners.delete(fn); };
  }, []);

  useEffect(() => {
    if (autoScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [entries]);

  const COLOR: Record<ConsoleEntry['level'], string> = {
    log: '#cccccc', info: '#3b8eea', warn: '#e5e510', error: '#f14c4c',
  };
  const shown = entries.filter((e) =>
    filter === 'all' ? true : filter === 'warn' ? e.level === 'warn' || e.level === 'error' : e.level === 'error',
  );

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e1e1e', fontFamily: 'Consolas, monospace', fontSize: 12 }}>
      <div className="flex items-center gap-1 px-2 shrink-0" style={{ height: 26, borderBottom: '1px solid #333', background: '#252526' }}>
        {(['all', 'warn', 'error'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '0 8px', height: 20, borderRadius: 3, fontSize: 11, cursor: 'pointer', border: 'none',
              background: filter === f ? '#3c3c3c' : 'transparent',
              color: filter === f ? '#cccccc' : '#888',
            }}>
            {f === 'all' ? 'すべて' : f === 'warn' ? '警告' : 'エラー'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => { capturedLogs.splice(0); setEntries([]); }}
          title="クリア"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '0 4px', display: 'flex', alignItems: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ padding: '2px 8px' }}
        onScroll={(e) => {
          const el = e.currentTarget;
          autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}>
        {shown.length === 0 && <div style={{ color: '#666', padding: 8 }}>ログなし</div>}
        {shown.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 8, padding: '1px 0', color: COLOR[e.level], whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <span style={{ color: '#555', flexShrink: 0 }}>{e.ts}</span>
            <span style={{ flexShrink: 0, width: 36 }}>[{e.level.toUpperCase().slice(0,4)}]</span>
            <span>{e.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ===== Shell picker dropdown =====
function ShellPicker({ onSelect, onClose }: { onSelect: (exec: string, label: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: 'absolute', right: 0, top: '100%', marginTop: 2, zIndex: 50,
      background: '#252526', border: '1px solid #454545', borderRadius: 4,
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: 160,
    }}>
      {SHELLS.map((s) => (
        <button key={s.exec} onClick={() => { onSelect(s.exec, s.label); onClose(); }}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 12px', fontSize: 12, color: '#cccccc', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#2a2d2e'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ===== Main component =====
export default function TerminalPanel({ visible, cwd }: Props) {
  const [panel, setPanel] = useState<PanelKind>('terminal');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [showPicker, setShowPicker] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const instances = useRef<Map<string, TermInstance>>(new Map());
  const activeIdRef = useRef<string>('');
  const cwdRef = useRef(cwd);
  useEffect(() => { cwdRef.current = cwd; }, [cwd]);

  /** 指定 ID のターミナルを表示し、他を隠す（DOM 直接操作） */
  const showTerminal = useCallback((id: string) => {
    activeIdRef.current = id;
    instances.current.forEach((inst, iid) => {
      inst.containerEl.style.display = iid === id ? 'block' : 'none';
    });
    const inst = instances.current.get(id);
    if (inst) {
      requestAnimationFrame(() => {
        try {
          inst.fitAddon.fit();
          window.arsChatAPI.terminal.resize(id, inst.term.cols, inst.term.rows);
          inst.term.focus();
        } catch {}
      });
    }
  }, []);

  /** ターミナルを選択（DOM + React state 両方更新） */
  const selectTerminal = useCallback((id: string) => {
    showTerminal(id);
    setActiveId(id);
    setPanel('terminal');
  }, [showTerminal]);

  const spawnTerminal = useCallback(async (shellExec?: string, shellLabel?: string) => {
    const id = `term-${++counter}-${Date.now()}`;
    const label = shellLabel ?? SHELLS[0].label;

    const term = new Terminal({
      cursorBlink: true, fontSize: 13,
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      theme: THEME, allowTransparency: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    // すべての既存コンテナを隠してから新しいコンテナを作成
    instances.current.forEach((inst) => { inst.containerEl.style.display = 'none'; });

    const containerEl = document.createElement('div');
    containerEl.style.cssText = 'position:absolute;inset:4px;';
    hostRef.current?.appendChild(containerEl);
    term.open(containerEl);
    fitAddon.fit();

    const { cols, rows } = term;
    await window.arsChatAPI.terminal.create(id, cols, rows, cwdRef.current, shellExec);

    const cleanupData = window.arsChatAPI.terminal.onData(id, (data) => term.write(data));
    const cleanupExit = window.arsChatAPI.terminal.onExit(id, () => {
      term.write('\r\n\x1b[90m[プロセスが終了しました]\x1b[0m\r\n');
    });
    term.onData((data) => window.arsChatAPI.terminal.write(id, data));

    instances.current.set(id, {
      term, fitAddon, containerEl,
      cleanups: [
        cleanupData, cleanupExit,
        () => { window.arsChatAPI.terminal.destroy(id); },
        () => { term.dispose(); },
        () => { containerEl.remove(); },
      ],
    });

    // await 後に確実に切り替え
    selectTerminal(id);
    setTabs((prev) => [...prev, { id, label }]);
  }, [selectTerminal]);

  useEffect(() => {
    if (visible && tabs.length === 0) spawnTerminal(SHELLS[0].exec, SHELLS[0].label);
  }, [visible, tabs.length, spawnTerminal]);

  // panel が console に切り替わったとき全コンテナを隠す
  useEffect(() => {
    if (panel === 'console') {
      instances.current.forEach((inst) => { inst.containerEl.style.display = 'none'; });
    } else if (panel === 'terminal' && activeIdRef.current) {
      showTerminal(activeIdRef.current);
    }
  }, [panel, showTerminal]);

  useEffect(() => {
    if (!visible) return;
    const el = hostRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (panel !== 'terminal') return;
      const inst = instances.current.get(activeId);
      if (!inst) return;
      try { inst.fitAddon.fit(); window.arsChatAPI.terminal.resize(activeId, inst.term.cols, inst.term.rows); } catch {}
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, activeId, panel]);

  useEffect(() => {
    return () => {
      instances.current.forEach((inst) => inst.cleanups.forEach((fn) => { try { fn(); } catch {} }));
      instances.current.clear();
    };
  }, []);

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const inst = instances.current.get(id);
    if (inst) { inst.cleanups.forEach((fn) => { try { fn(); } catch {} }); instances.current.delete(id); }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeIdRef.current === id && next.length > 0) selectTerminal(next[next.length - 1].id);
      return next;
    });
  };

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '0 14px', height: '100%', fontSize: 12, cursor: 'pointer',
    background: 'none', border: 'none', borderBottom: active ? '1px solid #cccccc' : '1px solid transparent',
    color: active ? '#cccccc' : '#8c8c8c',
    marginBottom: active ? -1 : 0,
  });

  const iconBtn: React.CSSProperties = {
    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', cursor: 'pointer', color: '#8c8c8c', borderRadius: 4,
    flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1e1e1e' }}>
      {/* ===== パネルタブバー ===== */}
      <div style={{ display: 'flex', alignItems: 'center', height: 35, borderBottom: '1px solid #333', background: '#1e1e1e', flexShrink: 0, paddingLeft: 4 }}>
        <button style={TAB_STYLE(panel === 'terminal')} onClick={() => setPanel('terminal')}>ターミナル</button>
        <button style={TAB_STYLE(panel === 'console')} onClick={() => setPanel('console')}>コンソール</button>
        <div style={{ flex: 1 }} />

        {/* + ▼ */}
        {panel === 'terminal' && (
          <div style={{ position: 'relative', display: 'flex', marginRight: 2 }}>
            <button
              style={{ ...iconBtn, width: 'auto', padding: '0 6px', gap: 2 }}
              title="新規ターミナル"
              onClick={() => setShowPicker((v) => !v)}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5.5 1v9M1 5.5h9" />
              </svg>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
              </svg>
            </button>
            {showPicker && (
              <ShellPicker onSelect={(exec, label) => spawnTerminal(exec, label)} onClose={() => setShowPicker(false)} />
            )}
          </div>
        )}

        {/* … */}
        <button style={iconBtn} title="その他">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="2" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="14" cy="8" r="1.2"/>
          </svg>
        </button>
        {/* ∧ 折りたたみ */}
        <button style={iconBtn} title="パネルを隠す">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1.5 7.5l4-4 4 4" />
          </svg>
        </button>
        <div style={{ width: 4 }} />
      </div>

      {/* ===== コンテンツ ===== */}
      {panel === 'console' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ConsolePanel />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* xterm ホスト */}
          <div ref={hostRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }} />

          {/* ターミナル一覧サイドバー */}
          <div style={{ width: 140, borderLeft: '1px solid #333', background: '#252526', overflowY: 'auto', flexShrink: 0 }}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => selectTerminal(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', cursor: 'pointer', fontSize: 12,
                  background: tab.id === activeId ? '#37373d' : 'transparent',
                  color: tab.id === activeId ? '#cccccc' : '#8c8c8c',
                }}
                onMouseEnter={(e) => { if (tab.id !== activeId) (e.currentTarget as HTMLElement).style.background = '#2a2d2e'; }}
                onMouseLeave={(e) => { if (tab.id !== activeId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* ターミナルアイコン */}
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}>
                  <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm9.5 5.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1m-6.354-.354a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2a.5.5 0 1 0-.708.708L4.793 6.5z"/>
                </svg>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                  {tab.label}
                </span>
                {/* × 閉じる */}
                <span
                  role="button"
                  onClick={(e) => closeTab(tab.id, e)}
                  style={{ opacity: 0.5, cursor: 'pointer', lineHeight: 1, fontSize: 13, flexShrink: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
                  title="閉じる"
                >×</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
