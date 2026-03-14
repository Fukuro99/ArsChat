import { useState, useCallback, useRef } from 'react';

// ===== ライブUIアクション履歴 =====

export interface LiveUIAction {
  uiId: string;
  action: string;
  data: Record<string, any>;
  timestamp: number;
}

// ===== ライブUI状態管理フック =====

/**
 * ライブUIブロックの状態を管理するフック。
 * 外部から state を注入できるように externalState と setExternalState を受け取る。
 */
export function useLiveUIState(
  blockId: string,
  initialState: Record<string, any>,
) {
  const [state, setState] = useState<Record<string, any>>(initialState);
  const blockIdRef = useRef(blockId);
  blockIdRef.current = blockId;

  const updateState = useCallback((patch: Record<string, any>) => {
    setState((prev) => mergePatch(prev, patch));
  }, []);

  return { state, setState, updateState };
}

// ===== パッチマージユーティリティ =====

/**
 * 現在のstateにパッチをマージする（浅いマージ）。
 * patchのキーが現在のstateのオブジェクト値であれば再帰的にマージ、
 * それ以外は上書きする。
 */
export function mergePatch(
  current: Record<string, any>,
  patch: Record<string, any>,
): Record<string, any> {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // 両方がオブジェクトの場合は再帰的にマージ
      result[key] = mergePatch(result[key] as Record<string, any>, value as Record<string, any>);
    } else {
      // 配列・プリミティブ・null は上書き
      result[key] = value;
    }
  }
  return result;
}
