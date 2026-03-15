import { InteractiveUIBlock, ParsedContent, UIUpdatePatch, SandboxHTMLBlock, IframeHTMLBlock } from './types';

export function parseInteractiveUI(content: string): ParsedContent {
  const blocks: InteractiveUIBlock[] = [];
  const sandboxBlocks: SandboxHTMLBlock[] = [];
  const iframeBlocks: IframeHTMLBlock[] = [];
  const textParts: (string | null)[] = [];

  // interactive-ui、interactive-html、<iframe>タグを1パスで処理
  const regex = /```(interactive-ui|interactive-html)\n([\s\S]*?)```|<iframe([^>]*)>([\s\S]*?)<\/iframe>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let iframeCounter = 0;

  while ((match = regex.exec(content)) !== null) {
    textParts.push(content.slice(lastIndex, match.index));

    if (match[1]) {
      // コードブロック: interactive-ui または interactive-html
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
    } else {
      // <iframe>タグ: AI側サンドボックス表示用
      const attrsStr = match[3] || '';
      const html = match[4] || '';

      const widthMatch = attrsStr.match(/width="([^"]+)"/);
      const heightMatch = attrsStr.match(/height="([^"]+)"/);
      const titleMatch = attrsStr.match(/title="([^"]+)"/);

      const iframeBlock: IframeHTMLBlock = {
        id: `iframe-${iframeCounter++}`,
        html: html.trim(),
        width: widthMatch?.[1],
        height: heightMatch?.[1],
        title: titleMatch?.[1],
        _index: textParts.length,
      };
      iframeBlocks.push(iframeBlock);
      textParts.push(null);
    }

    lastIndex = regex.lastIndex;
  }

  // 末尾残りテキスト＋未閉じブロック検出
  const unclosed = content.slice(lastIndex);
  const hasUnclosedUI = unclosed.includes('```interactive-ui');
  const hasUnclosedHTML = unclosed.includes('```interactive-html');
  const hasUnclosedIframe = unclosed.includes('<iframe');
  const hasUnclosedBlock = hasUnclosedUI || hasUnclosedHTML || hasUnclosedIframe;

  if (hasUnclosedBlock) {
    let beforeUnclosed = unclosed;
    const uiIdx = hasUnclosedUI ? beforeUnclosed.indexOf('```interactive-ui') : Infinity;
    const htmlIdx = hasUnclosedHTML ? beforeUnclosed.indexOf('```interactive-html') : Infinity;
    const iframeIdx = hasUnclosedIframe ? beforeUnclosed.indexOf('<iframe') : Infinity;
    const cutIdx = Math.min(uiIdx, htmlIdx, iframeIdx);
    if (cutIdx !== Infinity) beforeUnclosed = beforeUnclosed.slice(0, cutIdx);
    textParts.push(beforeUnclosed);
  } else {
    textParts.push(unclosed);
  }

  return { textParts, blocks, sandboxBlocks, iframeBlocks, isLoading: hasUnclosedBlock };
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
