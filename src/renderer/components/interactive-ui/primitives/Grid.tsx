import React from 'react';
import { PrimitiveProps } from '../types';
import { resolveColor, resolveSpacing, ALLOWED_GAP } from '../design-tokens';

export default function Grid({ props, children }: PrimitiveProps) {
  const {
    cols = 3,
    rows,
    gap,
    cellWidth,
    cellHeight,
    bg,
    borderColor,
  } = props || {};

  const style: React.CSSProperties = {};
  style.display = 'grid';
  style.gridTemplateColumns = `repeat(${cols}, ${cellWidth ? `${cellWidth}px` : '1fr'})`;

  if (rows) {
    style.gridTemplateRows = `repeat(${rows}, ${cellHeight ? `${cellHeight}px` : 'auto'})`;
  }

  if (gap !== undefined) {
    const resolved = resolveSpacing(gap, ALLOWED_GAP);
    if (resolved) style.gap = resolved;
  } else {
    style.gap = '0';
  }

  const resolvedBg = resolveColor(bg);
  if (resolvedBg) style.backgroundColor = resolvedBg;

  if (borderColor) {
    const resolved = resolveColor(borderColor) || borderColor;
    style.border = `1px solid ${resolved}`;
  }

  // グリッドセルのスタイル
  const cellStyle: React.CSSProperties = {};
  if (cellWidth) cellStyle.width = `${cellWidth}px`;
  if (cellHeight) cellStyle.height = `${cellHeight}px`;
  if (borderColor) {
    const resolved = resolveColor(borderColor) || borderColor;
    cellStyle.border = `0.5px solid ${resolved}`;
  }

  // children が1つの場合: cols * rows 回繰り返す（グリッドテンプレートとして使用）
  const childrenArray = React.Children.toArray(children);
  const totalCells = cols * (rows || 1);

  if (childrenArray.length === 1 && totalCells > 1) {
    const template = childrenArray[0];
    return (
      <div style={style}>
        {Array.from({ length: totalCells }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          return (
            <div key={i} style={cellStyle} data-row={row} data-col={col}>
              {React.cloneElement(template as React.ReactElement, { key: i })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={style}>
      {childrenArray.map((child, i) => (
        <div key={i} style={cellStyle}>
          {child}
        </div>
      ))}
    </div>
  );
}
