import React, { useState, useEffect, useRef } from 'react';

interface ExtInfo {
  id: string;
  version: string;
  enabled: boolean;
  manifest: {
    displayName: string;
    icon: string;
    permissions: string[];
  };
}

/** VSCode スタイルの拡張機能管理パネル */
export default function ExtensionManagerPanel() {
  const [extList, setExtList] = useState<ExtInfo[]>([]);
  const [installUrl, setInstallUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadList();
    // 他のトリガー（設定画面など）からの変更も自動反映
    const cleanup = window.arsChatAPI.onExtChanged?.(() => loadList());
    return () => cleanup?.();
  }, []);

  // install パネル展開時に入力欄にフォーカス
  useEffect(() => {
    if (showInstall) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showInstall]);

  const loadList = async () => {
    const list = await window.arsChatAPI.extensions.list();
    setExtList(list);
  };

  const handleInstall = async () => {
    if (!installUrl.trim()) return;
    setInstalling(true);
    setInstallMsg(null);
    const result = await window.arsChatAPI.extensions.install(installUrl.trim());
    setInstalling(false);
    if (result.success) {
      setInstallMsg({ type: 'ok', text: `"${result.entry.id}" をインストールしました` });
      setInstallUrl('');
      loadList();
    } else {
      setInstallMsg({ type: 'err', text: result.error ?? 'インストールに失敗しました' });
    }
  };

  const handleToggle = async (extId: string, enabled: boolean) => {
    await window.arsChatAPI.extensions.toggle(extId, enabled);
    loadList();
  };

  const handleUninstall = async (extId: string, displayName: string) => {
    if (!confirm(`"${displayName}" をアンインストールしますか？`)) return;
    await window.arsChatAPI.extensions.uninstall(extId);
    loadList();
  };

  const handleUpdate = async (extId: string) => {
    setUpdatingId(extId);
    try {
      await window.arsChatAPI.extensions.update(extId);
      await loadList();
    } finally {
      setUpdatingId(null);
    }
  };

  const enabled = extList.filter((e) => e.enabled);
  const disabled = extList.filter((e) => !e.enabled);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-3 py-2.5 border-b border-aria-border flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">拡張機能</span>
        <button
          onClick={() => { setShowInstall((v) => !v); setInstallMsg(null); }}
          title="URLからインストール"
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

      {/* インストール入力パネル */}
      {showInstall && (
        <div className="px-3 py-2.5 border-b border-aria-border bg-aria-surface/30 space-y-2 shrink-0">
          <p className="text-[11px] text-aria-text-muted font-medium">GitHub リポジトリ URL を入力</p>
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              placeholder="https://github.com/user/arschat-ext-..."
              className="flex-1 bg-aria-bg border border-aria-border rounded px-2 py-1.5 text-xs text-aria-text placeholder-aria-text-muted focus:outline-none focus:border-aria-primary min-w-0"
              disabled={installing}
            />
            <button
              onClick={handleInstall}
              disabled={installing || !installUrl.trim()}
              className="px-3 py-1.5 text-xs bg-aria-primary text-white rounded hover:bg-aria-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {installing ? '追加中...' : '追加'}
            </button>
          </div>
          {installMsg && (
            <p className={`text-[11px] leading-tight ${installMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {installMsg.text}
            </p>
          )}
        </div>
      )}

      {/* 拡張一覧 */}
      <div className="flex-1 overflow-y-auto">
        {extList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-aria-text-muted">
            <img src="./codicons/extensions.svg" width={24} height={24} alt="" style={{ filter: 'invert(1) opacity(0.3)' }} />
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
                <SectionHeader label="有効" count={enabled.length} />
                {enabled.map((ext) => (
                  <ExtCard
                    key={ext.id}
                    ext={ext}
                    updating={updatingId === ext.id}
                    onToggle={handleToggle}
                    onUninstall={handleUninstall}
                    onUpdate={handleUpdate}
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
                    updating={updatingId === ext.id}
                    onToggle={handleToggle}
                    onUninstall={handleUninstall}
                    onUpdate={handleUpdate}
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

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 pt-3 pb-1.5">
      <span className="text-[10px] font-semibold text-aria-text-muted uppercase tracking-wider">
        {label} — {count}
      </span>
    </div>
  );
}

function ExtCard({
  ext,
  updating,
  onToggle,
  onUninstall,
  onUpdate,
}: {
  ext: ExtInfo;
  updating: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onUninstall: (id: string, displayName: string) => void;
  onUpdate: (id: string) => void;
}) {
  return (
    <div
      className={`group px-3 py-2.5 border-b border-aria-border/30 hover:bg-aria-surface/50 transition-colors ${
        !ext.enabled ? 'opacity-55' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* アイコン */}
        <span className="text-xl leading-none mt-0.5 shrink-0">{ext.manifest.icon ?? '🧩'}</span>

        {/* 情報 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-medium text-aria-text truncate">
              {ext.manifest.displayName ?? ext.id}
            </p>
            {/* 有効/無効トグル */}
            <button
              onClick={() => onToggle(ext.id, !ext.enabled)}
              title={ext.enabled ? '無効にする' : '有効にする'}
              className={`shrink-0 relative w-8 h-4 rounded-full transition-colors ${
                ext.enabled ? 'bg-aria-primary' : 'bg-aria-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                  ext.enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <p className="text-[10px] text-aria-text-muted mt-0.5 truncate">{ext.id} · v{ext.version}</p>

          {/* 権限バッジ */}
          {ext.manifest.permissions?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ext.manifest.permissions.map((p: string) => (
                <span
                  key={p}
                  className={`px-1 py-0.5 text-[9px] rounded font-mono leading-none ${
                    p.includes('shell') || p.includes('fs:write') || p.includes('settings:write')
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-aria-surface text-aria-text-muted border border-aria-border'
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* アクションボタン（ホバー時表示） */}
      <div className="flex gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onUpdate(ext.id)}
          disabled={updating}
          className="text-[10px] px-2 py-0.5 bg-aria-primary/10 text-aria-primary rounded hover:bg-aria-primary/20 transition-colors disabled:opacity-50"
        >
          {updating ? '更新中...' : '更新'}
        </button>
        <button
          onClick={() => onUninstall(ext.id, ext.manifest.displayName ?? ext.id)}
          className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
        >
          削除
        </button>
      </div>
    </div>
  );
}
