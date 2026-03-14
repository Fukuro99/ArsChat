import React from 'react';
import { PrimitiveProps } from '../types';

export default function Slider({ props, value, onChange }: PrimitiveProps) {
  const {
    inputId,
    min = 0,
    max = 100,
    step = 1,
  } = props || {};

  const currentValue = value !== undefined ? Number(value) : Number(min);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--aria-text-muted)' }}>
        <span>{min}</span>
        <span style={{ color: 'var(--aria-text)', fontWeight: 500 }}>{currentValue}</span>
        <span>{max}</span>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={(e) => onChange?.(Number(e.target.value))}
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
