import React, { useMemo, useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';
import { ChatMessage } from '../../shared/types';
import ariaIconUrl from '../assets/aria-icon.png';
import { parseInteractiveUI } from './interactive-ui/parser';
import { BlockRenderer } from './interactive-ui/UIRenderer';
import { SandboxRenderer } from './interactive-ui/SandboxRenderer';
import './interactive-ui/styles.css';

/** ローカルファイルパスをカスタムスキームの URL に変換する（Windows / http:localhost 対応） */
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const p = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `arschat-file://${p}`;
}

// KaTeX 拡張を marked に登録（インライン $...$ とブロック $$...$$ 両対応）
marked.use(markedKatex({ throwOnError: false, output: 'html' }));

/**
 * 日本語環境で LLM が ¥（U+00A5）や ￥（U+FFE5 全角）を \ の代わりに出力することがある。
 * KaTeX は \ しか認識しないため、$...$ / $$...$$ ブロック内に限定して \ に正規化する。
 */
function normalizeYenToBackslash(text: string): string {
  const yen = /[¥\uFFE5]/g;
  // $$...$$ ブロック（複数行対応）を先に処理
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) =>
    `$$${math.replace(yen, '\\')}$$`
  );
  // $...$ ブロック（改行を含まないインライン数式）を処理
  result = result.replace(/\$([^\$\n]+?)\$/g, (_, math) =>
    `$${math.replace(yen, '\\')}$`
  );
  return result;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  showThinking?: boolean;
  isEditing?: boolean;
  avatarSrc?: string | null; // カスタムアバター画像パス（null/undefined = デフォルト）
  iconSize?: number;         // アイコンサイズ（px、デフォルト 32）
  onCopy?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onBranch?: () => void;
  onEditStart?: () => void;
  onEditSave?: (newContent: string) => void;
  onEditCancel?: () => void;
  onInteractiveUIAction?: (uiId: string, action: string, data: Record<string, any>) => void;
  onLiveUIAction?: (uiId: string, action: string, data: Record<string, any>, currentState: Record<string, any>) => void;
  /** ライブUI状態マップ（uiId → state） */
  liveUIStates?: Map<string, Record<string, any>>;
  /** true のとき、ライブUIブロックをチャット内に表示しない（固定ゾーンで表示するため） */
  hideLiveUIBlocks?: boolean;
  /** true のとき、インタラクティブUIブロック（default/live両方）をAI側バブルに表示しない */
  hideInteractiveUIBlocks?: boolean;
  /** サンドボックスHTML iframeの登録コールバック */
  onSandboxIframeReady?: (uiId: string, iframe: HTMLIFrameElement | null) => void;
}

/**
 * ユーザーメッセージのテキスト表示
 * displayContent がある場合はそちらを使い、先頭の /trigger をバッジとして強調する
 */
function UserMessageContent({ message }: { message: ChatMessage }) {
  const display = message.displayContent ?? message.content;
  // 先頭の /trigger（空白なし英数字）を検出
  const match = display.match(/^(\/\S+)([\s\S]*)$/);
  if (match) {
    const trigger = match[1];
    const rest = match[2].trimStart();
    return (
      <p className="whitespace-pre-wrap">
        <span
          className="inline-flex items-center gap-0.5 px-2.5 py-0.5 mr-2 rounded-full text-xs font-mono font-bold align-middle"
          style={{
            background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            color: '#fff',
            boxShadow: '0 0 8px rgba(6,182,212,0.55)',
            letterSpacing: '0.02em',
          }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.85 }}>
            <path d="M2 8L8 2M5 2h3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {trigger}
        </span>
        {rest}
      </p>
    );
  }
  return <p className="whitespace-pre-wrap">{display}</p>;
}

/** <think>...</think> ブロックを分離する（ストリーミング途中・タグ欠け対応） */
function parseThinkBlocks(content: string): {
  thinking: string;
  response: string;
  isThinkingInProgress: boolean;
} {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const thinkParts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = thinkRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text) thinkParts.push(text);
  }
  let afterClosed = content.replace(thinkRegex, '');

  const orphanClose = afterClosed.indexOf('</think>');
  if (orphanClose !== -1) {
    const orphanText = afterClosed.slice(0, orphanClose).trim();
    if (orphanText) thinkParts.push(orphanText);
    afterClosed = afterClosed.slice(orphanClose + 8);
  }

  const openIdx = afterClosed.lastIndexOf('<think>');
  let response = afterClosed;
  if (openIdx !== -1) {
    response = afterClosed.slice(0, openIdx);
  }
  response = response.trim();

  return {
    thinking: thinkParts.join('\n\n'),
    response,
    isThinkingInProgress: openIdx !== -1,
  };
}

/** アクションボタン */
function ActionBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}

export default function MessageBubble({
  message,
  isStreaming = false,
  showThinking = false,
  isEditing = false,
  avatarSrc,
  onCopy,
  onDelete,
  onRegenerate,
  onContinue,
  onBranch,
  onEditStart,
  onEditSave,
  onEditCancel,
  onInteractiveUIAction,
  onLiveUIAction,
  liveUIStates,
  hideLiveUIBlocks = false,
  hideInteractiveUIBlocks = false,
  onSandboxIframeReady,
  iconSize = 32,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [thinkOpen, setThinkOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // 編集モードに入ったときにフォーカス
  useEffect(() => {
    if (isEditing) {
      setEditText(message.content);
      setTimeout(() => {
        editRef.current?.focus();
        editRef.current?.select();
      }, 0);
    }
  }, [isEditing, message.content]);

  // thinkブロック分離 & マークダウン変換 & Interactive UIパース
  const { thinkingHtml, parsedContent, hasThinking, isThinkingInProgress } = useMemo(() => {
    if (isUser || !message.content) {
      return {
        thinkingHtml: '',
        parsedContent: null,
        hasThinking: false,
        isThinkingInProgress: false,
      };
    }

    const { thinking, response, isThinkingInProgress } = parseThinkBlocks(message.content);

    // 円記号（¥）をバックスラッシュ（\）に正規化してから KaTeX に渡す
    const normalizedThinking = normalizeYenToBackslash(thinking);

    let tHtml = '';
    try {
      if (normalizedThinking) tHtml = marked.parse(normalizedThinking, { breaks: true, gfm: true }) as string;
    } catch {
      tHtml = '';
    }

    // Interactive UIブロックをパース
    const uiParsed = parseInteractiveUI(response || '');

    // 各テキストパートをMarkdownに変換
    const textHtmlParts = uiParsed.textParts.map((part) => {
      if (part === null) return null;
      try {
        const normalized = normalizeYenToBackslash(part);
        return marked.parse(normalized, { breaks: true, gfm: true }) as string;
      } catch {
        return part;
      }
    });

    return {
      thinkingHtml: tHtml,
      parsedContent: { ...uiParsed, textHtmlParts },
      hasThinking: !!thinking,
      isThinkingInProgress,
    };
  }, [message.content, isUser]);

  // 時刻フォーマット
  const timeStr = new Date(message.timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = () => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const stats = message.stats;

  return (
    <div
      className={`flex gap-2.5 animate-fade-in group ${isUser ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* アバター */}
      {isUser ? (
        <div
          className="shrink-0 rounded-full flex items-center justify-center font-bold bg-emerald-500/20 text-emerald-400"
          style={{ width: iconSize, height: iconSize, fontSize: Math.max(10, iconSize * 0.375) }}
        >
          U
        </div>
      ) : (
        <div
          className="shrink-0 rounded-full overflow-hidden bg-aria-primary/10 flex items-center justify-center"
          style={{ width: iconSize, height: iconSize }}
        >
          <img
            src={avatarSrc ? toFileUrl(avatarSrc) : ariaIconUrl}
            alt="ArsChat"
            className="w-full h-full object-contain"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = ariaIconUrl; }}
          />
        </div>
      )}

      {/* メッセージ本体 */}
      <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* バブル */}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed w-full ${
          isUser
            ? 'bg-aria-primary/15 text-aria-text rounded-br-md'
            : 'bg-aria-surface text-aria-text rounded-bl-md'
        }`}>
          {/* 編集モード */}
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSave?.(editText); }
                  if (e.key === 'Escape') onEditCancel?.();
                }}
                className="w-full bg-aria-bg-light border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text resize-none focus:outline-none focus:border-aria-primary min-h-[80px]"
                style={{ maxHeight: '300px' }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={onEditCancel}
                  className="px-3 py-1 text-xs rounded-lg border border-aria-border text-aria-text-muted hover:text-aria-text transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => onEditSave?.(editText)}
                  className="px-3 py-1 text-xs rounded-lg bg-aria-primary text-white hover:bg-aria-primary/80 transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          ) : isUser ? (
            <UserMessageContent message={message} />
          ) : (
            <>
              {/* 思考中（ストリーミング中・未完結） */}
              {showThinking && isThinkingInProgress && (
                <div className="think-block mb-2">
                  <div className="think-block-toggle" style={{ cursor: 'default' }}>
                    <span className="think-block-spinner" />
                    <span className="think-block-label">思考中…</span>
                  </div>
                </div>
              )}

              {/* 思考ブロック（完結済み・折りたたみ） */}
              {showThinking && hasThinking && (
                <div className="think-block mb-2">
                  <button
                    onClick={() => setThinkOpen(!thinkOpen)}
                    className="think-block-toggle"
                  >
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      className={`think-block-chevron ${thinkOpen ? 'open' : ''}`}
                    >
                      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="think-block-label">
                      {thinkOpen ? '思考プロセス' : '思考プロセスを表示'}
                    </span>
                  </button>
                  {thinkOpen && (
                    <div
                      className="think-block-content markdown-body"
                      dangerouslySetInnerHTML={{ __html: thinkingHtml }}
                    />
                  )}
                </div>
              )}

              {/* メインレスポンス（Markdown + Interactive UI混在） */}
              {parsedContent ? (
                <div className={isStreaming ? 'streaming-cursor' : ''}>
                  {parsedContent.textParts.map((part, i) => {
                    if (part === null) {
                      // プリミティブUIブロック（hideInteractiveUIBlocks=trueの場合は非表示）
                      const block = parsedContent.blocks.find((b) => b._index === i);
                      if (block) {
                        if (hideInteractiveUIBlocks) return null;
                        if (hideLiveUIBlocks && block.mode === 'live') return null;
                        return (
                          <BlockRenderer
                            key={block.id}
                            block={block}
                            onSubmit={(uiId, action, data) => {
                              onInteractiveUIAction?.(uiId, action, data);
                            }}
                            onAction={(uiId, actionId, data) => {
                              if (block.mode === 'live') {
                                const currentState = liveUIStates?.get(block.id) ?? block.state ?? {};
                                onLiveUIAction?.(uiId, actionId, data || {}, currentState);
                              } else {
                                onInteractiveUIAction?.(uiId, actionId, data || {});
                              }
                            }}
                            onLiveAction={block.mode === 'live' ? onLiveUIAction : undefined}
                            liveState={block.mode === 'live' ? liveUIStates?.get(block.id) : undefined}
                          />
                        );
                      }

                      // サンドボックスHTMLブロック（hideInteractiveUIBlocks=trueの場合は非表示）
                      const sandboxBlock = parsedContent.sandboxBlocks.find((b) => b._index === i);
                      if (sandboxBlock) {
                        if (hideInteractiveUIBlocks) return null;
                        if (hideLiveUIBlocks && sandboxBlock.mode === 'live') return null;
                        const sbState = liveUIStates?.get(sandboxBlock.id);
                        const isFinished = sbState?.status === 'finished';
                        return (
                          <SandboxRenderer
                            key={sandboxBlock.id}
                            block={sandboxBlock}
                            onAction={(uiId, action, data) => {
                              if (sandboxBlock.mode === 'live') {
                                const currentState = liveUIStates?.get(sandboxBlock.id) ?? {};
                                onLiveUIAction?.(uiId, action, data, currentState);
                              } else {
                                onInteractiveUIAction?.(uiId, action, data);
                              }
                            }}
                            onIframeReady={onSandboxIframeReady}
                            isFinished={isFinished}
                          />
                        );
                      }

                      // <iframe>タグブロック（AI側に常時表示）
                      const iframeBlock = parsedContent.iframeBlocks.find((b) => b._index === i);
                      if (iframeBlock) {
                        return (
                          <SandboxRenderer
                            key={iframeBlock.id}
                            block={{
                              id: iframeBlock.id,
                              mode: 'default',
                              title: iframeBlock.title,
                              width: iframeBlock.width,
                              height: iframeBlock.height || '400px',
                              html: iframeBlock.html,
                            }}
                          />
                        );
                      }

                      return null;
                    }
                    const html = parsedContent.textHtmlParts[i];
                    if (!html && !part) return null;
                    return (
                      <div
                        key={i}
                        className="markdown-body"
                        dangerouslySetInnerHTML={{ __html: html || part }}
                      />
                    );
                  })}
                  {/* 未閉じUIブロック（ストリーミング中） */}
                  {parsedContent.isLoading && (
                    <div className="iui-block iui-block-loading">
                      <div className="iui-spinner" />
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}

          {/* ストリーミング中でコンテンツが空の場合 */}
          {isStreaming && !message.content && (
            <div className="flex items-center gap-1.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-aria-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-aria-primary animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-aria-primary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}

          {/* 添付画像 */}
          {message.imageBase64 && (
            <img
              src={`data:image/png;base64,${message.imageBase64}`}
              alt="添付画像"
              className="mt-2 rounded-lg max-w-full max-h-48 object-contain"
            />
          )}
        </div>

        {/* 統計バー（アシスタントメッセージ・ストリーミング後のみ） */}
        {!isUser && !isStreaming && stats && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 px-1 text-[10px] text-aria-text-muted select-none">
            {stats.tokensPerSec !== undefined && (
              <span className="flex items-center gap-1">
                {/* cycle icon */}
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="opacity-60">
                  <path d="M13.5 2.5A6.5 6.5 0 1 0 14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M14.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {stats.tokensPerSec.toFixed(2)} トークン/秒
              </span>
            )}
            {stats.totalTokens !== undefined && (
              <span className="flex items-center gap-1">
                {/* bar chart icon */}
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="opacity-60">
                  <rect x="1" y="7" width="3" height="8" rx="0.5" fill="currentColor"/>
                  <rect x="6" y="4" width="3" height="11" rx="0.5" fill="currentColor"/>
                  <rect x="11" y="1" width="3" height="14" rx="0.5" fill="currentColor"/>
                </svg>
                {stats.totalTokens} トークン
              </span>
            )}
            {stats.timeSeconds !== undefined && (
              <span className="flex items-center gap-1">
                {/* clock icon */}
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="opacity-60">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                {stats.timeSeconds}s
              </span>
            )}
            {stats.finishReason && (
              <span className="opacity-70">停止理由: {stats.finishReason}</span>
            )}
          </div>
        )}

        {/* タイムスタンプ + アクションボタン */}
        <div className={`flex items-center gap-1 mt-0.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-aria-text-muted">{timeStr}</span>

          {/* アクションボタン（ホバー時に表示） */}
          {!isEditing && !isStreaming && (
            <div className={`flex items-center gap-0.5 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
              {/* コピー */}
              {onCopy && (
                <ActionBtn title="コピー" onClick={handleCopy}>
                  {copied ? (
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l3.5 3.5L13 4" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <rect x="5" y="4" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M5 3.5V3A1.5 1.5 0 0 0 3.5 1.5h0A1.5 1.5 0 0 0 2 3v8A1.5 1.5 0 0 0 3.5 12.5H5" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  )}
                </ActionBtn>
              )}
              {/* 編集 */}
              {onEditStart && (
                <ActionBtn title="編集" onClick={() => onEditStart()}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </ActionBtn>
              )}
              {/* 再生成（アシスタントのみ） */}
              {onRegenerate && (
                <ActionBtn title="再生成" onClick={onRegenerate}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M13 2.5A6 6 0 1 0 14 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M14 2.5v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </ActionBtn>
              )}
              {/* 続きを生成（アシスタントのみ） */}
              {onContinue && (
                <ActionBtn title="続きを生成" onClick={onContinue}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </ActionBtn>
              )}
              {/* ブランチ */}
              {onBranch && (
                <ActionBtn title="ここから分岐" onClick={onBranch}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="4" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="12" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M4 4.5v7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M4 7.5Q4 8 6 8h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </ActionBtn>
              )}
              {/* 削除 */}
              {onDelete && (
                <ActionBtn title="削除" onClick={onDelete}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4.5h10M6 4.5V3h4v1.5M5.5 4.5l.5 8h4l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </ActionBtn>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
