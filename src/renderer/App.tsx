import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import ChatWindow from './components/ChatWindow';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import WidgetOverlay from './components/WidgetOverlay';
import { loadExtensions, type LoadedExtension } from './extension-loader';

type Page = 'chat' | 'settings' | string; // string で ext:{id}:{pageId} を受け入れ

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');

  if (mode === 'widget') {
    return <WidgetOverlay />;
  }

  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);

  useEffect(() => {
    // 起動時にアクティブセッションを取得
    window.arisChatAPI.getActiveSession?.().then((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    // メインプロセスからのナビゲーション指示
    const cleanupNav = window.arisChatAPI.onNavigate((page) => {
      setCurrentPage(page as Page);
    });

    // ウィジェットからのセッション切り替え通知
    const cleanupSession = window.arisChatAPI.onActiveSessionChanged?.((sessionId) => {
      if (sessionId) setCurrentSessionId(sessionId);
    });

    return () => {
      cleanupNav();
      cleanupSession?.();
    };
  }, []);

  // 拡張機能のロード（起動時 & 設定変更後）
  useEffect(() => {
    loadExtensions(setCurrentPage)
      .then(setExtensions)
      .catch((err) => console.error('[App] 拡張のロードに失敗:', err));
  }, [settingsVersion]);

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

    // 拡張ページ: "ext:{extId}:{pageId}"
    const extMatch = currentPage.match(/^ext:(.+?):(.+)$/);
    if (extMatch) {
      const [, extId, pageId] = extMatch;
      const ext = extensions.find((e) => e.info.id === extId);
      const PageComponent = ext?.pages[pageId];

      if (PageComponent) {
        // api は extension-loader 側で bind 済み（null を渡しても上書きされない）
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

    // フォールバック
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
      {/* カスタムタイトルバー */}
      <TitleBar
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        onSettingsClick={() => setCurrentPage(currentPage === 'settings' ? 'chat' : 'settings')}
        currentPage={currentPage}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* サイドバー */}
        {sidebarOpen && (
          <Sidebar
            currentSessionId={currentSessionId}
            currentPage={currentPage}
            extensions={extensions}
            onSelectSession={(id) => {
              setCurrentSessionId(id);
              window.arisChatAPI.setActiveSession?.(id);
              setSidebarOpen(false);
            }}
            onNewSession={() => {
              setCurrentSessionId(null);
              window.arisChatAPI.setActiveSession?.(null);
              setSidebarOpen(false);
            }}
            onNavigate={(page) => {
              setCurrentPage(page);
              setSidebarOpen(false);
            }}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* メインコンテンツ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
