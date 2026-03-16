import React, { useState, useEffect } from 'react';
import { PrimitiveProps } from '../types';

export default function Slider({ props, value, onChange }: PrimitiveProps) {
  const {
    inputId,
    min = 0,
    max = 100,
    step = 1,
  } = props || {};

  const isControlled = value !== undefined;

  // ローカル state でドラッグ中の値を即時反映（Input.tsx と同パターン）
  const [localValue, setLocalValue] = useState<number>(
    isControlled ? Number(value) : Number(min)
  );

  // bind 経由で外部 state が変わったとき localValue を同期
  useEffect(() => {
    if (isControlled) {
      setLocalValue(Number(value));
    }
  }, [value, isControlled]);

  const displayValue = localValue; // ドラッグ即時反映のため常に localValue を使用

  const handleChange = (v: number) => {
    setLocalValue(v); // 即時 UI 更新（スナップバック防止）
    onChange?.(v);    // bind がある場合は親 state も更新
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--aria-text-muted)' }}>
        <span>{min}</span>
        <span style={{ color: 'var(--aria-text)', fontWeight: 500 }}>{displayValue}</span>
        <span>{max}</span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={(e) => handleChange(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: 'var(--aria-primary)',
          cursor: 'pointer',
        }}
        className="iui-slider"
      />
    </div>
  );
}
