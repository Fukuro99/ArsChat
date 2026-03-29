import type React from 'react';
import { resolveColor } from '../design-tokens';
import type { PrimitiveProps } from '../types';

export default function Button({ props, onAction, onChange }: PrimitiveProps) {
  const {
    label = 'Button',
    actionId,
    variant = 'secondary',
    disabled = false,
    color,
    local = false, // true: AIに送信せずローカルstateのみ更新
    value, // local: true のとき bind で指定したキーに設定する値
  } = props || {};

  const handleClick = () => {
    if (disabled) return;
    if (local) {
      // ローカルアクション: onChange で state を更新するだけ（AI送信なし）
      onChange?.(value ?? true);
    } else if (actionId && onAction) {
      onAction(actionId, { label });
    }
  };

  let buttonStyle: React.CSSProperties = {};
  let className = 'iui-button';

  if (variant === 'primary') {
    const resolvedColor = resolveColor(color);
    buttonStyle = {
      backgroundColor: resolvedColor || 'var(--aria-primary)',
      color: '#ffffff',
      border: 'none',
    };
    className += ' iui-button-primary';
  } else if (variant === 'danger') {
    buttonStyle = {
      backgroundColor: '#ef4444',
      color: '#ffffff',
      border: 'none',
    };
    className += ' iui-button-danger';
  } else {
    // secondary (default)
    buttonStyle = {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      color: resolveColor(color) || 'var(--aria-text)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
    };
    className += ' iui-button-secondary';
  }

  if (disabled) {
    buttonStyle.opacity = 0.5;
    buttonStyle.cursor = 'not-allowed';
  }

  return (
    <button onClick={handleClick} disabled={disabled as boolean} className={className} style={buttonStyle}>
      {label}
    </button>
  );
}
