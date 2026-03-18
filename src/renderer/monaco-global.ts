/**
 * Monaco Editor グローバル初期化
 *
 * - Web Worker をスタブ化（シンタックスハイライトは動く、言語サービスは省略）
 * - window.monaco に公開して拡張から window.monaco.editor.create() で使えるようにする
 */

import * as monaco from 'monaco-editor';

// ===== Worker スタブ =====
// 実際のワーカーは使わず空のスタブを返す。
// シンタックスハイライト（トークナイザー）はメインスレッドで動くので問題なし。
// 言語サービス (IntelliSense / 診断) は無効になるが、エディタ機能は揃う。
(window as any).MonacoEnvironment = {
  getWorker(_moduleId: string, _label: string): Worker {
    const blob = new Blob([''], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  },
};

// ===== グローバル公開 =====
// 拡張の renderer.js から `const monaco = window.monaco;` で参照できる
(window as any).monaco = monaco;

export {};
