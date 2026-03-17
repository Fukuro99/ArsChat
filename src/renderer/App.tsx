import React, { useState, useEffect, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import ChatWindow from './components/ChatWindow';
import Settings from './components/Settings';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import WidgetOverlay from './components/WidgetOverlay';
import { loadExtensions, type LoadedExtension } from './extension-loader';

type Page = 'chat' | 'settings' | string;

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'widget') {
    return <WidgetOverlay />;
  }

  const [currentPage, setCurrentPage] = useState<Page>('chat');
  // アクティビティバーの選択状態（null = コンテンツパネルを閉じる）
  const [activePanelId, setActivePanelId] = useState<string | null>('history');
  // アクティビティバー自体の表示（hamburger で toggle）
  const [activityBarVisible, setActivityBarVisible] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  // サイドパネルの幅（px）
  const [sidePanelWidth, setSidePanelWidth] = useState(240);
  const [rightPanelWidth, setRightPanelWidth] = useState(288);

  /** 汎用リサイズハンドラ生成 */
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
          const delta = direction === 'right'
            ? ev.clientX - startX
            : startX - ev.clientX;
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

  const handleResizeStart = makeResizeHandler(sidePanelWidth, setSidePanelWidth, 'right', 160, 480);
  const handleRightResizeStart = makeResizeHandler(rightPanelWidth, setRightPanelWidth, 'left', 200, 600);

  useEffect(() => {
    window.arisChatAPI.getActiveSession?.().then((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    const cleanupNav = window.arisChatAPI.onNavigate((page) => {
      setCurrentPage(page as Page);
    });

    const cleanupSession = window.arisChatAPI.onActiveSessionChanged?.((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    return () => {
      cleanupNav();
      cleanupSession?.();
    };
  }, []);

  useEffect(() => {
    loadExtensions(setCurrentPage)
      .then(setExtensions)
      .catch((err) => console.error('[App] 拡張のロードに失敗:', err));
  }, [settingsVersion]);

  // アクティビティアイコンをクリック → 同じなら閉じる、別なら切り替える
  const handleSelectPanel = (id: string) => {
    setActivePanelId((prev) => (prev === id ? null : id));
  };

  // サイドバーナビリンク（ブリーフケースアイコンを出すかどうかの判定用）
  const hasNavExtensions = extensions.some((ext) =>
    (ext.info.manifest.pages ?? []).some(
      (p) => p.sidebar !== false && !p.sidebarPanel && !p.rightPanel,
    ),
  );

  // 現在のページを描画
  function renderPage() {
    if (currentPage === 'chat') {
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

    if (currentPage === 'settings') {
      return (
        <Settings
          extensions={extensions}
          onBack={() => {
            setCurrentPage('chat');
            setSettingsVersion((v) => v + 1);
          }}
        />
      );
    }

    const extMatch = currentPage.match(/^ext:(.+?):(.+)$/);
    if (extMatch) {
      const [, extId, pageId] = extMatch;
      const ext = extensions.find((e) => e.info.id === extId);
      const PageComponent = ext?.pages[pageId];

      if (PageComponent) {
        return <PageComponent api={null as any} />;
      }

      return (
        <div className="flex-1 flex items-center justify-center text-aria-text-muted">
          <div className="text-center">
            <p className="text-sm">拡張ページが見つかりません</p>
            <p className="text-xs mt-1 opacity-60">{currentPage}</p>
            <button
              onClick={() => setCurrentPage('chat')}
              className="mt-3 px-3 py-1 text-xs bg-aria-primary/20 text-aria-primary rounded hover:bg-aria-primary/30 transition-colors"
            >
              チャットに戻る
            </button>
          </div>
        </div>
      );
    }

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

  return (
    <div className="h-screen flex flex-col bg-aria-bg">
      <TitleBar
        onMenuClick={() => setActivityBarVisible((v) => !v)}
        onSettingsClick={() =>
          setCurrentPage(currentPage === 'settings' ? 'chat' : 'settings')
        }
        onRightPanelClick={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
        currentPage={currentPage}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* アクティビティバー（細いアイコン列） */}
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
              setCurrentPage('chat');
            }}
            onSelectPanel={handleSelectPanel}
          />
        </div>

        {/* サイドコンテンツパネル（選択中のアクティビティのコンテンツ） */}
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
                  }}
                  onNewSession={() => {
                    setCurrentSessionId(null);
                    window.arisChatAPI.setActiveSession?.(null);
                    setCurrentPage('chat');
                  }}
                  onNavigate={(page) => setCurrentPage(page)}
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

        {/* メインコンテンツ */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {renderPage()}
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
          {/* リサイズハンドル（左端） */}
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
