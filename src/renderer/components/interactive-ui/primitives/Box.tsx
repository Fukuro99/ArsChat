import type React from 'react';
import { ALLOWED_GAP, ALLOWED_PADDING, resolveColor, resolveRounded, resolveSpacing } from '../design-tokens';
import type { PrimitiveProps } from '../types';

export default function Box({ props, children }: PrimitiveProps) {
  const {
    direction = 'column',
    gap,
    padding,
    align,
    justify,
    bg,
    border,
    rounded,
    minWidth,
    maxWidth,
    wrap,
  } = props || {};

  const style: React.CSSProperties = {};

  style.display = 'flex';
  style.flexDirection = direction === 'row' ? 'row' : 'column';

  if (gap !== undefined) {
    const resolved = resolveSpacing(gap, ALLOWED_GAP);
    if (resolved) style.gap = resolved;
  }

  if (padding !== undefined) {
    const resolved = resolveSpacing(padding, ALLOWED_PADDING);
    if (resolved) style.padding = resolved;
  }

  if (align) style.alignItems = align;
  if (justify) style.justifyContent = justify;
  if (wrap) style.flexWrap = 'wrap';

  const resolvedBg = resolveColor(bg);
  if (resolvedBg) style.backgroundColor = resolvedBg;

  if (border === 'thin') {
    style.border = '1px solid var(--aria-border)';
  } else if (border === 'medium') {
    style.border = '2px solid var(--aria-border)';
  }

  const resolvedRounded = resolveRounded(rounded);
  if (resolvedRounded) style.borderRadius = resolvedRounded;

  if (minWidth) style.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;
  if (maxWidth) style.maxWidth = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;

  return <div style={style}>{children}</div>;
}
