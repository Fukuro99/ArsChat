import React from 'react';
import { PrimitiveProps } from '../types';

export default function Input({ props, value, onChange }: PrimitiveProps) {
  const {
    inputId,
    placeholder = '',
    multiline = false,
  } = props || {};

  const commonStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '0.875rem',
    color: 'var(--aria-text)',
    backgroundColor: 'var(--aria-bg-light)',
    border: '1px solid var(--aria-border)',
    borderRadius: '6px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  if (multiline) {
    return (
      <textarea
        id={inputId}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ ...commonStyle, minHeight: '80px' }}
        className="iui-input"
      />
    );
  }

  return (
    <input
      id={inputId}
      type="text"
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      style={commonStyle}
      className="iui-input"
    />
  );
}
