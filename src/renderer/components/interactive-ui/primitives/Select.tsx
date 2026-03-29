import React from 'react';
import type { PrimitiveProps } from '../types';

export default function Select({ props, value, onChange }: PrimitiveProps) {
  const { inputId, options = [], placeholder = '選択してください' } = props || {};

  return (
    <select
      id={inputId}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        width: '100%',
        padding: '6px 10px',
        fontSize: '0.875rem',
        color: 'var(--aria-text)',
        backgroundColor: 'var(--aria-bg-light)',
        border: '1px solid var(--aria-border)',
        borderRadius: '6px',
        outline: 'none',
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
      className="iui-select"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {(options as string[]).map((opt, i) => (
        <option key={i} value={typeof opt === 'object' ? (opt as any).value : opt}>
          {typeof opt === 'object' ? (opt as any).label : opt}
        </option>
      ))}
    </select>
  );
}
