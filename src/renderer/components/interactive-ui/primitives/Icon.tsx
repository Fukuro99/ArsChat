import React from 'react';
import { resolveSize } from '../design-tokens';
import type { PrimitiveProps } from '../types';

/**
 * Icon プリミティブ
 *
 * Props:
 *   emoji   – 絵文字文字列（従来互換）
 *   codicon – microsoft/vscode-icons のアイコン名 (例: "gear", "bell", "add")
 *             指定した場合は public/codicons/{name}.svg を表示する
 *   size    – 'sm' | 'md' | 'lg'
 */
export default function Icon({ props }: PrimitiveProps) {
  const { emoji = '', codicon = '', size = 'md' } = props || {};

  const resolvedSize = resolveSize(size) || '1rem';

  // codicon が指定されていれば SVG 画像を表示
  if (codicon) {
    const px = resolvedSize.endsWith('rem') ? `${parseFloat(resolvedSize) * 16}px` : resolvedSize;

    return (
      <img
        src={`./codicons/${codicon}.svg`}
        width={px}
        height={px}
        alt={codicon}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          filter: 'invert(1) opacity(0.85)',
        }}
      />
    );
  }

  // fallback: 絵文字
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
