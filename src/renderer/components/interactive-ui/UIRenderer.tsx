import React, { useState, useCallback, useEffect } from 'react';
import { UINode, InteractiveUIBlock, UIAction } from './types';
import { primitiveRegistry } from './primitives/index';
import { mergePatch } from './state-manager';

// ===== キーパス解決ユーティリティ =====

/** ドット区切りキーパスでオブジェクトの値を取得する */
function resolveKeyPath(obj: Record<string, any>, keyPath: string): any {
  const keys = keyPath.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/** ドット区切りキーパスでオブジェクトの値を更新する（イミュータブル） */
function updateKeyPath(obj: Record<string, any>, keyPath: string, value: any): Record<string, any> {
  const keys = keyPath.split('.');
  const result = { ...obj };
  let current: Record<string, any> = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    current[key] = { ...(current[key] || {}) };
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
  return result;
}

// ===== 未知のプリミティブのフォールバック =====

function UnknownPrimitive({ name }: { name: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        fontSize: '0.75rem',
        color: '#f59e0b',
        border: '1px dashed #f59e0b',
        borderRadius: '4px',
        fontFamily: 'monospace',
      }}
    >
      [unknown: {name}]
    </span>
  );
}

// ===== UIRenderer =====

interface UIRendererProps {
  node: UINode;
  state: Record<string, any>;
  onAction: (nodeId: string | undefined, actionId: string, data?: any) => void;
  onStateChange: (keyPath: string, value: any) => void;
}

export function UIRenderer({ node, state, onAction, onStateChange }: UIRendererProps) {
  // showIf 条件分岐
  if (node.showIf) {
    const conditionValue = resolveKeyPath(state, node.showIf);
    if (!conditionValue) return null;
  }

  // プリミティブ → Reactコンポーネントの解決
  const Component = primitiveRegistry[node.primitive];
  if (!Component) {
    return <UnknownPrimitive name={node.primitive} />;
  }

  // stateバインディングの解決
  const boundValue = node.bind ? resolveKeyPath(state, node.bind) : undefined;

  const handleChange = useCallback(
    (v: any) => {
      if (node.bind) {
        onStateChange(node.bind, v);
      }
    },
    [node.bind, onStateChange]
  );

  const handleAction = useCallback(
    (actionId: string, data?: any) => {
      onAction(node.id, actionId, data);
    },
    [node.id, onAction]
  );

  // 子コンポーネントを再帰的にレンダリング
  const renderedChildren = node.children?.map((child, i) => (
    <UIRenderer
      key={child.id || i}
      node={child}
      state={state}
      onAction={onAction}
      onStateChange={onStateChange}
    />
  ));

  return (
    <Component
      props={node.props || {}}
      value={boundValue}
      onChange={handleChange}
      onAction={handleAction}
      state={state}
    >
      {renderedChildren}
    </Component>
  );
}

// ===== BlockRenderer =====

interface BlockRendererProps {
  block: InteractiveUIBlock;
  onSubmit: (uiId: string, action: string, data: Record<string, any>) => void;
  onAction?: (uiId: string, actionId: string, data?: any) => void;
  /** ライブUIアクションハンドラ（mode: "live" のブロック用） */
  onLiveAction?: (uiId: string, action: string, data: Record<string, any>, currentState: Record<string, any>) => void;
  /** 外部から注入されるライブUI状態（mode: "live" のブロック用） */
  liveState?: Record<string, any>;
  isLoading?: boolean;
}

export function BlockRenderer({ block, onSubmit, onAction, onLiveAction, liveState, isLoading }: BlockRendererProps) {
  const isLive = block.mode === 'live';

  // ライブモードの場合は外部stateを使い、デフォルトモードはローカルstate
  const [localState, setLocalState] = useState<Record<string, any>>(block.state || {});
  const [submitted, setSubmitted] = useState(false);

  // 外部からliveStateが更新されたらローカルに反映する
  useEffect(() => {
    if (isLive && liveState !== undefined) {
      setLocalState(liveState);
    }
  }, [isLive, liveState]);

  const currentState = isLive && liveState !== undefined ? liveState : localState;
  const isFinished = isLive && currentState.status === 'finished';

  const handleStateChange = useCallback((keyPath: string, value: any) => {
    if (!isLive) {
      setLocalState((prev) => updateKeyPath(prev, keyPath, value));
    }
  }, [isLive]);

  const handleAction = useCallback(
    (nodeId: string | undefined, actionId: string, data?: any) => {
      if (isFinished) return; // finishedなら操作不可

      if (isLive && onLiveAction) {
        // ライブモード: onLiveActionを呼ぶ
        onLiveAction(block.id, actionId, { ...data, nodeId }, currentState);
      } else if (onAction) {
        onAction(block.id, actionId, { ...data, nodeId });
      }
    },
    [block.id, onAction, onLiveAction, isLive, isFinished, currentState]
  );

  const handleSubmit = useCallback(
    (actionType: string, actionId?: string) => {
      if (submitted) return;
      setSubmitted(true);
      onSubmit(block.id, actionType, localState);
      if (actionId && onAction) {
        onAction(block.id, actionId, localState);
      }
    },
    [block.id, localState, onSubmit, onAction, submitted]
  );

  // ローディング中
  if (isLoading) {
    return (
      <div className="iui-block iui-block-loading">
        <div className="iui-spinner" />
      </div>
    );
  }

  return (
    <div className={`iui-block${isLive ? ' iui-block-live' : ''}${isFinished ? ' iui-block-finished' : ''}`}>
      {/* タイトル */}
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

      {/* UIツリー */}
      <div className={`iui-block-content${isFinished ? ' iui-block-content-disabled' : ''}`}>
        <UIRenderer
          node={block.root}
          state={currentState}
          onAction={handleAction}
          onStateChange={handleStateChange}
        />
      </div>

      {/* アクションボタン（defaultモードのsubmit/cancel等のみ） */}
      {!isLive && block.actions && block.actions.length > 0 && !submitted && (
        <div className="iui-block-actions">
          {block.actions.map((action: UIAction, i: number) => (
            <ActionButton
              key={i}
              action={action}
              onSubmit={handleSubmit}
            />
          ))}
        </div>
      )}

      {/* 送信済み表示（defaultモードのみ） */}
      {!isLive && submitted && (
        <div className="iui-block-submitted">
          <span>送信済み</span>
        </div>
      )}

      {/* ライブUI終了表示 */}
      {isLive && isFinished && (
        <div className="iui-block-submitted">
          <span>ゲーム終了</span>
        </div>
      )}
    </div>
  );
}

// ===== ActionButton =====

interface ActionButtonProps {
  action: UIAction;
  onSubmit: (actionType: string, actionId?: string) => void;
}

function ActionButton({ action, onSubmit }: ActionButtonProps) {
  let className = 'iui-action-btn';
  const variant = action.variant || (action.type === 'submit' ? 'primary' : 'secondary');

  if (variant === 'primary') className += ' iui-action-btn-primary';
  else if (variant === 'danger') className += ' iui-action-btn-danger';
  else className += ' iui-action-btn-secondary';

  const handleClick = () => {
    if (action.type === 'submit' || action.type === 'custom') {
      onSubmit(action.type, action.actionId);
    } else if (action.type === 'cancel') {
      onSubmit('cancel', action.actionId);
    }
  };

  return (
    <button className={className} onClick={handleClick} type="button">
      {action.label}
    </button>
  );
}
