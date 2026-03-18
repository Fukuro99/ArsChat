import React, { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar';
import ChatWindow from './components/ChatWindow';
import Settings from './components/Settings';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import WidgetOverlay from './components/WidgetOverlay';
import PaneGroup from './components/PaneGroup';
import { FileViewerPage } from './components/FileBrowser';
import { loadExtensions, type LoadedExtension, type OpenTabOptions } from './extension-loader';
import type { AppTab, DragState, Pane } from './types/app';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'widget') {
    return <WidgetOverlay />;
  }

  // ===== State =====
  const initialTab: AppTab = { id: 'chat', page: 'chat', label: 'チャット', icon: '💬', closable: false };
  const [panes, setPanes] = useState<Pane[]>([
    { id: 'pane-1', tabs: [initialTab], activeTabId: 'chat' },
  ]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');
  const [dragging, setDragging] = useState<DragState | null>(null);

  // アクティビティバーの選択状態（null = コンテンツパネルを閉じる）
  const [activePanelId, setActivePanelId] = useState<string | null>('history');
  // アクティビティバー自体の表示（hamburger で toggle）
  const [activityBarVisible, setActivityBarVisible] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  const [isReloadingExtensions, setIsReloadingExtensions] = useState(false);
  // サイドパネルの幅（px）
  const [sidePanelWidth, setSidePanelWidth] = useState(240);
  const [rightPanelWidth, setRightPanelWidth] = useState(288);

  // ===== Refs（安定した参照用） =====
  const extensionsRef = useRef<LoadedExtension[]>(extensions);
  useEffect(() => { extensionsRef.current = extensions; }, [extensions]);

  const activePaneIdRef = useRef<string>(activePaneId);
  useEffect(() => { activePaneIdRef.current = activePaneId; }, [activePaneId]);

  const panesRef = useRef<Pane[]>(panes);
  useEffect(() => { panesRef.current = panes; }, [panes]);

  // ===== 現在ページ（後方互換・Sidebar/TitleBar に渡す用） =====
  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0];
  const activeTab = activePane?.tabs.find((t) => t.id === activePane.activeTabId);
  const currentPage = activeTab?.page ?? 'chat';

  // ===== ページラベル・アイコン取得 =====
  function getTabMeta(page: string, exts: LoadedExtension[]): { label: string; icon?: string } {
    if (page === 'chat')     return { label: 'チャット', icon: '💬' };
    if (page === 'settings') return { label: '設定',     icon: '⚙️' };
    const m = page.match(/^ext:(.+?):(.+)$/);
    if (m) {
      const [, extId, pageId] = m;
      const ext = exts.find((e) => e.info.id === extId);
      const pc  = ext?.info.manifest.pages?.find((p) => p.id === pageId);
      return { label: pc?.title ?? pageId, icon: pc?.icon };
    }
    return { label: page };
  }

  // ===== navigate（タブを開く or 切り替え） =====
  const navigateRef = useRef<(page: string) => void>(() => {});

  function navigate(page: string) {
    setPanes((prev) => {
      // すでにいずれかのペインにあれば切り替え
      for (const pane of prev) {
        const existing = pane.tabs.find((t) => t.page === page);
        if (existing) {
          setActivePaneId(pane.id);
          return prev.map((p) =>
            p.id === pane.id ? { ...p, activeTabId: existing.id } : p,
          );
        }
      }
      // アクティブペインに新規タブを追加
      const currentPaneId = activePaneIdRef.current;
      const { label, icon } = getTabMeta(page, extensionsRef.current);
      const newTab: AppTab = { id: page, page, label, icon, closable: page !== 'chat' };
      return prev.map((p) =>
        p.id === currentPaneId
          ? { ...p, tabs: [...p.tabs, newTab], activeTabId: newTab.id }
          : p,
      );
    });
  }

  useEffect(() => { navigateRef.current = navigate; });
  const stableNavigate = useCallback((page: string) => navigateRef.current(page), []);

  // ===== openExtTab（拡張からの動的タブ生成） =====
  const openExtTabRef = useRef<(options: OpenTabOptions) => void>(() => {});

  function openExtTab(options: OpenTabOptions) {
    const fullId = `ext:${options.extId}:${options.id}`;
    setPanes((prev) => {
      // すでにいずれかのペインにあれば切り替え
      for (const pane of prev) {
        const existing = pane.tabs.find((t) => t.id === fullId);
        if (existing) {
          setActivePaneId(pane.id);
          return prev.map((p) =>
            p.id === pane.id ? { ...p, activeTabId: fullId } : p,
          );
        }
      }
      const currentPaneId = activePaneIdRef.current;
      const newTab: AppTab = {
        id: fullId,
        page: fullId,
        label: options.label,
        icon: options.icon,
        closable: true,
        pageComponentId: options.pageId,
        tabId: options.id,
      };
      return prev.map((p) =>
        p.id === currentPaneId
          ? { ...p, tabs: [...p.tabs, newTab], activeTabId: fullId }
          : p,
      );
    });
  }

  useEffect(() => { openExtTabRef.current = openExtTab; });
  const stableOpenExtTab = useCallback(
    (options: OpenTabOptions) => openExtTabRef.current(options),
    [],
  );

  // ===== closeTab =====
  function closeTab(id: string) {
    setPanes((prev) => {
      const updated = prev.map((pane) => {
        const idx = pane.tabs.findIndex((t) => t.id === id);
        if (idx < 0 || !pane.tabs[idx].closable) return pane;
        const next = pane.tabs.filter((t) => t.id !== id);
        const newActiveTabId =
          pane.activeTabId === id
            ? next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? ''
            : pane.activeTabId;
        return { ...pane, tabs: next, activeTabId: newActiveTabId };
      });
      // 空になったペインは削除（最低1ペインは残す）
      const nonEmpty = updated.filter((p) => p.tabs.length > 0);
      return nonEmpty.length > 0 ? nonEmpty : updated;
    });
  }

  // ===== ペイン操作ヘルパー =====

  /** タブを別ペインに移動（同ペイン内並び替え含む） */
  function moveTab(fromPaneId: string, toPaneId: string, tabId: string, insertIdx: number) {
    setPanes((prev) => {
      const fromPane = prev.find((p) => p.id === fromPaneId);
      const toPane   = prev.find((p) => p.id === toPaneId);
      if (!fromPane || !toPane) return prev;

      const tab = fromPane.tabs.find((t) => t.id === tabId);
      if (!tab) return prev;

      // 同ペイン内並び替え
      if (fromPaneId === toPaneId) {
        const sourceIdx = fromPane.tabs.findIndex((t) => t.id === tabId);
        const adjustedIdx = insertIdx > sourceIdx ? insertIdx - 1 : insertIdx;
        if (adjustedIdx === sourceIdx) return prev;
        const newTabs = fromPane.tabs.filter((t) => t.id !== tabId);
        newTabs.splice(adjustedIdx, 0, tab);
        return prev.map((p) => p.id === fromPaneId ? { ...p, tabs: newTabs } : p);
      }

      // 異なるペイン間移動
      const fromTabIdx = fromPane.tabs.indexOf(tab);
      const newFromTabs = fromPane.tabs.filter((t) => t.id !== tabId);
      const newFromActiveId =
        fromPane.activeTabId === tabId
          ? newFromTabs[Math.max(0, fromTabIdx - 1)]?.id ?? newFromTabs[0]?.id ?? ''
          : fromPane.activeTabId;

      const newToTabs = [...toPane.tabs];
      newToTabs.splice(Math.min(insertIdx, newToTabs.length), 0, tab);

      setActivePaneId(toPaneId);

      if (newFromTabs.length === 0) {
        return prev
          .filter((p) => p.id !== fromPaneId)
          .map((p) => p.id === toPaneId ? { ...p, tabs: newToTabs, activeTabId: tabId } : p);
      }

      return prev.map((p) => {
        if (p.id === fromPaneId) return { ...p, tabs: newFromTabs, activeTabId: newFromActiveId };
        if (p.id === toPaneId)   return { ...p, tabs: newToTabs, activeTabId: tabId };
        return p;
      });
    });
  }

  /** 対象ペインの左右にタブを分割して配置 */
  function splitPaneAtTarget(
    sourcePaneId: string,
    targetPaneId: string,
    tabId: string,
    direction: 'left' | 'right',
  ) {
    setPanes((prev) => {
      const sourcePane = prev.find((p) => p.id === sourcePaneId);
      if (!sourcePane) return prev;
      const tab = sourcePane.tabs.find((t) => t.id === tabId);
      if (!tab) return prev;

      const newPane: Pane = { id: `pane-${Date.now()}`, tabs: [tab], activeTabId: tabId };

      // ソースペインからタブを除去
      let result = prev.map((p) => {
        if (p.id !== sourcePaneId) return p;
        const newTabs = p.tabs.filter((t) => t.id !== tabId);
        const newActiveId =
          p.activeTabId === tabId
            ? newTabs[0]?.id ?? ''
            : p.activeTabId;
        return { ...p, tabs: newTabs, activeTabId: newActiveId };
      });

      // 空になったソースペインを削除
      result = result.filter((p) => p.tabs.length > 0);

      // ターゲットペインの左右に挿入
      const targetIdx = result.findIndex((p) => p.id === targetPaneId);
      const insertAt = direction === 'right' ? targetIdx + 1 : targetIdx;
      result.splice(insertAt < 0 ? result.length : insertAt, 0, newPane);

      setActivePaneId(newPane.id);
      return result;
    });
  }

  // ===== ドラッグイベントハンドラ =====

  const handleDragStart = useCallback(
    (tabId: string, paneId: string, x: number, y: number) => {
      setDragging({ tabId, sourcePaneId: paneId, currentX: x, currentY: y });
    },
    [],
  );

  // ドラッグ中のマウス追跡・終了
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      setDragging((prev) =>
        prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null,
      );
    };
    const onUp = () => setDragging(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dragging]);

  const handleDropOnTabBar = useCallback(
    (targetPaneId: string, tabId: string, insertIdx: number) => {
      moveTab(dragging?.sourcePaneId ?? targetPaneId, targetPaneId, tabId, insertIdx);
      setDragging(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging],
  );

  const handleDropOnContent = useCallback(
    (targetPaneId: string, tabId: string, zone: 'left' | 'center' | 'right') => {
      if (!dragging) return;
      const { sourcePaneId } = dragging;

      if (zone === 'center') {
        const targetPane = panesRef.current.find((p) => p.id === targetPaneId);
        moveTab(sourcePaneId, targetPaneId, tabId, targetPane?.tabs.length ?? 0);
      } else {
        splitPaneAtTarget(sourcePaneId, targetPaneId, tabId, zone);
      }
      setDragging(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging],
  );

  // ===== リサイズハンドラ =====
  const makeResizeHandler = useCallback(
    (
      currentWidth: number,
      setWidth: (w: number) => void,
      direction: 'right' | 'left' = 'right',
      min = 160,
      max = 600,
    ) =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = currentWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (ev: MouseEvent) => {
          const delta = direction === 'right' ? ev.clientX - startX : startX - ev.clientX;
          setWidth(Math.min(max, Math.max(min, startW + delta)));
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
    [],
  );

  const handleResizeStart      = makeResizeHandler(sidePanelWidth,  setSidePanelWidth,  'right', 160, 480);
  const handleRightResizeStart = makeResizeHandler(rightPanelWidth, setRightPanelWidth, 'left',  200, 600);

  // ===== 初期化 =====
  useEffect(() => {
    window.arsChatAPI.getActiveSession?.().then((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    const cleanupNav = window.arsChatAPI.onNavigate((page) => {
      stableNavigate(page);
    });

    const cleanupSession = window.arsChatAPI.onActiveSessionChanged?.((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    // 拡張機能の変更（インストール・有効化・無効化・更新）を自動検知してリロード
    const cleanupExtChanged = window.arsChatAPI.onExtChanged?.(() => {
      setSettingsVersion((v) => v + 1);
    });

    return () => {
      cleanupNav();
      cleanupSession?.();
      cleanupExtChanged?.();
    };
  }, []);

  // ===== 拡張ロード =====
  useEffect(() => {
    loadExtensions(stableNavigate, stableOpenExtTab)
      .then(setExtensions)
      .catch((err) => console.error('[App] 拡張のロードに失敗:', err));
  }, [settingsVersion]);

  // 拡張ロード後にタブラベルを最新化
  useEffect(() => {
    if (extensions.length === 0) return;
    setPanes((prev) =>
      prev.map((pane) => ({
        ...pane,
        tabs: pane.tabs.map((t) => {
          const { label, icon } = getTabMeta(t.page, extensions);
          return { ...t, label, icon };
        }),
      })),
    );
  }, [extensions]);

  // ===== 拡張強制リロード =====
  const handleReloadExtensions = async () => {
    if (isReloadingExtensions) return;
    setIsReloadingExtensions(true);
    try {
      await window.arsChatAPI.extensions.reload?.();
      setSettingsVersion((v) => v + 1);
    } catch (err) {
      console.error('[App] 拡張リロード失敗:', err);
    } finally {
      setIsReloadingExtensions(false);
    }
  };

  // ===== アクティビティアイコンクリック =====
  const handleSelectPanel = (id: string) => {
    setActivePanelId((prev) => (prev === id ? null : id));
  };

  // ===== ファイルブラウザ: ファイルタブを開く =====
  const handleOpenFileTab = useCallback((tabId: string, label: string, icon: string) => {
    setPanes((prev) => {
      // すでに開いていれば切り替え
      for (const pane of prev) {
        const existing = pane.tabs.find((t) => t.id === tabId);
        if (existing) {
          setActivePaneId(pane.id);
          return prev.map((p) => p.id === pane.id ? { ...p, activeTabId: tabId } : p);
        }
      }
      const currentPaneId = activePaneIdRef.current;
      const newTab: AppTab = {
        id: tabId,
        page: 'fb-file',
        label,
        icon,
        closable: true,
        tabId,
      };
      return prev.map((p) =>
        p.id === currentPaneId
          ? { ...p, tabs: [...p.tabs, newTab], activeTabId: tabId }
          : p,
      );
    });
  }, []);

  const hasNavExtensions = extensions.some((ext) =>
    (ext.info.manifest.pages ?? []).some(
      (p) => p.sidebar !== false && !p.sidebarPanel && !p.rightPanel,
    ),
  );

  // ===== タブコンテンツ描画 =====
  function renderTabContent(tab: AppTab) {
    if (tab.page === 'chat') {
      // 全ペインの開いているファイルタブのパスを収集（'fb:' プレフィックスを除去）
      const openFilePaths = panes
        .flatMap((p) => p.tabs)
        .map((t) => t.id)
        .filter((id) => id.startsWith('fb:'))
        .map((id) => id.slice('fb:'.length));
      return (
        <ChatWindow
          sessionId={currentSessionId}
          onSessionCreated={(id) => {
            setCurrentSessionId(id);
            window.arsChatAPI.setActiveSession?.(id);
          }}
          settingsVersion={settingsVersion}
          openFilePaths={openFilePaths}
        />
      );
    }

    if (tab.page === 'settings') {
      return (
        <Settings
          extensions={extensions}
          onBack={() => {
            setSettingsVersion((v) => v + 1);
            closeTab('settings');
          }}
        />
      );
    }

    if (tab.page === 'fb-file') {
      return <FileViewerPage tabId={tab.tabId ?? ''} />;
    }

    const m = tab.page.match(/^ext:(.+?):(.+)$/);
    if (m) {
      const [, extId, pageId] = m;
      const ext = extensions.find((e) => e.info.id === extId);
      const componentId = tab.pageComponentId ?? pageId;
      const PageComponent = ext?.pages[componentId];
      if (PageComponent) {
        return <PageComponent api={null as any} tabId={tab.tabId ?? pageId} />;
      }

      return (
        <div className="flex-1 flex items-center justify-center text-aria-text-muted">
          <div className="text-center">
            <p className="text-sm">拡張ページが見つかりません</p>
            <p className="text-xs mt-1 opacity-60">{tab.page}</p>
          </div>
        </div>
      );
    }

    return null;
  }

  // ===== 描画 =====
  const settingsExists = panes.some((p) => p.tabs.some((t) => t.id === 'settings'));

  return (
    <div className="h-screen flex flex-col bg-aria-bg">
      <TitleBar
        onMenuClick={() => setActivityBarVisible((v) => !v)}
        onSettingsClick={() => {
          if (settingsExists) {
            closeTab('settings');
          } else {
            navigate('settings');
          }
        }}
        onRightPanelClick={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
        currentPage={currentPage}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* アクティビティバー */}
        <div
          className={`shrink-0 overflow-hidden transition-all duration-200 ${
            activityBarVisible ? 'w-12' : 'w-0'
          }`}
        >
          <ActivityBar
            activePanelId={activePanelId}
            extensions={extensions}
            hasNavExtensions={hasNavExtensions}
            onNewSession={() => {
              setCurrentSessionId(null);
              window.arsChatAPI.setActiveSession?.(null);
              setActivePaneId(panes[0].id);
              setPanes((prev) =>
                prev.map((p, i) => (i === 0 ? { ...p, activeTabId: 'chat' } : p)),
              );
            }}
            onSelectPanel={handleSelectPanel}
            onReloadExtensions={handleReloadExtensions}
            isReloading={isReloadingExtensions}
          />
        </div>

        {/* サイドコンテンツパネル */}
        <div
          className="flex-none overflow-hidden border-r border-aria-border flex"
          style={
            activityBarVisible && activePanelId
              ? { width: sidePanelWidth, transition: 'none' }
              : { width: 0, transition: 'width 0.2s' }
          }
        >
          {activePanelId && (
            <>
              <div className="h-full flex-1 min-w-0 overflow-hidden bg-aria-bg-light">
                <Sidebar
                  activePanelId={activePanelId}
                  currentSessionId={currentSessionId}
                  currentPage={currentPage}
                  extensions={extensions}
                  onOpenFileTab={handleOpenFileTab}
                  onSelectSession={(id) => {
                    setCurrentSessionId(id);
                    window.arsChatAPI.setActiveSession?.(id);
                    // チャットタブがあるペインをアクティブに
                    const chatPane = panes.find((p) => p.tabs.some((t) => t.page === 'chat'));
                    if (chatPane) {
                      setActivePaneId(chatPane.id);
                      setPanes((prev) =>
                        prev.map((p) =>
                          p.id === chatPane.id ? { ...p, activeTabId: 'chat' } : p,
                        ),
                      );
                    }
                  }}
                  onNewSession={() => {
                    setCurrentSessionId(null);
                    window.arsChatAPI.setActiveSession?.(null);
                    const chatPane = panes.find((p) => p.tabs.some((t) => t.page === 'chat'));
                    if (chatPane) {
                      setActivePaneId(chatPane.id);
                      setPanes((prev) =>
                        prev.map((p) =>
                          p.id === chatPane.id ? { ...p, activeTabId: 'chat' } : p,
                        ),
                      );
                    }
                  }}
                  onNavigate={(page) => navigate(page)}
                />
              </div>
              {/* リサイズハンドル（右端） */}
              <div
                onMouseDown={handleResizeStart}
                className="w-1 flex-none cursor-col-resize hover:bg-aria-primary/40 active:bg-aria-primary/60 transition-colors"
              />
            </>
          )}
        </div>

        {/* メインコンテンツ（ペイングループ） */}
        <PaneGroup
          panes={panes}
          activePaneId={activePaneId}
          dragging={dragging}
          onTabClose={(_paneId, tabId) => closeTab(tabId)}
          onTabActivate={(paneId, tabId) => {
            setActivePaneId(paneId);
            setPanes((prev) =>
              prev.map((p) => (p.id === paneId ? { ...p, activeTabId: tabId } : p)),
            );
          }}
          onPaneActivate={setActivePaneId}
          onDragStart={handleDragStart}
          onDropOnTabBar={handleDropOnTabBar}
          onDropOnContent={handleDropOnContent}
          renderContent={renderTabContent}
        />

        {/* 右パネル */}
        <div
          className="flex-none overflow-hidden flex"
          style={
            rightPanelOpen
              ? { width: rightPanelWidth, transition: 'none' }
              : { width: 0, transition: 'width 0.2s' }
          }
        >
          <div
            onMouseDown={handleRightResizeStart}
            className="w-1 flex-none cursor-col-resize hover:bg-aria-primary/40 active:bg-aria-primary/60 transition-colors border-l border-aria-border"
          />
          <div className="flex-1 min-w-0 overflow-hidden">
            <RightPanel extensions={extensions} />
          </div>
        </div>
      </div>

      {/* ドラッグゴースト */}
      {dragging && (() => {
        const tab = panesRef.current
          .flatMap((p) => p.tabs)
          .find((t) => t.id === dragging.tabId);
        return (
          <div
            className="fixed pointer-events-none z-50 bg-aria-bg-light border border-aria-border rounded px-3 py-1 text-xs opacity-90 shadow-lg flex items-center gap-1.5"
            style={{ left: dragging.currentX + 12, top: dragging.currentY - 14 }}
          >
            {tab?.icon && <span>{tab.icon}</span>}
            <span>{tab?.label ?? dragging.tabId}</span>
          </div>
        );
      })()}
    </div>
  );
}
