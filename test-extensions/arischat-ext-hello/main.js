/**
 * arischat-ext-hello - Main Entry (CommonJS)
 * Main Process 側で動作し、Renderer からの IPC を処理する
 */

/** @param {import('../../src/main/extension-context').ExtensionContext} ctx */
function activate(ctx) {
  ctx.log.info('Hello Extension: activate()');

  // Renderer の AIChatPage から呼ばれる: api.ipc.invoke('ai-send', { messages })
  ctx.ipc.handle('ai-send', async (data) => {
    try {
      const result = await ctx.ai.send({
        messages: data.messages,
        systemPrompt: 'あなたは ArisChat 拡張機能のテスト用 AI です。簡潔に答えてください。',
      });
      return result;
    } catch (err) {
      return { content: 'エラー: ' + (err.message || '不明なエラー'), stats: {} };
    }
  });

  // ストリーミング版（将来の拡張用）
  ctx.ipc.handle('ai-stream-start', async (data) => {
    const abortController = ctx.ai.stream({
      messages: data.messages,
      systemPrompt: data.systemPrompt,
      onChunk: (chunk) => {
        ctx.ipc.send('ai-stream-chunk', { chunk });
      },
      onEnd: (stats) => {
        ctx.ipc.send('ai-stream-end', { stats });
      },
      onError: (error) => {
        ctx.ipc.send('ai-stream-error', { error });
      },
    });
    return { started: true };
  });

  ctx.log.info('Hello Extension: IPC ハンドラ登録完了');
}

function deactivate() {
  // クリーンアップ（ipc.handle の登録解除は自動）
}

module.exports = { activate, deactivate };
