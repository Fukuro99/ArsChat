import React from 'react';
import type { LoadedExtension } from '../extension-loader';

interface ActivityBarProps {
  activePanelId: string | null;
  extensions: LoadedExtension[];
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
      {/* 新規チャット — microsoft/vscode-icons (codicons) */}
      <IconButton title="新規チャット" onClick={onNewSession}>
        <img src="./codicons/add.svg" width={16} height={16} alt="新規チャット" style={{ filter: 'invert(1) opacity(0.8)' }} />
      </IconButton>

      <div className="w-6 h-px bg-aria-border my-1" />

      {/* 会話履歴 — codicons */}
      <IconButton
        title="会話履歴"
        active={activePanelId === 'history'}
        onClick={() => onSelectPanel('history')}
      >
        <img src="./codicons/history.svg" width={16} height={16} alt="会話履歴" style={{ filter: 'invert(1) opacity(0.8)' }} />
      </IconButton>

      {/* ファイルブラウザ（標準搭載） */}
      <IconButton
        title="ファイルブラウザ"
        active={activePanelId === 'browser'}
        onClick={() => onSelectPanel('browser')}
      >
        <img src="./file-icons/default_folder.svg" width={16} height={16} alt="ファイルブラウザ" style={{ filter: 'invert(1) opacity(0.8)' }} />
      </IconButton>

      {/* 拡張機能管理 — codicons（常時表示） */}
      <IconButton
        title="拡張機能"
        active={activePanelId === 'ext-manager'}
        onClick={() => onSelectPanel('ext-manager')}
      >
        <img src="./codicons/extensions.svg" width={16} height={16} alt="拡張機能" style={{ filter: 'invert(1) opacity(0.8)' }} />
      </IconButton>

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
      {/* 拡張リロード — codicons */}
      <IconButton
        title={isReloading ? '拡張機能をリロード中…' : '拡張機能をリロード'}
        onClick={onReloadExtensions}
      >
        <img
          src="./codicons/refresh.svg"
          width={15}
          height={15}
          alt="リロード"
          style={{ filter: 'invert(1) opacity(0.8)' }}
          className={isReloading ? 'animate-spin' : ''}
        />
      </IconButton>
    </div>
  );
}
