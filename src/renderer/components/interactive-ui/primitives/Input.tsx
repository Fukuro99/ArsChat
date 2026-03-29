import type React from 'react';
import { useState } from 'react';
import type { PrimitiveProps } from '../types';

export default function Input({ props, value, onChange }: PrimitiveProps) {
  const { inputId, placeholder = '', multiline = false } = props || {};

  // bind が設定されていない場合（value=undefined）のローカル状態管理
  const [localValue, setLocalValue] = useState<string>('');

  // value が外部から渡されている（bind あり）かどうか
  const isControlled = value !== undefined;
  const displayValue = isControlled ? String(value) : localValue;

  const handleChange = (v: string) => {
    if (!isControlled) {
      // bind なし → ローカルstateで管理（入力内容を保持）
      setLocalValue(v);
    }
    // 常に親に通知（bind あり → 親stateを更新、bind なし → 何もしないが通知だけ）
    onChange?.(v);
  };

  const commonStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '0.875rem',
    color: 'var(--aria-text)',
    backgroundColor: 'var(--aria-bg-light)',
    border: '1px solid var(--aria-border)',
    borderRadius: '6px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  if (multiline) {
    return (
      <textarea
        id={inputId}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        style={{ ...commonStyle, minHeight: '80px' }}
        className="iui-input"
      />
    );
  }

  return (
    <input
      id={inputId}
      type="text"
      placeholder={placeholder}
      value={displayValue}
      onChange={(e) => handleChange(e.target.value)}
      style={commonStyle}
      className="iui-input"
    />
  );
}
