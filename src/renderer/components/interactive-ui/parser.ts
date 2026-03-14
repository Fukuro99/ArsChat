import { InteractiveUIBlock, ParsedContent, UIUpdatePatch } from './types';

/**
 * AIレスポンス文字列から ```interactive-ui ブロックを抽出し、
 * テキスト部分とUIブロックを分離する。
 * ストリーミング中（未閉じブロック）も安全に処理する。
 */
export function parseInteractiveUI(content: string): ParsedContent {
  const blocks: InteractiveUIBlock[] = [];
  const textParts: (string | null)[] = [];

  // 閉じた ```interactive-ui ... ``` ブロックを検出
  const regex = /```interactive-ui\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // マッチ前のテキスト部分を保持
    textParts.push(content.slice(lastIndex, match.index));

    try {
      const parsed = JSON.parse(match[1]) as InteractiveUIBlock;
      if (!parsed.id || !parsed.root) {
        throw new Error('id or root is missing');
      }
      const block: InteractiveUIBlock = {
        ...parsed,
        _index: textParts.length,
      };
      blocks.push(block);
      textParts.push(null); // UIブロックのプレースホルダー
    } catch {
      // パース失敗 → Markdownとしてフォールバック表示
      textParts.push(match[0]);
    }

    lastIndex = regex.lastIndex;
  }

  // 末尾の残りテキスト
  const unclosed = content.slice(lastIndex);

  // 未閉じブロックの検出
  const hasUnclosedBlock = unclosed.includes('```interactive-ui');

  if (hasUnclosedBlock) {
    // 未閉じブロックの前のテキスト部分のみ表示
    const beforeUnclosed = unclosed.replace(/```interactive-ui[\s\S]*$/, '');
    textParts.push(beforeUnclosed);
  } else {
    textParts.push(unclosed);
  }

  return {
    textParts,
    blocks,
    isLoading: hasUnclosedBlock,
  };
}

/**
 * AIレスポンス文字列から ```interactive-ui-update ブロックを抽出する。
 * ライブUIモードでのパッチ適用に使用する。
 */
export function parseUIUpdate(content: string): UIUpdatePatch | null {
  const regex = /```interactive-ui-update\n([\s\S]*?)```/;
  const match = regex.exec(content);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as UIUpdatePatch;
    if (!parsed.id || !parsed.patch) return null;
    return parsed;
  } catch {
    return null;
  }
}
