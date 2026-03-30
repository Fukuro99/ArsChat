import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppTab, DragState, Pane } from '../types/app';
import TabBar from './TabBar';

interface PaneGroupProps {
  panes: Pane[];
  activePaneId: string;
  dragging: DragState | null;
  onTabClose: (paneId: string, tabId: string) => void;
  onTabActivate: (paneId: string, tabId: string) => void;
  onPaneActivate: (paneId: string) => void;
  onDragStart: (tabId: string, paneId: string, x: number, y: number) => void;
  onDropOnTabBar: (targetPaneId: string, tabId: string, insertIdx: number) => void;
  onDropOnContent: (targetPaneId: string, tabId: string, zone: 'left' | 'center' | 'right') => void;
  renderContent: (tab: AppTab) => React.ReactNode;
}

export default function PaneGroup({
  panes,
  activePaneId,
  dragging,
  onTabClose,
  onTabActivate,
  onPaneActivate,
  onDragStart,
  onDropOnTabBar,
  onDropOnContent,
  renderContent,
}: PaneGroupProps) {
  const [paneWidths, setPaneWidths] = useState<number[]>([]);
  const [hoverZone, setHoverZone] = useState<{
    paneId: string;
    zone: 'left' | 'center' | 'right';
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDragging = dragging !== null;

  // ペイン数が変わったら均等分割にリセット
  useEffect(() => {
    setPaneWidths(panes.map(() => 100 / panes.length));
  }, [panes.length]);

  // 現在の幅配列（初期化前はデフォルト均等）
  const widths = paneWidths.length === panes.length ? paneWidths : panes.map(() => 100 / panes.length);

  // ===== ペイン間リサイズハンドラ =====
  const makePaneResizeHandler = useCallback(
    (idx: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;
      const w = paneWidths.length === panes.length ? [...paneWidths] : panes.map(() => 100 / panes.length);

      const startX = e.clientX;
      const startLeft = w[idx];
      const startRight = w[idx + 1];
      const total = startLeft + startRight;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const deltaPct = ((ev.clientX - startX) / containerWidth) * 100;
        const newLeft = Math.max(10, Math.min(total - 10, startLeft + deltaPct));
        const updated = [...w];
        updated[idx] = newLeft;
        updated[idx + 1] = total - newLeft;
        setPaneWidths(updated);
      };

      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [panes, paneWidths],
  );

  // ===== コンテンツエリアのドロップゾーン =====
  const handleContentMouseMove = useCallback(
    (paneId: string, e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const w = rect.width;
      const zone: 'left' | 'center' | 'right' = relX < w * 0.25 ? 'left' : relX > w * 0.75 ? 'right' : 'center';
      setHoverZone((prev) => (prev?.paneId === paneId && prev?.zone === zone ? prev : { paneId, zone }));
    },
    [isDragging],
  );

  const handleContentMouseLeave = useCallback(() => {
    setHoverZone(null);
  }, []);

  const handleContentMouseUp = useCallback(
    (paneId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDragging || !hoverZone || hoverZone.paneId !== paneId || !dragging) return;
      onDropOnContent(paneId, dragging.tabId, hoverZone.zone);
      setHoverZone(null);
    },
    [isDragging, hoverZone, dragging, onDropOnContent],
  );

  // ドラッグ終了時にホバー状態をクリア
  useEffect(() => {
    if (!isDragging) setHoverZone(null);
  }, [isDragging]);

  return (
    <div ref={containerRef} className="flex-1 min-w-0 flex flex-row overflow-hidden">
      {panes.map((pane, idx) => (
        <React.Fragment key={pane.id}>
          {/* ペイン */}
          <div
            className="flex flex-col overflow-hidden min-w-0"
            style={{ width: `${widths[idx]}%` }}
            onMouseDown={() => onPaneActivate(pane.id)}
          >
            {/* タブバー */}
            <TabBar
              paneId={pane.id}
              tabs={pane.tabs}
              activeTabId={pane.activeTabId}
              dragging={dragging}
              onTabClick={(tabId) => onTabActivate(pane.id, tabId)}
              onTabClose={(tabId) => onTabClose(pane.id, tabId)}
              onDragStart={onDragStart}
              onDropOnTabBar={onDropOnTabBar}
            />

            {/* コンテンツエリア */}
            <div
              className="flex-1 min-h-0 relative overflow-hidden"
              onMouseMove={isDragging ? (e) => handleContentMouseMove(pane.id, e) : undefined}
              onMouseLeave={isDragging ? handleContentMouseLeave : undefined}
              onMouseUp={isDragging ? (e) => handleContentMouseUp(pane.id, e) : undefined}
            >
              {pane.tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                  style={{ display: pane.activeTabId === tab.id ? 'flex' : 'none' }}
                >
                  {renderContent(tab)}
                </div>
              ))}

              {/* ドロップゾーンオーバーレイ（ドラッグ中のみ） */}
              {isDragging && hoverZone?.paneId === pane.id && (
                <div className="absolute inset-0 flex pointer-events-none z-40">
                  <div
                    className={`w-1/4 h-full transition-colors ${
                      hoverZone.zone === 'left'
                        ? 'bg-aria-primary/20 border-2 border-aria-primary/70'
                        : 'border-2 border-transparent'
                    }`}
                  />
                  <div
                    className={`flex-1 h-full transition-colors ${
                      hoverZone.zone === 'center'
                        ? 'bg-aria-primary/20 border-2 border-aria-primary/70'
                        : 'border-2 border-transparent'
                    }`}
                  />
                  <div
                    className={`w-1/4 h-full transition-colors ${
                      hoverZone.zone === 'right'
                        ? 'bg-aria-primary/20 border-2 border-aria-primary/70'
                        : 'border-2 border-transparent'
                    }`}
                  />
                </div>
              )}

              {/* アクティブペインの枠線（複数ペイン時のみ） */}
              {panes.length > 1 && activePaneId === pane.id && (
                <div className="absolute inset-0 pointer-events-none z-10 ring-1 ring-aria-primary/30 ring-inset" />
              )}
            </div>
          </div>

          {/* ペイン間リサイズハンドル */}
          {idx < panes.length - 1 && (
            <div
              onMouseDown={makePaneResizeHandler(idx)}
              className="w-1 shrink-0 cursor-col-resize hover:bg-aria-primary/40 active:bg-aria-primary/60 transition-colors border-x border-aria-border"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
