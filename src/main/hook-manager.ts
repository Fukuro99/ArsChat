/**
 * HookManager
 *
 * 拡張機能がアプリのライフサイクルを観察できる Hook API。
 *
 * 設計方針:
 * - 観察専用（現在）: ペイロードは structuredClone + Object.freeze で渡し、データ変更不可
 * - 非ブロッキング: emit は Promise.allSettled でリスナー実行、エラーは console.warn のみ
 * - async emit: 将来のミドルウェア型フック（ペイロード変更・キャンセル機能）への
 *   移行コストを下げるため emit は async。現在は await なしで呼び出してよい。
 */

import type { ChatMessage, ChatMessageStats, ChatSession } from '../shared/types';

// ===== イベントマップ =====

export interface HookEventMap {
  /** streamChat() 呼び出し直前 */
  'chat:beforeSend': { messages: ChatMessage[]; systemPrompt: string };
  /** ストリーム完了後 */
  'chat:afterResponse': { messages: ChatMessage[]; response: string; stats: ChatMessageStats };
  /** searchMemories() 呼び出し前 */
  'memory:beforeSearch': { personaId: string; query: string };
  /** storeMemory() 呼び出し前 */
  'memory:beforeStore': { personaId: string; content: string };
  /** store.saveSession() 呼び出し前 */
  'session:beforeSave': { session: ChatSession };
  /** ツール実行前 */
  'tool:beforeExecute': { toolName: string; input: Record<string, unknown> };
  /** ツール実行後 */
  'tool:afterExecute': { toolName: string; input: Record<string, unknown>; result: string };
}

export type HookEventName = keyof HookEventMap;
export type HookListener<K extends HookEventName> = (payload: Readonly<HookEventMap[K]>) => void | Promise<void>;

interface ListenerEntry {
  extId: string;
  fn: HookListener<any>;
}

// ===== ファクトリ =====

export function createHookManager() {
  const listeners = new Map<HookEventName, ListenerEntry[]>();

  /**
   * リスナー登録。返り値の関数で解除できる。
   */
  function on<K extends HookEventName>(extId: string, event: K, listener: HookListener<K>): () => void {
    if (!listeners.has(event)) listeners.set(event, []);
    const entry: ListenerEntry = { extId, fn: listener };
    listeners.get(event)!.push(entry);
    return () => {
      const arr = listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(entry);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  /**
   * fire-and-forget でリスナーに通知。ペイロードは freeze される。
   *
   * async にしているのは将来のミドルウェア型フックへの移行コストを下げるため。
   * 現在は呼び出し側で await する必要はない（メインフローをブロックしない）。
   *
   * 将来ミドルウェア型に拡張する場合:
   *   - 戻り値を Promise<HookEventMap[K] | null> に変更（null = キャンセル）
   *   - リスナーが変更後ペイロードを返せるよう型を拡張
   *   - 並列実行から直列パイプに変更
   */
  async function emit<K extends HookEventName>(event: K, payload: HookEventMap[K]): Promise<void> {
    const entries = listeners.get(event);
    if (!entries || entries.length === 0) return;
    const frozen = Object.freeze(structuredClone(payload));
    await Promise.allSettled(
      entries.map(async ({ fn, extId }) => {
        try {
          await fn(frozen);
        } catch (err) {
          console.warn(`[HookManager] Hook "${event}" from ext "${extId}" threw:`, err);
        }
      }),
    );
  }

  /**
   * 全リスナー削除（extensionManager.unloadAll 時に呼ぶ）
   */
  function removeAll(): void {
    listeners.clear();
  }

  return { on, emit, removeAll };
}

export type HookManager = ReturnType<typeof createHookManager>;
