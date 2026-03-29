import type React from 'react';
import { ALLOWED_PADDING, resolveRounded, resolveSpacing } from '../design-tokens';
import type { PrimitiveProps } from '../types';

export default function Image({ props, value }: PrimitiveProps) {
  const { src: propSrc, alt = '', width, height, rounded, fit = 'cover', padding } = props || {};

  // bind で動的 src を受け取れる（value が優先）
  const src = value !== undefined && value !== null && value !== '' ? String(value) : propSrc;

  if (!src) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: width ? `${width}px` : '100%',
          height: height ? `${height}px` : '80px',
          backgroundColor: 'var(--aria-border)',
          borderRadius: resolveRounded(rounded) || '0',
          color: 'var(--aria-text-muted)',
          fontSize: '0.75rem',
        }}
      >
        No image
      </div>
    );
  }

  // fit の許可値
  const allowedFit = ['cover', 'contain', 'fill', 'none', 'scale-down'];
  const objectFit = allowedFit.includes(fit) ? (fit as React.CSSProperties['objectFit']) : 'cover';

  const style: React.CSSProperties = {
    display: 'block',
    borderRadius: resolveRounded(rounded) || '0',
    objectFit,
    maxWidth: '100%',
  };

  if (width) style.width = `${Number(width)}px`;
  if (height) style.height = `${Number(height)}px`;
  if (!width && !height) {
    style.width = '100%';
  }
  if (padding !== undefined) {
    style.padding = resolveSpacing(Number(padding), ALLOWED_PADDING) || undefined;
  }

  // 外部URLは許可しない（data:image または blob: のみ許可）
  const isSafe =
    src.startsWith('data:image/') || src.startsWith('blob:') || src.startsWith('./') || src.startsWith('/');
  if (!isSafe) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: width ? `${width}px` : '100%',
          height: height ? `${height}px` : '80px',
          backgroundColor: 'var(--aria-border)',
          borderRadius: resolveRounded(rounded) || '0',
          color: 'var(--aria-text-muted)',
          fontSize: '0.75rem',
        }}
      >
        [image blocked]
      </div>
    );
  }

  return <img src={src} alt={alt} style={style} draggable={false} />;
}
