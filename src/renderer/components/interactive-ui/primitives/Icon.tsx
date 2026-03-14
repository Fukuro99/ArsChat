import React from 'react';
import { PrimitiveProps } from '../types';
import { resolveSize } from '../design-tokens';

export default function Icon({ props }: PrimitiveProps) {
  const {
    emoji = '',
    size = 'md',
  } = props || {};

  const resolvedSize = resolveSize(size) || '1rem';

  return (
    <span
      style={{
        fontSize: resolvedSize,
        lineHeight: 1,
        display: 'inline-block',
      }}
      role="img"
      aria-label={emoji}
    >
      {emoji}
    </span>
  );
}
