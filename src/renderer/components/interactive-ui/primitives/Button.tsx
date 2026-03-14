import React from 'react';
import { PrimitiveProps } from '../types';
import { resolveColor } from '../design-tokens';

export default function Button({ props, onAction }: PrimitiveProps) {
  const {
    label = 'Button',
    actionId,
    variant = 'secondary',
    disabled = false,
    color,
  } = props || {};

  const handleClick = () => {
    if (!disabled && actionId && onAction) {
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
      backgroundColor: 'transparent',
      color: resolveColor(color) || 'var(--aria-text)',
      border: '1px solid var(--aria-border)',
    };
    className += ' iui-button-secondary';
  }

  if (disabled) {
    buttonStyle.opacity = 0.5;
    buttonStyle.cursor = 'not-allowed';
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled as boolean}
      className={className}
      style={buttonStyle}
    >
      {label}
    </button>
  );
}
