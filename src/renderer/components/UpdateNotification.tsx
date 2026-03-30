import React, { useEffect, useState } from 'react';

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';

interface UpdaterInfo {
  status: UpdaterStatus;
  version?: string;
  progress?: number;
  error?: string;
}

/**
 * 画面右下に表示されるアップデート通知バナー。
 * available / downloading / ready / error のときのみ表示される。
 */
export default function UpdateNotification() {
  const [info, setInfo] = useState<UpdaterInfo>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 現在のステータスを取得
    window.arsChatAPI.updater
      .getStatus()
      .then(setInfo)
      .catch(() => {});

    // ステータス変化をリッスン
    const unsub = window.arsChatAPI.updater.onStatus((newInfo: UpdaterInfo) => {
      setInfo(newInfo);
      // 新しいイベントが来たら dismissed をリセット（再表示）
      if (newInfo.status !== 'idle' && newInfo.status !== 'not-available') {
        setDismissed(false);
      }
    });
    return unsub;
  }, []);

  // 表示不要なケース
  const hidden = dismissed || info.status === 'idle' || info.status === 'checking' || info.status === 'not-available';

  if (hidden) return null;

  const handleDownload = () => {
    window.arsChatAPI.updater.download().catch(() => {});
  };

  const handleInstall = () => {
    window.arsChatAPI.updater.install().catch(() => {});
  };

  const handleDismiss = () => setDismissed(true);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-white/10 bg-aria-surface shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 bg-aria-primary/10 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-aria-primary">
            <path
              d="M8 2v8M5 7l3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-semibold text-aria-primary">アップデート</span>
        </div>
        <button
          onClick={handleDismiss}
          className="w-5 h-5 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text hover:bg-white/10 transition-colors"
          aria-label="閉じる"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* ボディ */}
      <div className="px-3 py-2.5 space-y-2">
        {/* available */}
        {info.status === 'available' && (
          <>
            <p className="text-xs text-aria-text">
              新しいバージョン <span className="font-semibold text-aria-primary">{info.version}</span> が利用可能です
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                className="flex-1 py-1.5 rounded-lg bg-aria-primary text-white text-xs font-medium hover:bg-aria-primary/80 transition-colors"
              >
                ダウンロード
              </button>
              <button
                onClick={handleDismiss}
                className="flex-1 py-1.5 rounded-lg bg-white/5 text-aria-text-muted text-xs hover:bg-white/10 transition-colors"
              >
                後で
              </button>
            </div>
          </>
        )}

        {/* downloading */}
        {info.status === 'downloading' && (
          <>
            <p className="text-xs text-aria-text-muted">ダウンロード中... {info.progress ?? 0}%</p>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-aria-primary transition-all duration-300"
                style={{ width: `${info.progress ?? 0}%` }}
              />
            </div>
          </>
        )}

        {/* ready */}
        {info.status === 'ready' && (
          <>
            <p className="text-xs text-aria-text">
              v<span className="font-semibold">{info.version}</span> の準備ができました
            </p>
            <p className="text-[11px] text-aria-text-muted">再起動するとインストールされます</p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 py-1.5 rounded-lg bg-aria-primary text-white text-xs font-medium hover:bg-aria-primary/80 transition-colors"
              >
                今すぐ再起動
              </button>
              <button
                onClick={handleDismiss}
                className="flex-1 py-1.5 rounded-lg bg-white/5 text-aria-text-muted text-xs hover:bg-white/10 transition-colors"
              >
                後で
              </button>
            </div>
          </>
        )}

        {/* error */}
        {info.status === 'error' && (
          <>
            <p className="text-xs text-red-400">アップデートに失敗しました</p>
            {info.error && (
              <p className="text-[11px] text-aria-text-muted truncate" title={info.error}>
                {info.error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
