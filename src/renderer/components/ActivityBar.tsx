import React from 'react';
import type { LoadedExtension } from '../extension-loader';

interface ActivityBarProps {
  activePanelId: string | null;
  extensions: LoadedExtension[];
  hasNavExtensions: boolean;
  onNewSession: () => void;
  onSelectPanel: (id: string) => void;
  onReloadExtensions: () => void;
  isReloading?: boolean;
}

/** アイコンボタン */
function IconButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-aria-primary/20 text-aria-primary'
          : 'text-aria-text-muted hover:bg-aria-surface hover:text-aria-text'
      }`}
    >
      {children}
    </button>
  );
}

export default function ActivityBar({
  activePanelId,
  extensions,
  hasNavExtensions,
  onNewSession,
  onSelectPanel,
  onReloadExtensions,
  isReloading = false,
}: ActivityBarProps) {
  // sidebarPanel を持つ拡張の活動項目
  const sidebarPanelItems = extensions.flatMap((ext) =>
    (ext.info.manifest.pages ?? [])
      .filter((p) => p.sidebarPanel)
      .map((p) => ({
        id: `${ext.info.id}:${p.id}`,
        title: p.title,
        icon: p.icon,
      })),
  );

  return (
    <div className="h-full w-12 bg-aria-bg-light border-r border-aria-border flex flex-col items-center py-2 gap-1 shrink-0">
      {/* 新規チャット */}
      <IconButton title="新規チャット" onClick={onNewSession}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="2" x2="8" y2="14"/>
          <line x1="2" y1="8" x2="14" y2="8"/>
        </svg>
      </IconButton>

      <div className="w-6 h-px bg-aria-border my-1" />

      {/* 会話履歴 */}
      <IconButton
        title="会話履歴"
        active={activePanelId === 'history'}
        onClick={() => onSelectPanel('history')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <polyline points="12 7 12 12 15 15"/>
        </svg>
      </IconButton>

      {/* 拡張ナビリンクまとめ（ブリーフケースアイコン） */}
      {hasNavExtensions && (
        <IconButton
          title="拡張機能"
          active={activePanelId === 'extensions'}
          onClick={() => onSelectPanel('extensions')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
        </IconButton>
      )}

      {/* 拡張 sidebarPanel アイテム */}
      {sidebarPanelItems.map((item) => (
        <IconButton
          key={item.id}
          title={item.title}
          active={activePanelId === item.id}
          onClick={() => onSelectPanel(item.id)}
        >
          <span className="text-base leading-none">{item.icon}</span>
        </IconButton>
      ))}

      {/* 下部：拡張リロードボタン */}
      <div className="flex-1" />
      <IconButton
        title={isReloading ? '拡張機能をリロード中…' : '拡張機能をリロード'}
        onClick={onReloadExtensions}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isReloading ? 'animate-spin' : ''}
        >
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </IconButton>
    </div>
  );
}
