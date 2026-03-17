import React, { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar';
import ChatWindow from './components/ChatWindow';
import Settings from './components/Settings';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import WidgetOverlay from './components/WidgetOverlay';
import { loadExtensions, type LoadedExtension } from './extension-loader';

// ===== タブ型 =====
interface AppTab {
  id: string;       // ページ文字列をそのまま ID として使う
  page: string;     // 'chat' | 'settings' | 'ext:{id}:{pageId}'
  label: string;
  icon?: string;
  closable: boolean;
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'widget') {
    return <WidgetOverlay />;
  }

  // ===== State =====
  const [tabs, setTabs] = useState<AppTab[]>([
    { id: 'chat', page: 'chat', label: 'チャット', icon: '💬', closable: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('chat');

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

  // ===== 現在ページ（後方互換・Sidebar に渡す用） =====
  const currentPage = tabs.find((t) => t.id === activeTabId)?.page ?? 'chat';

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
  // extensions を最新状態で参照するために ref 経由にする
  const extensionsRef = useRef<LoadedExtension[]>(extensions);
  useEffect(() => { extensionsRef.current = extensions; }, [extensions]);

  const navigateRef = useRef<(page: string) => void>(() => {});

  function navigate(page: string) {
    setTabs((prev) => {
      const existing = prev.find((t) => t.page === page);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const { label, icon } = getTabMeta(page, extensionsRef.current);
      const newTab: AppTab = { id: page, page, label, icon, closable: page !== 'chat' };
      setActiveTabId(newTab.id);
      return [...prev, newTab];
    });
  }

  // 拡張コンポーネントから呼ばれるので安定した参照を渡す
  useEffect(() => { navigateRef.current = navigate; });
  const stableNavigate = useCallback((page: string) => navigateRef.current(page), []);

  // ===== closeTab =====
  function closeTab(id: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0 || !prev[idx].closable) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        // 閉じたタブの左隣（なければ右隣）をアクティブに
        const newActive = next[Math.max(0, idx - 1)]?.id ?? next[0]?.id ?? 'chat';
        setActiveTabId(newActive);
      }
      return next;
    });
  }

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

  const handleResizeStart      = makeResizeHandler(sidePanelWidth,   setSidePanelWidth,   'right', 160, 480);
  const handleRightResizeStart = makeResizeHandler(rightPanelWidth,  setRightPanelWidth,  'left',  200, 600);

  // ===== 初期化 =====
  useEffect(() => {
    window.arisChatAPI.getActiveSession?.().then((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    const cleanupNav = window.arisChatAPI.onNavigate((page) => {
      stableNavigate(page);
    });

    const cleanupSession = window.arisChatAPI.onActiveSessionChanged?.((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    return () => {
      cleanupNav();
      cleanupSession?.();
    };
  }, []);

  // ===== 拡張ロード =====
  useEffect(() => {
    loadExtensions(stableNavigate)
      .then(setExtensions)
      .catch((err) => console.error('[App] 拡張のロードに失敗:', err));
  }, [settingsVersion]);

  // 拡張ロード後にタブラベルを最新化（アイコン等が取れていなかった場合）
  useEffect(() => {
    if (extensions.length === 0) return;
    setTabs((prev) =>
      prev.map((t) => {
        const { label, icon } = getTabMeta(t.page, extensions);
        return { ...t, label, icon };
      }),
    );
  }, [extensions]);

  // ===== 拡張強制リロード =====
  const handleReloadExtensions = async () => {
    if (isReloadingExtensions) return;
    setIsReloadingExtensions(true);
    try {
      await window.arisChatAPI.extensions.reload?.();
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

  const hasNavExtensions = extensions.some((ext) =>
    (ext.info.manifest.pages ?? []).some(
      (p) => p.sidebar !== false && !p.sidebarPanel && !p.rightPanel,
    ),
  );

  // ===== タブコンテンツ描画 =====
  function renderTabContent(tab: AppTab) {
    if (tab.page === 'chat') {
      return (
        <ChatWindow
          sessionId={currentSessionId}
          onSessionCreated={(id) => {
            setCurrentSessionId(id);
            window.arisChatAPI.setActiveSession?.(id);
          }}
          settingsVersion={settingsVersion}
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
            setActiveTabId('chat');
          }}
        />
      );
    }

    const m = tab.page.match(/^ext:(.+?):(.+)$/);
    if (m) {
      const [, extId, pageId] = m;
      const ext = extensions.find((e) => e.info.id === extId);
      const PageComponent = ext?.pages[pageId];
      if (PageComponent) return <PageComponent api={null as any} />;

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
  return (
    <div className="h-screen flex flex-col bg-aria-bg">
      <TitleBar
        onMenuClick={() => setActivityBarVisible((v) => !v)}
        onSettingsClick={() => {
          if (activeTabId === 'settings') {
            closeTab('settings');
            setActiveTabId('chat');
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
              window.arisChatAPI.setActiveSession?.(null);
              setActiveTabId('chat');
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
                  onSelectSession={(id) => {
                    setCurrentSessionId(id);
                    window.arisChatAPI.setActiveSession?.(id);
                    setActiveTabId('chat');
                  }}
                  onNewSession={() => {
                    setCurrentSessionId(null);
                    window.arisChatAPI.setActiveSession?.(null);
                    setActiveTabId('chat');
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

        {/* メインコンテンツ（タブシステム） */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* タブバー */}
          <div className="flex items-end shrink-0 bg-aria-bg-light border-b border-aria-border overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`
                  group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0
                  border-r border-aria-border select-none transition-colors
                  ${activeTabId === tab.id
                    ? 'bg-aria-bg text-aria-text border-t-2 border-t-aria-primary'
                    : 'text-aria-text-muted hover:bg-aria-bg/60 hover:text-aria-text border-t-2 border-t-transparent'
                  }
                `}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.icon && <span className="leading-none">{tab.icon}</span>}
                <span className="max-w-[140px] truncate">{tab.label}</span>
                {tab.closable && (
                  <button
                    className="ml-0.5 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-white/10 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    title="タブを閉じる"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="7" y2="7"/>
                      <line x1="7" y1="1" x2="1" y2="7"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* タブコンテンツ（display:none で state を保持したまま切り替え） */}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="flex-1 min-w-0 flex flex-col overflow-hidden"
              style={{ display: activeTabId === tab.id ? 'flex' : 'none' }}
            >
              {renderTabContent(tab)}
            </div>
          ))}
        </div>

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
    </div>
  );
}
