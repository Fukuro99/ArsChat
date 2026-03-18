import React, { useEffect, useState } from 'react';
import { ChatSession } from '../../shared/types';
import type { LoadedExtension } from '../extension-loader';
import { FileBrowserPanel, type FileBrowserPanelProps } from './FileBrowser';
import ExtensionManagerPanel from './ExtensionManagerPanel';

interface SidePanelProps {
  /** アクティブなパネル ID ('history' | 'extensions' | 'browser' | '{extId}:{pageId}') */
  activePanelId: string;
  currentSessionId: string | null;
  currentPage: string;
  extensions: LoadedExtension[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onNavigate: (page: string) => void;
  onOpenFileTab: FileBrowserPanelProps['onOpenFileTab'];
  onFileBrowserPathChange?: (path: string) => void;
}

/** 会話履歴パネル */
function HistoryPanel({
  currentSessionId,
  onSelectSession,
  onNewSession,
}: {
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    const list = await window.arsChatAPI.listSessions();
    setSessions(list);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await window.arsChatAPI.deleteSession(sessionId);
    if (currentSessionId === sessionId) onNewSession();
    loadSessions();
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return '今日';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return '昨日';
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-aria-border flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">会話履歴</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="text-center text-sm text-aria-text-muted py-8">履歴なし</p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`group px-3 py-2.5 cursor-pointer border-b border-aria-border/50 hover:bg-aria-surface/50 transition-colors ${
                session.id === currentSessionId ? 'bg-aria-surface' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-aria-text truncate">{session.title}</p>
                  <p className="text-[11px] text-aria-text-muted mt-0.5">
                    {formatDate(session.updatedAt)} · {session.messages.length}件
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-aria-text-muted hover:text-red-400 transition-all"
                  title="削除"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 拡張ナビリンク一覧パネル */
function ExtensionsPanel({
  extensions,
  currentPage,
  onNavigate,
}: {
  extensions: LoadedExtension[];
  currentPage: string;
  onNavigate: (page: string) => void;
}) {
  const navPages = extensions.flatMap((ext) =>
    (ext.info.manifest.pages ?? [])
      .filter((p) => p.sidebar !== false && !p.sidebarPanel && !p.rightPanel)
      .map((p) => ({
        pageKey: `ext:${ext.info.id}:${p.id}`,
        title: p.title,
        icon: p.icon,
        extName: ext.info.manifest.displayName,
      })),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-aria-border shrink-0">
        <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">拡張機能</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {navPages.length === 0 ? (
          <p className="text-center text-sm text-aria-text-muted py-8">ページなし</p>
        ) : (
          navPages.map((ep) => (
            <button
              key={ep.pageKey}
              onClick={() => onNavigate(ep.pageKey)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left border-b border-aria-border/50 hover:bg-aria-surface/50 transition-colors ${
                currentPage === ep.pageKey ? 'bg-aria-surface text-aria-primary' : 'text-aria-text'
              }`}
            >
              <span className="text-base leading-none shrink-0">{ep.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate">{ep.title}</p>
                <p className="text-[10px] text-aria-text-muted truncate">{ep.extName}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** アクティビティに応じたサイドコンテンツパネル */
export default function Sidebar({
  activePanelId,
  currentSessionId,
  currentPage,
  extensions,
  onSelectSession,
  onNewSession,
  onNavigate,
  onOpenFileTab,
  onFileBrowserPathChange,
}: SidePanelProps) {
  if (activePanelId === 'history') {
    return (
      <HistoryPanel
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
      />
    );
  }

  if (activePanelId === 'browser') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2.5 border-b border-aria-border flex items-center gap-2 shrink-0">
          <span className="text-base leading-none">📁</span>
          <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">ファイルブラウザ</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <FileBrowserPanel onOpenFileTab={onOpenFileTab} onPathChange={onFileBrowserPathChange} />
        </div>
      </div>
    );
  }

  if (activePanelId === 'extensions') {
    return (
      <ExtensionsPanel
        extensions={extensions}
        currentPage={currentPage}
        onNavigate={onNavigate}
      />
    );
  }

  if (activePanelId === 'ext-manager') {
    return <ExtensionManagerPanel />;
  }

  // 拡張 sidebarPanel: "{extId}:{pageId}"
  const colonIdx = activePanelId.indexOf(':');
  if (colonIdx !== -1) {
    const extId = activePanelId.slice(0, colonIdx);
    const pageId = activePanelId.slice(colonIdx + 1);
    const ext = extensions.find((e) => e.info.id === extId);
    const pageDef = ext?.info.manifest.pages?.find((p) => p.id === pageId);
    const Component = ext?.sidebarPanels[pageId];

    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2.5 border-b border-aria-border flex items-center gap-2 shrink-0">
          {pageDef?.icon && <span className="text-base leading-none">{pageDef.icon}</span>}
          <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">
            {pageDef?.title ?? pageId}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {Component ? (
            <Component api={null as any} />
          ) : (
            <p className="text-center text-sm text-aria-text-muted py-8">コンポーネントなし</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
