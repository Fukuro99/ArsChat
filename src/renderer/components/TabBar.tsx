import React, { useCallback, useRef, useState } from 'react';
import type { AppTab, DragState } from '../types/app';

interface TabBarProps {
  paneId: string;
  tabs: AppTab[];
  activeTabId: string;
  dragging: DragState | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onDragStart: (tabId: string, paneId: string, x: number, y: number) => void;
  onDropOnTabBar: (targetPaneId: string, tabId: string, insertIdx: number) => void;
}

export default function TabBar({
  paneId,
  tabs,
  activeTabId,
  dragging,
  onTabClick,
  onTabClose,
  onDragStart,
  onDropOnTabBar,
}: TabBarProps) {
  const [insertIdx, setInsertIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const isDraggingActive = dragging !== null;
  const draggingTabId = dragging?.tabId;

  // ===== ドラッグ開始検出 =====
  const handleMouseDown = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;

      const onMove = (ev: MouseEvent) => {
        if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) {
          started = true;
          onDragStart(tabId, paneId, ev.clientX, ev.clientY);
          cleanup();
        }
      };
      const onUp = () => cleanup();
      const cleanup = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [paneId, onDragStart],
  );

  // ===== ドラッグ中のタブバー上マウス位置追跡 =====
  const handleBarMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingActive || !barRef.current) return;
      const tabEls = Array.from(barRef.current.querySelectorAll('[data-tab-item]')) as HTMLElement[];
      let idx = tabEls.length;
      for (let i = 0; i < tabEls.length; i++) {
        const rect = tabEls[i].getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          idx = i;
          break;
        }
      }
      setInsertIdx(idx);
    },
    [isDraggingActive],
  );

  const handleBarMouseLeave = useCallback(() => {
    setInsertIdx(null);
  }, []);

  const handleBarMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDraggingActive || insertIdx === null || !draggingTabId) return;
      onDropOnTabBar(paneId, draggingTabId, insertIdx);
      setInsertIdx(null);
    },
    [isDraggingActive, insertIdx, draggingTabId, paneId, onDropOnTabBar],
  );

  return (
    <div
      ref={barRef}
      className="flex items-end shrink-0 bg-aria-bg-light border-b border-aria-border overflow-x-auto"
      onMouseMove={isDraggingActive ? handleBarMouseMove : undefined}
      onMouseLeave={handleBarMouseLeave}
      onMouseUp={isDraggingActive ? handleBarMouseUp : undefined}
    >
      {tabs.map((tab, i) => (
        <React.Fragment key={tab.id}>
          {/* 挿入インジケータ */}
          {isDraggingActive && insertIdx === i && (
            <div className="w-0.5 min-h-[28px] bg-aria-primary self-stretch shrink-0" />
          )}
          <div
            data-tab-item
            className={`
              group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0
              border-r border-aria-border select-none transition-colors
              ${tab.id === draggingTabId ? 'opacity-30' : ''}
              ${
                activeTabId === tab.id
                  ? 'bg-aria-bg text-aria-text border-t-2 border-t-aria-primary'
                  : 'text-aria-text-muted hover:bg-aria-bg/60 hover:text-aria-text border-t-2 border-t-transparent'
              }
            `}
            onMouseDown={(e) => handleMouseDown(tab.id, e)}
            onClick={() => onTabClick(tab.id)}
          >
            {tab.icon && <span className="leading-none">{tab.icon}</span>}
            <span className="max-w-[140px] truncate">{tab.label}</span>
            {tab.closable && (
              <button
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/10 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                title="タブを閉じる"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <line x1="1" y1="1" x2="7" y2="7" />
                  <line x1="7" y1="1" x2="1" y2="7" />
                </svg>
              </button>
            )}
          </div>
        </React.Fragment>
      ))}
      {/* 末尾の挿入インジケータ */}
      {isDraggingActive && insertIdx === tabs.length && (
        <div className="w-0.5 min-h-[28px] bg-aria-primary self-stretch shrink-0" />
      )}
    </div>
  );
}
