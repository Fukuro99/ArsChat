import React from 'react';
import { PrimitiveProps } from '../types';
import { resolveColor } from '../design-tokens';

export default function Badge({ props }: PrimitiveProps) {
  const {
    content = '',
    color = 'text',
    bg = 'surface',
  } = props || {};

  const resolvedColor = resolveColor(color) || 'var(--aria-text)';
  const resolvedBg = resolveColor(bg) || 'var(--aria-surface)';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: resolvedColor,
        backgroundColor: resolvedBg,
        border: '1px solid var(--aria-border)',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      {content}
    </span>
  );
}
