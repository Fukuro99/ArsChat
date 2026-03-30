import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChatMessage, getEffectiveAvatarPath } from '../../shared/types';
import ariaIconUrl from '../assets/aria-icon.png';

/** ローカルファイルパスをカスタムスキームの URL に変換 */
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const p = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `arschat-file://${p}`;
}

/** <think>...</think> タグをすべて除去してレスポンスのみを返す */
function stripThinkBlocks(content: string): string {
  // 完結した <think>...</think> を除去
  let result = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // 孤立した </think>（開きタグなし）があればそれ以前も除去
  const orphan = result.indexOf('</think>');
  if (orphan !== -1) result = result.slice(orphan + 8);
  // 未完結の <think>（ストリーミング中）があればそれ以降を除去
  const open = result.lastIndexOf('<think>');
  if (open !== -1) result = result.slice(0, open);
  return result.trim();
}

export default function WidgetOverlay() {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [screenWatchMode, setScreenWatchMode] = useState(false);
  const [thinkMode, setThinkMode] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const widgetSessionIdRef = useRef<string | null>(null);
  // RAF バッファリング（マウスカクつき防止）
  const pendingChunksRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);

  // ウィジェットモードでは body の背景色を透明にする
  useEffect(() => {
    document.body.className = 'bg-transparent overflow-hidden';
  }, []);

  // ペルソナのアバター画像を読み込む（マウント時に一度取得）
  useEffect(() => {
    window.arsChatAPI.getSettings().then((settings) => {
      const p = getEffectiveAvatarPath(settings);
      setAvatarSrc(p ?? null);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, streamingContent, isStreaming]);

  // セッション保存（ウィジェットで話した内容をメイン履歴に保存する）
  const saveWidgetSession = useCallback(async (msgs: ChatMessage[]) => {
    if (!widgetSessionIdRef.current) {
      widgetSessionIdRef.current = crypto.randomUUID();
    }
    const title = msgs[0]?.content.slice(0, 50) || 'ウィジェットチャット';
    await window.arsChatAPI.createSession({
      id: widgetSessionIdRef.current,
      title,
      messages: msgs,
      createdAt: msgs[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
    });
    // アクティブセッションをメインプロセスに通知
    window.arsChatAPI.setActiveSession?.(widgetSessionIdRef.current);
  }, []);

  // 起動時・セッション切り替え時にアクティブセッションを読み込む
  useEffect(() => {
    window.arsChatAPI.getActiveSession?.().then((sessionId) => {
      if (sessionId && sessionId !== widgetSessionIdRef.current) {
        widgetSessionIdRef.current = sessionId;
        window.arsChatAPI.getSession(sessionId).then((session) => {
          if (session) setMessages(session.messages);
        });
      }
    });

    const cleanupChanged = window.arsChatAPI.onActiveSessionChanged?.((sessionId) => {
      if (sessionId && sessionId !== widgetSessionIdRef.current) {
        widgetSessionIdRef.current = sessionId;
        window.arsChatAPI.getSession(sessionId).then((session) => {
          if (session) setMessages(session.messages);
        });
      }
    });

    // 同じセッションにメッセージが追加されたときも再読み込み
    const cleanupUpdated = window.arsChatAPI.onSessionUpdated?.((updatedId) => {
      if (updatedId === widgetSessionIdRef.current) {
        window.arsChatAPI.getSession(updatedId).then((session) => {
          if (session) setMessages(session.messages);
        });
      }
    });

    return () => {
      cleanupChanged?.();
      cleanupUpdated?.();
    };
  }, []);

  useEffect(() => {
    const cleanupChunk = window.arsChatAPI.onStreamChunk((chunk) => {
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
    const cleanupEnd = window.arsChatAPI.onStreamEnd(() => {
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
          };
          setMessages((msgs) => {
            const newMsgs = [...msgs, assistantMsg];
            saveWidgetSession(newMsgs);
            return newMsgs;
          });
        }
        return '';
      });
      setIsStreaming(false);
    });
    const cleanupError = window.arsChatAPI.onStreamError(() => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingChunksRef.current = '';
      setIsStreaming(false);
      setStreamingContent('');
    });
    return () => {
      cleanupChunk();
      cleanupEnd();
      cleanupError();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingChunksRef.current = '';
    };
  }, [saveWidgetSession]);

  // ドラッグ / クリック判定（移動があればドラッグ、なければクリック）
  const dragActive = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    window.arsChatAPI.expandWidget();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleIconMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // 左クリックのみ
      e.preventDefault();
      dragActive.current = false;

      const onMove = (ev: MouseEvent) => {
        if (ev.movementX !== 0 || ev.movementY !== 0) {
          dragActive.current = true;
          setIsDragging(true);
          window.arsChatAPI.moveWidget(ev.movementX, ev.movementY);
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const wasDragging = dragActive.current;
        dragActive.current = false;
        setIsDragging(false);
        // 移動していなければクリック判定 → チャットを開く
        if (!wasDragging) {
          handleExpand();
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [handleExpand],
  );

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    window.arsChatAPI.collapseWidget();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    let imageBase64: string | undefined;
    if (screenWatchMode) {
      try {
        imageBase64 = await window.arsChatAPI.captureScreen();
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
    setIsStreaming(true);
    setStreamingContent('');

    // セッションIDを渡す（既存セッションがなければ後で新規発行）
    window.arsChatAPI.sendMessage(newMessages, widgetSessionIdRef.current || '', { thinkMode });
  }, [input, isStreaming, messages, screenWatchMode, thinkMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!expanded) {
    return (
      <div className="h-screen w-screen bg-transparent widget-drag">
        <button
          onMouseDown={handleIconMouseDown}
          className={`widget-no-drag w-full h-full bg-transparent border-none p-0 select-none transition-all
            ${isDragging ? 'scale-95 cursor-grabbing opacity-80' : 'hover:scale-105 cursor-pointer'}`}
          title="クリック: チャットを開く　ドラッグ: 移動"
          draggable={false}
        >
          <img
            src={avatarSrc ? toFileUrl(avatarSrc) : ariaIconUrl}
            alt="ArsChat"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = ariaIconUrl;
            }}
          />
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1b2e] rounded-xl overflow-hidden border border-white/10 shadow-2xl">
      {/* ヘッダー */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-[#1e1f33] border-b border-white/10 widget-drag">
        <span className="text-xs font-semibold text-white/80 widget-drag">ArsChat</span>
        <div className="flex items-center gap-1 widget-no-drag">
          <button
            onClick={() => {
              window.arsChatAPI.openChatWindow();
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="フルウィンドウで開く"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 4V2h4M6 10H2V6M10 8v2H6M6 2h4v4"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            onClick={handleCollapse}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="閉じる"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* メッセージ */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-white/30">メッセージを入力してください</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs leading-relaxed ${
                msg.role === 'user' ? 'bg-aria-primary/80 text-white' : 'bg-white/10 text-white/90'
              }`}
            >
              {msg.imageBase64 && (
                <div className="mb-1">
                  <img
                    src={`data:image/png;base64,${msg.imageBase64}`}
                    alt=""
                    className="rounded max-h-16 object-contain"
                  />
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">
                {msg.role === 'assistant' ? stripThinkBlocks(msg.content) : msg.content}
              </p>
            </div>
          </div>
        ))}
        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-2.5 py-1.5 rounded-lg text-xs leading-relaxed bg-white/10 text-white/90">
              <p className="whitespace-pre-wrap break-words">{stripThinkBlocks(streamingContent)}</p>
            </div>
          </div>
        )}
        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="px-2.5 py-1.5 rounded-lg bg-white/10">
              <div className="flex gap-1">
                <span
                  className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <div className="shrink-0 border-t border-white/10 p-2">
        <div className="flex items-end gap-1.5">
          {/* 画面監視モードトグル */}
          <button
            onClick={() => setScreenWatchMode(!screenWatchMode)}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              screenWatchMode ? 'bg-aria-primary/30 text-aria-primary' : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
            title={screenWatchMode ? '画面監視モード ON' : '画面監視モード OFF'}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M5 14h6M8 11v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              {screenWatchMode && <circle cx="12" cy="5" r="2" fill="#6366f1" stroke="#1a1b2e" strokeWidth="1" />}
            </svg>
          </button>
          {/* Thinkモードトグル */}
          <button
            onClick={() => setThinkMode(!thinkMode)}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
              thinkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/40 hover:text-white/60'
            }`}
            title={thinkMode ? 'Thinkモード ON' : 'Thinkモード OFF'}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M6 10.5c0 1.5 0.5 2.5 2 3M10 10.5c0 1.5-0.5 2.5-2 3"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path d="M6.5 14h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              {thinkMode && <circle cx="8" cy="6" r="1.5" fill="currentColor" />}
            </svg>
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージ..."
            rows={1}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-aria-primary/50"
            style={{ maxHeight: '80px' }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={() => window.arsChatAPI.abortChat()}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              title="停止"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="1" y="1" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => {
                void handleSend();
              }}
              disabled={!input.trim()}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-aria-primary text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-aria-primary/80 transition-colors"
              title="送信"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l2 6-2 6z" fill="currentColor" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
