import React, { useState } from 'react';
import { PrimitiveProps } from '../types';
import { resolveColor } from '../design-tokens';

export default function Clickable({ props, onAction, onChange, children }: PrimitiveProps) {
  const {
    actionId,
    cursor = 'pointer',
    hoverBg,
    local = false,   // true: AIに送信せずローカルstateのみ更新
    stateValue,      // local: true のとき bind で指定したキーに設定する値
  } = props || {};

  const [hovered, setHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (local) {
      // ローカルアクション: onChange で state を更新するだけ（AI送信なし）
      const target = e.currentTarget as HTMLElement;
      const row = target.dataset.row;
      const col = target.dataset.col;
      const val = stateValue ?? (row !== undefined && col !== undefined ? { row: Number(row), col: Number(col) } : true);
      onChange?.(val);
    } else if (actionId && onAction) {
      // data-row / data-col をDOMから取得してアクションに含める
      const target = e.currentTarget as HTMLElement;
      const row = target.dataset.row;
      const col = target.dataset.col;
      const data: Record<string, any> = {};
      if (row !== undefined) data.row = Number(row);
      if (col !== undefined) data.col = Number(col);
      onAction(actionId, data);
    }
  };

  const style: React.CSSProperties = {
    cursor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  };

  if (hovered && hoverBg) {
    const resolved = resolveColor(hoverBg);
    // hoverBg は rgba() も許容（ゲームUIでよく使う）
    style.backgroundColor = resolved || hoverBg;
  }

  return (
    <div
      style={style}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  );
}
