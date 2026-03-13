import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import ChatWindow from './components/ChatWindow';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import WidgetOverlay from './components/WidgetOverlay';

type Page = 'chat' | 'settings';

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

  useEffect(() => {
    // メインプロセスからのナビゲーション指示
    const cleanup = window.arisChatAPI.onNavigate((page) => {
      setCurrentPage(page as Page);
    });
    return cleanup;
  }, []);

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
            onSelectSession={(id) => {
              setCurrentSessionId(id);
              setSidebarOpen(false);
            }}
            onNewSession={() => {
              setCurrentSessionId(null);
              setSidebarOpen(false);
            }}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* メインコンテンツ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentPage === 'chat' ? (
            <ChatWindow
              sessionId={currentSessionId}
              onSessionCreated={setCurrentSessionId}
              settingsVersion={settingsVersion}
            />
          ) : (
            <Settings onBack={() => { setCurrentPage('chat'); setSettingsVersion((v) => v + 1); }} />
          )}
        </div>
      </div>
    </div>
  );
}
