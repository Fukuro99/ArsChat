import React, { useEffect, useRef, useMemo } from 'react';
import { SandboxHTMLBlock } from './types';

interface SandboxRendererProps {
  block: SandboxHTMLBlock;
  onAction?: (uiId: string, action: string, data: Record<string, any>) => void;
  /** iframeのDOMエレメントを親に通知するコールバック（ライブモードでのpatch転送に使用） */
  onIframeReady?: (uiId: string, iframe: HTMLIFrameElement | null) => void;
  isFinished?: boolean;
}

export function SandboxRenderer({ block, onAction, onIframeReady, isFinished = false }: SandboxRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // HTMLをBlob URLに変換（ネットワークアクセスなし）
  const blobUrl = useMemo(() => {
    const blob = new Blob([block.html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [block.html]);

  // Blob URLのクリーンアップ
  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  // iframeのDOMエレメントを親に通知（ライブモードでpatch転送のために必要）
  useEffect(() => {
    onIframeReady?.(block.id, iframeRef.current);
    return () => onIframeReady?.(block.id, null);
  }, [block.id, onIframeReady]);

  // iframeからのpostMessageを受信してアクションコールバックに転送
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type !== 'interactive-ui-action') return;
      if (e.data.uiId !== block.id) return;
      if (isFinished) return;
      onAction?.(block.id, String(e.data.action || ''), e.data.data || {});
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [block.id, onAction, isFinished]);

  const isLive = block.mode === 'live';

  return (
    <div className={`iui-block${isLive ? ' iui-block-live' : ''}${isFinished ? ' iui-block-finished' : ''}`}>
      {block.title && (
        <div className="iui-block-title">
          {block.title}
          {isLive && (
            <span className={`iui-live-badge${isFinished ? ' iui-live-badge-finished' : ''}`}>
              {isFinished ? '終了' : 'LIVE'}
            </span>
          )}
        </div>
      )}

      <div className={`iui-sandbox-wrapper${isFinished ? ' iui-block-content-disabled' : ''}`}>
        <iframe
          ref={iframeRef}
          src={blobUrl}
          sandbox="allow-scripts"
          style={{
            width: block.width || '100%',
            height: block.height || '400px',
            border: 'none',
            borderRadius: '0',
            background: '#fff',
            display: 'block',
            pointerEvents: isFinished ? 'none' : 'auto',
          }}
          title={block.title || `sandbox-${block.id}`}
        />
      </div>

      {isFinished && (
        <div className="iui-block-submitted">
          <span>ゲーム終了</span>
        </div>
      )}
    </div>
  );
}
