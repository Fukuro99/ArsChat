import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ChatMessageStats, ArisChatSettings, DEFAULT_SETTINGS, getEffectiveAvatarPath } from '../../shared/types';
import MessageBubble from './MessageBubble';

interface ChatWindowProps {
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  settingsVersion?: number;
}

function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error('画像データの読み込みに失敗しました。'));
      }
    };
    reader.onerror = () => reject(new Error('画像データの読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function getClipboardImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;

  const fromFiles = Array.from(clipboardData.files || []).find((file) => file.type.startsWith('image/'));
  if (fromFiles) return fromFiles;

  const fromItems = Array.from(clipboardData.items || []).find((item) => item.type.startsWith('image/'));
  const file = fromItems?.getAsFile();
  return file || null;
}

export default function ChatWindow({ sessionId, onSessionCreated, settingsVersion = 0 }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [screenWatchMode, setScreenWatchMode] = useState(false);
  const [thinkMode, setThinkMode] = useState(false);
  const [settings, setSettings] = useState<ArisChatSettings>(DEFAULT_SETTINGS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentSessionIdRef = useRef<string | null>(sessionId);
  // ストリーミングチャンクのバッファリング用 (RAF バッチ処理でレンダラー負荷を軽減)
  const pendingChunksRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  // 編集中のメッセージID
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // 設定読み込み（アバター反映のため）— settingsVersion が変わるたびに再取得
  useEffect(() => {
    window.arisChatAPI.getSettings().then(setSettings);
  }, [settingsVersion]);

  useEffect(() => {
    // メインプロセスからのナビゲーション時も再取得
    const cleanup = window.arisChatAPI.onNavigate((page) => {
      if (page === 'chat') {
        window.arisChatAPI.getSettings().then(setSettings);
      }
    });
    return cleanup;
  }, []);

  // セッション読み込み
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
    if (sessionId) {
      window.arisChatAPI.getSession(sessionId).then((session) => {
        if (session) {
          setMessages(session.messages);
        }
      });
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  // 自動スクロール
  // ストリーミング中は 'auto'（即時）にすることで smooth アニメーションの積み重ねによるジャンクを防ぐ
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, streamingContent, isStreaming]);

  // ストリーミングイベント登録
  useEffect(() => {
    const cleanupChunk = window.arisChatAPI.onStreamChunk((chunk) => {
      // チャンクをバッファに追加し、RAF で1フレームに1回だけ state を更新する。
      // これにより高速なトークン生成時のレンダラースレッド過負荷(マウスがくかく)を防ぐ。
      pendingChunksRef.current += chunk;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          const buffered = pendingChunksRef.current;
          pendingChunksRef.current = '';
          rafIdRef.current = null;
          if (buffered) {
            setStreamingContent((prev) => prev + buffered);
          }
        });
      }
    });

    const cleanupEnd = window.arisChatAPI.onStreamEnd((stats: ChatMessageStats) => {
      // ストリーム終了時: 残ったバッファを即座にフラッシュ
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      const remaining = pendingChunksRef.current;
      pendingChunksRef.current = '';

      setStreamingContent((prev) => {
        const full = prev + remaining;
        if (full) {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: full,
            timestamp: Date.now(),
            stats: Object.keys(stats).length > 0 ? stats : undefined,
          };
          setMessages((msgs) => {
            const newMsgs = [...msgs, assistantMsg];
            saveSession(newMsgs);
            return newMsgs;
          });
        }
        return '';
      });
      setIsStreaming(false);
    });

    const cleanupError = window.arisChatAPI.onStreamError((err) => {
      // エラー時もバッファをリセット
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingChunksRef.current = '';
      setError(err);
      setIsStreaming(false);
      setStreamingContent('');
    });

    return () => {
      cleanupChunk();
      cleanupEnd();
      cleanupError();
      // アンマウント時に残った RAF をキャンセル
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingChunksRef.current = '';
    };
  }, []);

  useEffect(() => {
    const cleanupCapture = window.arisChatAPI.onCapturedImage((imageBase64) => {
      setPendingImageBase64(imageBase64);
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    });
    return () => {
      cleanupCapture();
    };
  }, []);

  // セッション保存
  const saveSession = useCallback(async (msgs: ChatMessage[]) => {
    let sid = currentSessionIdRef.current;
    if (!sid) {
      sid = crypto.randomUUID();
      currentSessionIdRef.current = sid;
      onSessionCreated(sid);
    }

    const title = msgs[0]?.content.slice(0, 50) || '新しい会話';
    await window.arisChatAPI.createSession({
      id: sid,
      title,
      messages: msgs,
      createdAt: msgs[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
    });
  }, [onSessionCreated]);

  // ===== メッセージアクション =====

  /** コピー */
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  }, []);

  /** 削除 */
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const newMsgs = prev.filter((m) => m.id !== messageId);
      saveSession(newMsgs);
      return newMsgs;
    });
  }, [saveSession]);

  /** 再生成（このアシスタントメッセージ以降を削除して再送） */
  const handleRegenerateMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const truncated = prev.slice(0, idx); // このメッセージを除いたそれ以前
      setIsStreaming(true);
      setStreamingContent('');
      window.arisChatAPI.sendMessage(truncated, currentSessionIdRef.current || '', { thinkMode });
      return truncated;
    });
  }, [thinkMode]);

  /** 続きを生成 */
  const handleContinueMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const continueMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: '続けてください',
        timestamp: Date.now(),
      };
      const newMsgs = [...prev.slice(0, idx + 1), continueMsg];
      setIsStreaming(true);
      setStreamingContent('');
      window.arisChatAPI.sendMessage(newMsgs, currentSessionIdRef.current || '', { thinkMode });
      return newMsgs;
    });
  }, [thinkMode]);

  /** ブランチ（この時点までで新セッションを作成） */
  const handleBranchMessage = useCallback(async (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const branchedMsgs = messages.slice(0, idx + 1);
    const newSessionId = crypto.randomUUID();
    const title = branchedMsgs[0]?.content.slice(0, 50) || '分岐した会話';
    await window.arisChatAPI.createSession({
      id: newSessionId,
      title: `[分岐] ${title}`,
      messages: branchedMsgs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    onSessionCreated(newSessionId);
  }, [messages, onSessionCreated]);

  /** 編集開始 */
  const handleEditStart = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);

  /** 編集保存 */
  const handleEditSave = useCallback((messageId: string, newContent: string) => {
    setEditingMessageId(null);
    setMessages((prev) => {
      const newMsgs = prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m);
      saveSession(newMsgs);
      return newMsgs;
    });
  }, [saveSession]);

  /** 編集キャンセル */
  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  // メッセージ送信
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImageBase64) || isStreaming) return;

    setError(null);

    // 画面監視モードの場合、送信時にスクリーンキャプチャを自動添付
    let imageBase64 = pendingImageBase64 || undefined;
    if (screenWatchMode && !imageBase64) {
      try {
        imageBase64 = await window.arisChatAPI.captureScreen();
      } catch {
        // キャプチャ失敗時はテキストのみ送信
      }
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      imageBase64,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setPendingImageBase64(null);
    setIsStreaming(true);
    setStreamingContent('');

    // API送信
    window.arisChatAPI.sendMessage(newMessages, currentSessionIdRef.current || '', { thinkMode });
  }, [input, isStreaming, messages, pendingImageBase64, screenWatchMode, thinkMode]);

  const handleCaptureScreen = useCallback(async () => {
    if (isStreaming) return;
    setError(null);
    try {
      const imageBase64 = await window.arisChatAPI.captureScreen();
      setPendingImageBase64(imageBase64);
    } catch (err: any) {
      setError(err?.message || 'スクリーンキャプチャに失敗しました。');
    }
  }, [isStreaming]);

  // 範囲キャプチャ（オーバーレイ方式）
  const handleRegionCapture = useCallback(async () => {
    if (isStreaming) return;
    setError(null);
    try {
      const imageBase64 = await window.arisChatAPI.captureRegion();
      if (imageBase64) {
        setPendingImageBase64(imageBase64);
      }
    } catch (err: any) {
      setError(err?.message || '範囲キャプチャに失敗しました。');
    }
  }, [isStreaming]);

  const handleAttachImageFromFile = useCallback(async (file: Blob) => {
    try {
      const base64 = await readFileAsBase64(file);
      setPendingImageBase64(base64);
      setError(null);
    } catch (err: any) {
      setError(err?.message || '画像の貼り付けに失敗しました。');
    }
  }, []);

  const attachImageFromSystemClipboard = useCallback(async (showNotFoundError: boolean): Promise<boolean> => {
    try {
      const base64 = await window.arisChatAPI.readClipboardImage();
      if (base64) {
        setPendingImageBase64(base64);
        setError(null);
        return true;
      }
      if (showNotFoundError) {
        setError('クリップボードに画像がありません。画像をコピーしてから再度お試しください。');
      }
      return false;
    } catch (err: any) {
      setError(err?.message || 'クリップボード画像の取得に失敗しました。');
      return false;
    }
  }, []);

  const attachImageFromClipboardData = useCallback((clipboardData: DataTransfer | null): boolean => {
    const file = getClipboardImageFile(clipboardData);
    if (!file) return false;
    void handleAttachImageFromFile(file);
    return true;
  }, [handleAttachImageFromFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isStreaming) return;
    if (attachImageFromClipboardData(e.clipboardData)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    void attachImageFromSystemClipboard(false);
  }, [attachImageFromClipboardData, attachImageFromSystemClipboard, isStreaming]);

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || isStreaming) return;
      if (attachImageFromClipboardData(e.clipboardData)) {
        e.preventDefault();
        return;
      }
      void attachImageFromSystemClipboard(false);
    };

    window.addEventListener('paste', onWindowPaste);
    return () => {
      window.removeEventListener('paste', onWindowPaste);
    };
  }, [attachImageFromClipboardData, attachImageFromSystemClipboard, isStreaming]);

  // キー入力
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // テキストエリア自動リサイズ
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="max-w-3xl mx-auto px-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-aria-primary/20 flex items-center justify-center mb-4">
              <span className="text-2xl font-bold text-aria-primary">A</span>
            </div>
            <h2 className="text-lg font-semibold text-aria-text mb-2">Aris へようこそ</h2>
            <p className="text-sm text-aria-text-muted max-w-xs">
              何でも聞いてください。テキストで質問するか、画面キャプチャを添付して質問できます。
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            showThinking={thinkMode}
            isEditing={editingMessageId === msg.id}
            avatarSrc={getEffectiveAvatarPath(settings)}
            onCopy={() => handleCopyMessage(msg.content)}
            onDelete={() => handleDeleteMessage(msg.id)}
            onRegenerate={msg.role === 'assistant' ? () => handleRegenerateMessage(msg.id) : undefined}
            onContinue={msg.role === 'assistant' ? () => handleContinueMessage(msg.id) : undefined}
            onBranch={() => { void handleBranchMessage(msg.id); }}
            onEditStart={() => handleEditStart(msg.id)}
            onEditSave={(newContent) => handleEditSave(msg.id, newContent)}
            onEditCancel={handleEditCancel}
          />
        ))}

        {/* ストリーミング中の表示 */}
        {isStreaming && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            }}
            isStreaming
            showThinking={thinkMode}
            avatarSrc={getEffectiveAvatarPath(settings)}
          />
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mx-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>{/* max-w container end */}
      </div>

      {/* 入力エリア */}
      <div className="shrink-0 border-t border-aria-border bg-aria-bg-light p-3">
        <div className="max-w-3xl mx-auto">
        {/* 添付画像プレビュー */}
        {pendingImageBase64 && (
          <div className="mb-2 p-2 bg-aria-surface rounded-xl border border-aria-border">
            <div className="flex items-start justify-between gap-2">
              <img
                src={`data:image/png;base64,${pendingImageBase64}`}
                alt="キャプチャ画像"
                className="rounded-lg max-w-full max-h-36 object-contain"
              />
              <button
                onClick={() => setPendingImageBase64(null)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-aria-text-muted hover:text-red-400 transition-colors"
                title="添付を削除"
                disabled={isStreaming}
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* カード型入力コンテナ */}
        <div className="flex flex-col bg-aria-surface border border-aria-border rounded-2xl focus-within:border-aria-primary transition-colors overflow-hidden">
          {/* テキストエリア（上段・全幅） */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={screenWatchMode ? "メッセージを入力... (画面監視ON)" : "メッセージを入力..."}
            rows={3}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none"
            style={{ maxHeight: '200px' }}
            disabled={isStreaming}
          />

          {/* ツールバー（下段） */}
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {/* 左側：モードトグル・キャプチャ系 */}
            <div className="flex items-center gap-1 flex-1">
              {/* 画面監視モードトグル */}
              <button
                onClick={() => setScreenWatchMode(!screenWatchMode)}
                className={`toolbar-btn ${screenWatchMode ? 'toolbar-btn-active-blue' : ''}`}
                title={screenWatchMode ? '画面監視モード ON' : '画面監視モード OFF'}
                disabled={isStreaming}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5 14h6M8 11v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  {screenWatchMode && <circle cx="12" cy="5" r="2" fill="currentColor" />}
                </svg>
                <span>Watch</span>
              </button>

              {/* Thinkモードトグル */}
              <button
                onClick={() => setThinkMode(!thinkMode)}
                className={`toolbar-btn ${thinkMode ? 'toolbar-btn-active-amber' : ''}`}
                title={thinkMode ? 'Thinkモード ON' : 'Thinkモード OFF'}
                disabled={isStreaming}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M6 10.5c0 1.5 0.5 2.5 2 3M10 10.5c0 1.5-0.5 2.5-2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M6.5 14h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  {thinkMode && <circle cx="8" cy="6" r="1.5" fill="currentColor" />}
                </svg>
                <span>Think</span>
              </button>

              {/* 区切り */}
              <div className="w-px h-4 bg-aria-border mx-1" />

              {/* 全画面キャプチャ */}
              <button
                onClick={handleCaptureScreen}
                className="toolbar-icon-btn"
                title="全画面キャプチャを添付"
                disabled={isStreaming}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 4.2l.7-1.2h2.6L10 4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="8" cy="8.5" r="2.1" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>

              {/* 範囲キャプチャ */}
              <button
                onClick={() => { void handleRegionCapture(); }}
                className="toolbar-icon-btn"
                title="範囲キャプチャを添付"
                disabled={isStreaming}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
                  <rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor" opacity="0.25" />
                </svg>
              </button>

              {/* クリップボード画像 */}
              <button
                onClick={() => { void attachImageFromSystemClipboard(true); }}
                className="toolbar-icon-btn"
                title="クリップボード画像を添付"
                disabled={isStreaming}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="4" y="3" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 3.2V2.6c0-.6.5-1.1 1.1-1.1h1.8c.6 0 1.1.5 1.1 1.1v.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M6 7h4M6 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* 右側：送信・停止ボタン */}
            {isStreaming ? (
              <button
                onClick={() => window.arisChatAPI.abortChat()}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                title="停止"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="2"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={() => { void handleSend(); }}
                disabled={!input.trim() && !pendingImageBase64}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-aria-primary text-white hover:bg-aria-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="送信 (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8L2 2l2 6-2 6z" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        </div>{/* max-w container end */}
      </div>
    </div>
  );
}
