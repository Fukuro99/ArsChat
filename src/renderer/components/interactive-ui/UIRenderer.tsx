import React, { useState, useCallback } from 'react';
import { UINode, InteractiveUIBlock, UIAction } from './types';
import { primitiveRegistry } from './primitives/index';

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
  isLoading?: boolean;
}

export function BlockRenderer({ block, onSubmit, onAction, isLoading }: BlockRendererProps) {
  const [localState, setLocalState] = useState<Record<string, any>>(block.state || {});
  const [submitted, setSubmitted] = useState(false);

  const handleStateChange = useCallback((keyPath: string, value: any) => {
    setLocalState((prev) => updateKeyPath(prev, keyPath, value));
  }, []);

  const handleAction = useCallback(
    (nodeId: string | undefined, actionId: string, data?: any) => {
      if (onAction) {
        onAction(block.id, actionId, { ...data, nodeId });
      }
    },
    [block.id, onAction]
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
    <div className="iui-block">
      {/* タイトル */}
      {block.title && (
        <div className="iui-block-title">
          {block.title}
        </div>
      )}

      {/* UIツリー */}
      <div className="iui-block-content">
        <UIRenderer
          node={block.root}
          state={localState}
          onAction={handleAction}
          onStateChange={handleStateChange}
        />
      </div>

      {/* アクションボタン（submit/cancel等） */}
      {block.actions && block.actions.length > 0 && !submitted && (
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

      {/* 送信済み表示 */}
      {submitted && (
        <div className="iui-block-submitted">
          <span>送信済み</span>
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
