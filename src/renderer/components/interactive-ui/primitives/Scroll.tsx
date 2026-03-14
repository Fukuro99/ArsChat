import React from 'react';
import { PrimitiveProps } from '../types';

export default function Scroll({ props, children }: PrimitiveProps) {
  const {
    maxHeight = 300,
    direction = 'vertical',
  } = props || {};

  const style: React.CSSProperties = {
    overflowY: direction === 'vertical' || direction === 'both' ? 'auto' : 'hidden',
    overflowX: direction === 'horizontal' || direction === 'both' ? 'auto' : 'hidden',
    maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
  };

  return (
    <div style={style} className="iui-scroll">
      {children}
    </div>
  );
}
