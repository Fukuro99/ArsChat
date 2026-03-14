import React from 'react';
import { PrimitiveProps } from '../types';
import { resolveColor, resolveSize, resolveFontWeight } from '../design-tokens';

/**
 * state を参照してテンプレート変数 {state.xxx} や {state.foo.bar} を展開する。
 * また {cellValue} など単純なキーも state から展開する。
 */
function expandTemplate(content: string, state?: Record<string, any>): string {
  if (!state || !content.includes('{')) return content;

  return content.replace(/\{([^}]+)\}/g, (match, key) => {
    const trimmed = key.trim();

    // {state.xxx.yyy} 形式
    if (trimmed.startsWith('state.')) {
      const keyPath = trimmed.slice('state.'.length);
      const value = resolveKeyPath(state, keyPath);
      return value !== undefined && value !== null ? String(value) : match;
    }

    // {xxx} 形式（state直接参照）
    const value = resolveKeyPath(state, trimmed);
    return value !== undefined && value !== null ? String(value) : match;
  });
}

function resolveKeyPath(obj: Record<string, any>, keyPath: string): any {
  const keys = keyPath.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export default function Text({ props, state }: PrimitiveProps) {
  const {
    content = '',
    size,
    weight,
    color,
    align,
  } = props || {};

  const expanded = expandTemplate(String(content), state);

  const style: React.CSSProperties = {};

  const resolvedSize = resolveSize(size);
  if (resolvedSize) style.fontSize = resolvedSize;

  const resolvedWeight = resolveFontWeight(weight);
  if (resolvedWeight) style.fontWeight = resolvedWeight;

  const resolvedColor = resolveColor(color);
  if (resolvedColor) style.color = resolvedColor;

  if (align) style.textAlign = align as React.CSSProperties['textAlign'];

  return (
    <span style={style}>
      {expanded}
    </span>
  );
}
