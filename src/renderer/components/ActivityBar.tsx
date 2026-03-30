import type React from 'react';
import type { LoadedExtension } from '../extension-loader';

interface ActivityBarProps {
  activePanelId: string | null;
  currentPage: string;
  extensions: LoadedExtension[];
  onNewSession: () => void;
  onSelectPanel: (id: string) => void;
  onNavigate: (page: string) => void;
  onReloadExtensions: () => void;
  isReloading?: boolean;
}

/** アイコンボタン（VSCode スタイル：左辺にアクティブインジケーター） */
function IconButton({
  active,
  title,
  onClick,
  children,
  small = false,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="relative w-full flex justify-center">
      {/* アクティブインジケーター（左辺の縦ライン） */}
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-aria-primary rounded-r-full" />}
      <button
        onClick={onClick}
        title={title}
        className={`${small ? 'w-8 h-8' : 'w-10 h-10'} flex items-center justify-center rounded-md transition-all duration-150 ${
          active ? 'bg-aria-primary/10' : 'hover:bg-white/5'
        }`}
      >
        {children}
      </button>
    </div>
  );
}

/** SVG アイコン（img タグ代替・インライン filter 対応） */
function SvgIcon({
  src,
  size = 20,
  active,
  spinning = false,
}: {
  src: string;
  size?: number;
  active?: boolean;
  spinning?: boolean;
}) {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{
        filter: active ? 'brightness(0) invert(1)' : 'brightness(0) invert(1) opacity(0.5)',
        transition: 'filter 0.15s',
      }}
      className={spinning ? 'animate-spin' : ''}
    />
  );
}

export default function ActivityBar({
  activePanelId,
  currentPage,
  extensions,
  onNewSession,
  onSelectPanel,
  onNavigate,
  onReloadExtensions,
  isReloading = false,
}: ActivityBarProps) {
  // sidebarPanel を持つ拡張の活動項目（サイドバー内インライン表示）
  const sidebarPanelItems = extensions.flatMap((ext) =>
    (ext.info.manifest.pages ?? [])
      .filter((p) => p.sidebarPanel)
      .map((p) => ({
        id: `${ext.info.id}:${p.id}`,
        title: p.title,
        icon: p.icon,
        kind: 'sidebarPanel' as const,
      })),
  );

  // sidebar: true のページ（メインタブとして開く）を持つ拡張の活動項目
  const sidebarPageItems = extensions.flatMap((ext) =>
    (ext.info.manifest.pages ?? [])
      .filter((p) => p.sidebar !== false && !p.sidebarPanel && !p.rightPanel)
      .map((p) => ({
        pageKey: `ext:${ext.info.id}:${p.id}`,
        title: p.title,
        icon: p.icon,
        kind: 'page' as const,
      })),
  );

  return (
    <div className="h-full w-12 bg-aria-bg-light border-r border-aria-border flex flex-col items-center py-2 gap-0.5 shrink-0">
      {/* 新規チャット */}
      <IconButton title="新規チャット" onClick={onNewSession}>
        <SvgIcon src="./codicons/add.svg" size={20} />
      </IconButton>

      <div className="w-5 h-px bg-aria-border/60 my-1.5 mx-auto" />

      {/* 会話履歴 */}
      <IconButton title="会話履歴" active={activePanelId === 'history'} onClick={() => onSelectPanel('history')}>
        <SvgIcon src="./codicons/history.svg" size={20} active={activePanelId === 'history'} />
      </IconButton>

      {/* ファイルブラウザ */}
      <IconButton
        title="ファイルブラウザ"
        active={activePanelId === 'browser'}
        onClick={() => onSelectPanel('browser')}
      >
        <SvgIcon src="./file-icons/default_folder.svg" size={20} active={activePanelId === 'browser'} />
      </IconButton>

      {/* 拡張機能管理 */}
      <IconButton
        title="拡張機能"
        active={activePanelId === 'ext-manager'}
        onClick={() => onSelectPanel('ext-manager')}
      >
        <SvgIcon src="./codicons/extensions.svg" size={20} active={activePanelId === 'ext-manager'} />
      </IconButton>

      {/* 拡張 sidebarPanel アイテム（サイドバー内インライン表示） */}
      {sidebarPanelItems.map((item) => (
        <IconButton
          key={item.id}
          title={item.title}
          active={activePanelId === item.id}
          onClick={() => onSelectPanel(item.id)}
        >
          <span
            className={`text-lg leading-none transition-all ${
              activePanelId === item.id ? 'opacity-100 scale-110' : 'opacity-55'
            }`}
          >
            {item.icon}
          </span>
        </IconButton>
      ))}

      {/* 拡張 sidebar ページアイテム（メインタブとして開く） */}
      {sidebarPageItems.map((item) => (
        <IconButton
          key={item.pageKey}
          title={item.title}
          active={currentPage === item.pageKey}
          onClick={() => onNavigate(item.pageKey)}
        >
          <span
            className={`text-lg leading-none transition-all ${
              currentPage === item.pageKey ? 'opacity-100 scale-110' : 'opacity-55'
            }`}
          >
            {item.icon}
          </span>
        </IconButton>
      ))}

      {/* 下部：拡張リロードボタン */}
      <div className="flex-1" />

      <IconButton
        title={isReloading ? '拡張機能をリロード中…' : '拡張機能をリロード'}
        onClick={onReloadExtensions}
        small
      >
        <SvgIcon src="./codicons/refresh.svg" size={16} spinning={isReloading} />
      </IconButton>
    </div>
  );
}
