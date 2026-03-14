import React from 'react';
import { PrimitiveProps } from '../types';

export default function Chips({ props, value, onChange }: PrimitiveProps) {
  const {
    inputId,
    options = [],
    multi = false,
  } = props || {};

  // value は単一値（string）またはstring[]
  const selected: string[] = Array.isArray(value)
    ? value
    : value ? [value] : [];

  const handleToggle = (opt: string) => {
    if (multi) {
      const next = selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
      onChange?.(next);
    } else {
      onChange?.(selected.includes(opt) ? '' : opt);
    }
  };

  return (
    <div
      id={inputId}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
      }}
    >
      {(options as string[]).map((opt, i) => {
        const optLabel = typeof opt === 'object' ? (opt as any).label : opt;
        const optValue = typeof opt === 'object' ? (opt as any).value : opt;
        const isSelected = selected.includes(optValue);

        return (
          <button
            key={i}
            onClick={() => handleToggle(optValue)}
            style={{
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              border: `1px solid ${isSelected ? 'var(--aria-primary)' : 'var(--aria-border)'}`,
              backgroundColor: isSelected ? 'var(--aria-primary)' : 'transparent',
              color: isSelected ? '#ffffff' : 'var(--aria-text)',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
            type="button"
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}
