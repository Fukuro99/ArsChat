import { InteractiveUIBlock, ParsedContent, UIUpdatePatch, SandboxHTMLBlock } from './types';

export function parseInteractiveUI(content: string): ParsedContent {
  const blocks: InteractiveUIBlock[] = [];
  const sandboxBlocks: SandboxHTMLBlock[] = [];
  const textParts: (string | null)[] = [];

  // interactive-ui と interactive-html の両方を1パスで処理
  const regex = /```(interactive-ui|interactive-html)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    textParts.push(content.slice(lastIndex, match.index));

    const blockType = match[1];
    const blockContent = match[2];

    if (blockType === 'interactive-ui') {
      try {
        const parsed = JSON.parse(blockContent) as InteractiveUIBlock;
        if (!parsed.id || !parsed.root) throw new Error('id or root is missing');
        blocks.push({ ...parsed, _index: textParts.length });
        textParts.push(null);
      } catch {
        textParts.push(match[0]);
      }
    } else if (blockType === 'interactive-html') {
      try {
        const sepIdx = blockContent.indexOf('\n---\n');
        if (sepIdx === -1) throw new Error('separator not found');
        const metaJson = blockContent.slice(0, sepIdx);
        const html = blockContent.slice(sepIdx + 5); // '\n---\n'.length === 5
        const meta = JSON.parse(metaJson) as Omit<SandboxHTMLBlock, 'html'>;
        if (!meta.id) throw new Error('id is missing');
        sandboxBlocks.push({ ...meta, html, _index: textParts.length });
        textParts.push(null);
      } catch {
        textParts.push(match[0]);
      }
    }

    lastIndex = regex.lastIndex;
  }

  // 末尾残りテキスト＋未閉じブロック検出
  const unclosed = content.slice(lastIndex);
  const hasUnclosedUI = unclosed.includes('```interactive-ui');
  const hasUnclosedHTML = unclosed.includes('```interactive-html');
  const hasUnclosedBlock = hasUnclosedUI || hasUnclosedHTML;

  if (hasUnclosedBlock) {
    // 最も早い未閉じブロックの手前までのテキストのみ表示
    let beforeUnclosed = unclosed;
    const uiIdx = hasUnclosedUI ? beforeUnclosed.indexOf('```interactive-ui') : Infinity;
    const htmlIdx = hasUnclosedHTML ? beforeUnclosed.indexOf('```interactive-html') : Infinity;
    const cutIdx = Math.min(uiIdx, htmlIdx);
    if (cutIdx !== Infinity) beforeUnclosed = beforeUnclosed.slice(0, cutIdx);
    textParts.push(beforeUnclosed);
  } else {
    textParts.push(unclosed);
  }

  return { textParts, blocks, sandboxBlocks, isLoading: hasUnclosedBlock };
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
