import React, { useEffect, useState } from 'react';
import { ChatSession } from '../../shared/types';

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onClose: () => void;
}

export default function Sidebar({ currentSessionId, onSelectSession, onNewSession, onClose }: SidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const list = await window.arisChatAPI.listSessions();
    setSessions(list);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await window.arisChatAPI.deleteSession(sessionId);
    if (currentSessionId === sessionId) {
      onNewSession();
    }
    loadSessions();
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return '今日';
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return '昨日';
    }
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40 z-10" onClick={onClose} />

      {/* サイドバー */}
      <div className="absolute left-0 top-0 bottom-0 w-72 bg-aria-bg-light border-r border-aria-border z-20 flex flex-col animate-fade-in">
        {/* ヘッダー */}
        <div className="p-3 border-b border-aria-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-aria-text">会話履歴</h2>
          <button
            onClick={onNewSession}
            className="px-3 py-1.5 text-xs bg-aria-primary/20 text-aria-primary rounded-lg hover:bg-aria-primary/30 transition-colors"
          >
            + 新規
          </button>
        </div>

        {/* セッション一覧 */}
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
    </>
  );
}
