import React from 'react';
import { PrimitiveProps } from '../types';
import { resolveColor } from '../design-tokens';

export default function ProgressBar({ props }: PrimitiveProps) {
  const {
    value = 0,
    max = 100,
    color = 'primary',
    showLabel = false,
  } = props || {};

  const percentage = Math.min(100, Math.max(0, (Number(value) / Number(max)) * 100));
  const resolvedColor = resolveColor(color) || 'var(--aria-primary)';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--aria-text-muted)' }}>
          <span>{value}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        style={{
          width: '100%',
          height: '8px',
          backgroundColor: 'var(--aria-border)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: resolvedColor,
            borderRadius: '9999px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
