import React from 'react';

interface TitleBarProps {
  onMenuClick: () => void;
  onSettingsClick: () => void;
  currentPage: string;
}

export default function TitleBar({ onMenuClick, onSettingsClick, currentPage }: TitleBarProps) {
  return (
    <div className="titlebar-drag h-10 bg-aria-bg-light border-b border-aria-border flex items-center justify-between px-3 select-none shrink-0">
      {/* 左側: メニュー + タイトル */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="titlebar-no-drag w-7 h-7 flex items-center justify-center rounded hover:bg-aria-surface transition-colors"
          title="メニュー"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-aria-text-muted">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-aria-primary flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">A</span>
          </div>
          <span className="text-sm font-medium text-aria-text">Aris</span>
        </div>
      </div>

      {/* 右側: 操作ボタン */}
      <div className="flex items-center gap-1 titlebar-no-drag">
        <button
          onClick={onSettingsClick}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            currentPage === 'settings' ? 'bg-aria-primary/20 text-aria-primary' : 'hover:bg-aria-surface text-aria-text-muted'
          }`}
          title="設定"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </button>
        <button
          onClick={() => window.arisChatAPI.minimizeWindow()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-aria-surface text-aria-text-muted transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="1.5" fill="currentColor" rx="0.5"/></svg>
        </button>
        <button
          onClick={() => window.arisChatAPI.maximizeWindow()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-aria-surface text-aria-text-muted transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1.5" fill="none" rx="1"/></svg>
        </button>
        <button
          onClick={() => window.arisChatAPI.closeWindow()}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/80 text-aria-text-muted hover:text-white transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}
