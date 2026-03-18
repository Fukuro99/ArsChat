import React, { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';

interface ExtInfo {
  id: string;
  version: string;
  enabled: boolean;
  source: string;
  manifest: {
    displayName: string;
    icon: string;
    permissions: string[];
    description?: string;
  };
}

// ── ギアドロップダウン ──────────────────────────────────────────
function GearMenu({
  ext,
  onToggle,
  onUpdate,
  onUninstall,
  onClose,
}: {
  ext: ExtInfo;
  onToggle: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const item = (label: string, danger = false, action?: () => void) => (
    <button
      onClick={() => { action?.(); onClose(); }}
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-aria-surface/80 transition-colors ${
        danger ? 'text-red-400 hover:text-red-300' : 'text-aria-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="absolute right-0 top-6 z-50 w-44 bg-aria-bg-light border border-aria-border rounded-lg shadow-lg py-1 overflow-hidden"
    >
      {item(ext.enabled ? '無効にする' : '有効にする', false, onToggle)}
      <div className="h-px bg-aria-border my-1" />
      {item('更新', false, onUpdate)}
      {item('アンインストール', true, onUninstall)}
    </div>
  );
}

// ── 拡張カード ─────────────────────────────────────────────────
function ExtCard({
  ext,
  onClick,
  onToggle,
  onUpdate,
  onUninstall,
}: {
  ext: ExtInfo;
  onClick: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onUpdate: (id: string) => void;
  onUninstall: (id: string, name: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // source (GitHub URL or local path) から publisher を抽出
  const publisher = (() => {
    try {
      const url = new URL(ext.source);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[0] ?? ext.source;
    } catch {
      return ext.source.split(/[\\/]/).at(-2) ?? ext.id;
    }
  })();

  return (
    <div
      className={`group relative flex items-start gap-3 px-3 py-3 cursor-pointer border-b border-aria-border/30 hover:bg-aria-surface/50 transition-colors ${
        !ext.enabled ? 'opacity-60' : ''
      }`}
      onClick={onClick}
    >
      {/* アイコン */}
      <div className="shrink-0 w-12 h-12 flex items-center justify-center text-3xl leading-none rounded-lg bg-aria-surface">
        {ext.manifest.icon ?? '🧩'}
      </div>

      {/* テキスト情報 */}
      <div className="flex-1 min-w-0 pr-7">
        <p className="text-sm font-semibold text-aria-text leading-tight truncate">
          {ext.manifest.displayName ?? ext.id}
        </p>
        {ext.manifest.description && (
          <p className="text-[11px] text-aria-text-muted mt-0.5 leading-snug line-clamp-2">
            {ext.manifest.description}
          </p>
        )}
        <p className="text-[10px] text-aria-text-muted mt-1 truncate">
          {publisher}
          {!ext.enabled && (
            <span className="ml-2 px-1 py-0.5 rounded bg-aria-border/60 text-[9px]">無効</span>
          )}
        </p>
      </div>

      {/* ギアボタン */}
      <div className="absolute right-2 top-2">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text hover:bg-aria-surface opacity-0 group-hover:opacity-100 transition-all"
          title="オプション"
        >
          {/* gear icon — inline SVG（外部ファイル不要） */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M9.1 1.5a1.1 1.1 0 0 0-2.2 0l-.1.6a5.5 5.5 0 0 0-1.1.6l-.6-.2a1.1 1.1 0 0 0-1.4.8l-.3 1a1.1 1.1 0 0 0 .5 1.3l.5.3a5.5 5.5 0 0 0 0 1.2l-.5.3a1.1 1.1 0 0 0-.5 1.3l.3 1a1.1 1.1 0 0 0 1.4.8l.6-.2c.3.2.7.4 1.1.6l.1.6a1.1 1.1 0 0 0 2.2 0l.1-.6a5.5 5.5 0 0 0 1.1-.6l.6.2a1.1 1.1 0 0 0 1.4-.8l.3-1a1.1 1.1 0 0 0-.5-1.3l-.5-.3a5.5 5.5 0 0 0 0-1.2l.5-.3a1.1 1.1 0 0 0 .5-1.3l-.3-1a1.1 1.1 0 0 0-1.4-.8l-.6.2a5.5 5.5 0 0 0-1.1-.6l-.1-.6zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>
          </svg>
        </button>
        {menuOpen && (
          <GearMenu
            ext={ext}
            onToggle={() => onToggle(ext.id, !ext.enabled)}
            onUpdate={() => onUpdate(ext.id)}
            onUninstall={() => onUninstall(ext.id, ext.manifest.displayName ?? ext.id)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── セクションヘッダー ─────────────────────────────────────────
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <span className="text-[10px] font-semibold text-aria-text-muted uppercase tracking-wider">
        {label} — {count}
      </span>
    </div>
  );
}

// ── 詳細ビュー ─────────────────────────────────────────────────
function DetailView({
  ext,
  onBack,
  onToggle,
  onUpdate,
  onUninstall,
}: {
  ext: ExtInfo;
  onBack: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onUpdate: (id: string) => void;
  onUninstall: (id: string, name: string) => void;
}) {
  const [readmeHtml, setReadmeHtml] = useState<string | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setReadmeHtml(null);
    setReadmeError(null);
    window.arsChatAPI.extensions.readReadme(ext.id).then((result: any) => {
      if (result.success) {
        setReadmeHtml(marked.parse(result.content) as string);
      } else {
        setReadmeError(result.error);
      }
      setLoading(false);
    });
  }, [ext.id]);

  const publisher = (() => {
    try {
      const url = new URL(ext.source);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[0] ?? ext.source;
    } catch {
      return ext.source.split(/[\\/]/).at(-2) ?? ext.id;
    }
  })();

  const handleUpdate = async () => {
    setUpdating(true);
    await window.arsChatAPI.extensions.update(ext.id);
    setUpdating(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 戻るボタン */}
      <div className="px-2 py-1.5 border-b border-aria-border shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-aria-text-muted hover:text-aria-text transition-colors px-1 py-1 rounded hover:bg-aria-surface"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          拡張機能
        </button>
      </div>

      {/* スクロールエリア */}
      <div className="flex-1 overflow-y-auto">
        {/* ヘッダー情報 */}
        <div className="p-4 border-b border-aria-border space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-16 h-16 flex items-center justify-center text-5xl leading-none rounded-xl bg-aria-surface shrink-0">
              {ext.manifest.icon ?? '🧩'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-aria-text leading-tight">
                {ext.manifest.displayName ?? ext.id}
              </h2>
              <p className="text-xs text-aria-text-muted mt-0.5">{publisher}</p>
              <p className="text-[11px] text-aria-text-muted mt-0.5">v{ext.version}</p>
              {ext.manifest.description && (
                <p className="text-xs text-aria-text-muted mt-1 leading-snug">{ext.manifest.description}</p>
              )}
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onToggle(ext.id, !ext.enabled)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                ext.enabled
                  ? 'bg-aria-border text-aria-text hover:bg-aria-border/80'
                  : 'bg-aria-primary text-white hover:bg-aria-primary/90'
              }`}
            >
              {ext.enabled ? '無効にする' : '有効にする'}
            </button>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="px-3 py-1.5 text-xs rounded-lg font-medium bg-aria-surface border border-aria-border text-aria-text hover:bg-aria-surface/80 disabled:opacity-50 transition-colors"
            >
              {updating ? '更新中...' : '更新'}
            </button>
            <button
              onClick={() => onUninstall(ext.id, ext.manifest.displayName ?? ext.id)}
              className="px-3 py-1.5 text-xs rounded-lg font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              アンインストール
            </button>
          </div>

          {/* 権限バッジ */}
          {ext.manifest.permissions?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-aria-text-muted uppercase tracking-wider mb-1">権限</p>
              <div className="flex flex-wrap gap-1">
                {ext.manifest.permissions.map((p: string) => (
                  <span
                    key={p}
                    className={`px-1.5 py-0.5 text-[9px] rounded font-mono ${
                      p.includes('shell') || p.includes('fs:write') || p.includes('settings:write')
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-aria-surface text-aria-text-muted border border-aria-border'
                    }`}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* README */}
        <div className="p-4">
          {loading ? (
            <p className="text-xs text-aria-text-muted animate-pulse">README を読み込み中...</p>
          ) : readmeHtml ? (
            <div
              className="ext-readme prose prose-sm prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: readmeHtml }}
            />
          ) : (
            <p className="text-xs text-aria-text-muted">
              {readmeError ?? 'README が見つかりませんでした'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── インストールパネル ─────────────────────────────────────────
function InstallPanel({
  onInstalled,
  onClose,
}: {
  onInstalled: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
    const cleanup = window.arsChatAPI.extensions.onInstallProgress?.((p: any) => {
      setProgress(p.message);
    });
    return () => cleanup?.();
  }, []);

  const handleInstall = async () => {
    if (!url.trim()) return;
    setInstalling(true);
    setMsg(null);
    setProgress(null);
    const result = await window.arsChatAPI.extensions.install(url.trim());
    setInstalling(false);
    setProgress(null);
    if (result.success) {
      setMsg({ type: 'ok', text: `"${result.entry.id}" をインストールしました` });
      setUrl('');
      onInstalled();
    } else {
      setMsg({ type: 'err', text: result.error ?? 'インストールに失敗しました' });
    }
  };

  return (
    <div className="border-b border-aria-border bg-aria-surface/20 px-3 py-3 space-y-2.5 shrink-0">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-aria-text-muted uppercase tracking-wider">
          URL からインストール
        </p>
        <button
          onClick={onClose}
          className="w-4 h-4 flex items-center justify-center text-aria-text-muted hover:text-aria-text"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
          placeholder="https://github.com/user/arschat-ext-..."
          className="flex-1 bg-aria-bg border border-aria-border rounded px-2 py-1.5 text-xs text-aria-text placeholder-aria-text-muted focus:outline-none focus:border-aria-primary min-w-0"
          disabled={installing}
        />
        <button
          onClick={handleInstall}
          disabled={installing || !url.trim()}
          className="px-3 py-1.5 text-xs bg-aria-primary text-white rounded hover:bg-aria-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {installing ? '...' : '追加'}
        </button>
      </div>
      {progress && (
        <p className="text-[11px] text-aria-text-muted animate-pulse">{progress}</p>
      )}
      {msg && (
        <p className={`text-[11px] ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ── メインパネル ───────────────────────────────────────────────
export default function ExtensionManagerPanel() {
  const [extList, setExtList] = useState<ExtInfo[]>([]);
  const [selectedExt, setSelectedExt] = useState<ExtInfo | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  const loadList = useCallback(async () => {
    const list = await window.arsChatAPI.extensions.list();
    setExtList(list);
    // 詳細表示中の拡張を最新データで更新
    setSelectedExt((prev) => (prev ? list.find((e: ExtInfo) => e.id === prev.id) ?? null : null));
  }, []);

  useEffect(() => {
    loadList();
    const cleanup = window.arsChatAPI.onExtChanged?.(() => loadList());
    return () => cleanup?.();
  }, [loadList]);

  const handleToggle = async (extId: string, enabled: boolean) => {
    await window.arsChatAPI.extensions.toggle(extId, enabled);
    loadList();
  };

  const handleUninstall = async (extId: string, displayName: string) => {
    if (!confirm(`"${displayName}" をアンインストールしますか？`)) return;
    if (selectedExt?.id === extId) setSelectedExt(null);
    await window.arsChatAPI.extensions.uninstall(extId);
    loadList();
  };

  const handleUpdate = async (extId: string) => {
    await window.arsChatAPI.extensions.update(extId);
    loadList();
  };

  // ── 詳細ビュー
  if (selectedExt) {
    return (
      <DetailView
        ext={selectedExt}
        onBack={() => setSelectedExt(null)}
        onToggle={handleToggle}
        onUpdate={handleUpdate}
        onUninstall={handleUninstall}
      />
    );
  }

  // ── 一覧ビュー
  const enabled = extList.filter((e) => e.enabled);
  const disabled = extList.filter((e) => !e.enabled);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-3 py-2.5 border-b border-aria-border flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">拡張機能</span>
        <button
          onClick={() => setShowInstall((v) => !v)}
          title="URL からインストール"
          className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
            showInstall
              ? 'bg-aria-primary/20 text-aria-primary'
              : 'text-aria-text-muted hover:text-aria-text hover:bg-aria-surface'
          }`}
        >
          {showInstall ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* インストールパネル */}
      {showInstall && (
        <InstallPanel
          onInstalled={loadList}
          onClose={() => setShowInstall(false)}
        />
      )}

      {/* 一覧 */}
      <div className="flex-1 overflow-y-auto">
        {extList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-aria-text-muted">
            <img src="./codicons/extensions.svg" width={28} height={28} alt="" style={{ filter: 'invert(1) opacity(0.25)' }} />
            <p className="text-xs">拡張機能がありません</p>
            <button
              onClick={() => setShowInstall(true)}
              className="text-xs text-aria-primary hover:underline"
            >
              インストールする
            </button>
          </div>
        ) : (
          <>
            {enabled.length > 0 && (
              <>
                <SectionHeader label="インストール済み" count={enabled.length} />
                {enabled.map((ext) => (
                  <ExtCard
                    key={ext.id}
                    ext={ext}
                    onClick={() => setSelectedExt(ext)}
                    onToggle={handleToggle}
                    onUpdate={handleUpdate}
                    onUninstall={handleUninstall}
                  />
                ))}
              </>
            )}
            {disabled.length > 0 && (
              <>
                <SectionHeader label="無効" count={disabled.length} />
                {disabled.map((ext) => (
                  <ExtCard
                    key={ext.id}
                    ext={ext}
                    onClick={() => setSelectedExt(ext)}
                    onToggle={handleToggle}
                    onUpdate={handleUpdate}
                    onUninstall={handleUninstall}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
