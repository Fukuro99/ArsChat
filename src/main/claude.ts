import Anthropic from '@anthropic-ai/sdk';
import { ArisChatSettings, ChatMessage, ChatMessageStats, LMStudioModelInfo } from '../shared/types';
import type { MCPManager } from './mcp-manager';

export function createClaudeService(mcpManager?: MCPManager) {
  let currentAbortController: AbortController | null = null;
  const LMSTUDIO_LOCALHOST_FALLBACK = '127.0.0.1';

  function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '');
  }

  /** baseUrl から OpenAI互換の /v1/chat/completions エンドポイントを解決 */
  function resolveChatEndpoint(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    // 既に /v1/chat/completions が含まれていればそのまま
    if (/\/v1\/chat\/completions$/i.test(normalized)) {
      return normalized;
    }
    // /api/v1 が付いている場合は /v1 に正規化 (LM Studio旧設定互換)
    // ※ /v1$ より先にチェック（/api/v1 も /v1$ にマッチするため）
    if (/\/api\/v1$/i.test(normalized)) {
      const base = normalized.replace(/\/api\/v1$/i, '');
      return `${base}/v1/chat/completions`;
    }
    // /v1 で終わっている場合は /chat/completions を追加
    if (/\/v1$/i.test(normalized)) {
      return `${normalized}/chat/completions`;
    }
    // ベースURLのみの場合 (例: http://localhost:1234)
    return `${normalized}/v1/chat/completions`;
  }

  /**
   * baseUrl から LM Studio native /api/v1/models エンドポイントを解決。
   * 設定URLのパス部分(/v1, /api/v1など)を無視し、常にサーバーのhost:portに
   * /api/v1/models を付与する。
   */
  function resolveNativeModelsEndpoint(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    try {
      const parsed = new URL(normalized);
      return `${parsed.protocol}//${parsed.host}/api/v1/models`;
    } catch {
      // URL パース失敗時はパスを手動で除去
      return normalized.replace(/\/(api\/v1|v1)(\/.*)?$/, '') + '/api/v1/models';
    }
  }

  /** baseUrl から /v1/models エンドポイントを解決（モデル一覧取得用・後方互換） */
  function resolveModelsEndpoint(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    if (/\/v1$/i.test(normalized)) {
      return `${normalized}/models`;
    }
    if (/\/api\/v1$/i.test(normalized)) {
      return `${normalized}/models`;
    }
    return `${normalized}/v1/models`;
  }

  /** baseUrl から LM Studio v0 REST API のベースを解決 */
  function resolveV0Base(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    return normalized.replace(/\/api\/v1$/i, '').replace(/\/v1$/i, '');
  }

  /** LM Studio モデル一覧を取得（/api/v1/models → /api/v0/models の順でフォールバック） */
  async function fetchLMStudioModelList(baseUrl: string): Promise<LMStudioModelInfo[]> {
    // 常に LM Studio native の /api/v1/models を使う（設定URLのパスは無視）
    const endpoint = resolveNativeModelsEndpoint(baseUrl);
    const fallbackEndpoint = endpoint.replace('localhost', '127.0.0.1');
    // v0 API はフォールバック用（より詳細な state 情報を持つ場合に備えて）
    const v0Endpoint = `${resolveV0Base(baseUrl)}/api/v0/models`;
    const v0FallbackEndpoint = v0Endpoint.replace('localhost', '127.0.0.1');

    let response: Response | null = null;
    // まず /api/v1/models（ユーザー設定URL）を試みる
    for (const url of [endpoint, fallbackEndpoint]) {
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.ok) { response = res; break; }
      } catch { /* 次を試す */ }
    }
    // 失敗したら /api/v0/models を試みる
    if (!response) {
      for (const url of [v0Endpoint, v0FallbackEndpoint]) {
        try {
          const res = await fetch(url, { method: 'GET' });
          if (res.ok) { response = res; break; }
        } catch { /* 次を試す */ }
      }
    }
    if (!response) throw new Error(`モデル一覧の取得に失敗しました。LM Studio のサーバーが起動しているか確認してください。`);
    const json: any = await response.json();
    // v0 API は { data: [...] } または { models: [...] } またはそのまま配列
    const items: any[] = Array.isArray(json)
      ? json
      : json?.data ?? json?.models ?? [];
    return items
      .map((item: any): LMStudioModelInfo => {
        // --- ID ---
        // v1 API: key フィールド / v0 API: id フィールド / 旧: identifier
        const id = item.key ?? item.id ?? item.instance_id ?? item.identifier ?? '';

        // --- 表示名 ---
        const displayName =
          item.display_name ?? item.displayName ?? item.name ?? id;

        // --- 最大コンテキスト長 ---
        const maxContextLength: number =
          item.max_context_length ??
          item.maxContextLength ??
          item.context_length ??
          4096;

        // --- ロード済みコンテキスト長 ---
        // v1 API: loaded_instances[0].config.context_length
        // v0 API: loaded_context_length
        const loadedInstance = Array.isArray(item.loaded_instances) && item.loaded_instances.length > 0
          ? item.loaded_instances[0]
          : null;
        const loadedContextLength: number | undefined =
          loadedInstance?.config?.context_length ??
          item.loaded_context_length ??
          undefined;

        // --- ロード状態 ---
        // v1 API: loaded_instances.length > 0 で判定
        // v0 API: state フィールド / status フィールド
        let state: string;
        if (item.state !== undefined) {
          state = item.state;
        } else if (item.status !== undefined) {
          state = item.status;
        } else if (Array.isArray(item.loaded_instances)) {
          state = item.loaded_instances.length > 0 ? 'loaded' : 'not-loaded';
        } else {
          state = item.loaded ? 'loaded' : 'not-loaded';
        }

        // --- タイプ ---
        const type = item.type ?? 'llm';

        return { id, displayName, maxContextLength, loadedContextLength, state, type } as LMStudioModelInfo;
      })
      // embedding モデルはチャット不可なので除外（"embedding" / "embeddings" 両方対応）
      .filter((m) => m.id && m.type !== 'embedding' && m.type !== 'embeddings');
  }

  /**
   * LM Studio v1 API でモデルをロード
   * POST /api/v1/models/load はロード完了までブロックして返す（ポーリング不要）
   */
  async function loadLMStudioModelById(
    baseUrl: string,
    modelId: string,
    contextLength: number,
  ): Promise<void> {
    // /api/v1/models/load エンドポイントを解決
    // baseUrl が http://localhost:1234/api/v1 → http://localhost:1234/api/v1/models/load
    const normalized = normalizeBaseUrl(baseUrl);
    const v1Base = normalized.endsWith('/api/v1')
      ? normalized
      : normalized.endsWith('/v1')
        ? normalized.replace(/\/v1$/i, '/api/v1')
        : `${normalized}/api/v1`;
    const endpoint = `${v1Base}/models/load`;
    const fallbackEndpoint = endpoint.replace('localhost', '127.0.0.1');

    const body = JSON.stringify({
      model: modelId,
      context_length: contextLength,
    });
    const headers = { 'Content-Type': 'application/json' };

    const doLoad = async (url: string) => {
      const res = await fetch(url, { method: 'POST', headers, body });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`モデルのロードに失敗: ${res.status} ${errText.slice(0, 300)}`);
      }
      const json: any = await res.json();
      // status === "loaded" または instance_id があれば成功
      if (json?.status !== 'loaded' && !json?.instance_id) {
        throw new Error(`ロード応答が不正です: ${JSON.stringify(json).slice(0, 200)}`);
      }
    };

    try {
      await doLoad(endpoint);
    } catch (err: any) {
      if (err?.cause?.code === 'ECONNREFUSED' || err?.message === 'fetch failed') {
        await doLoad(fallbackEndpoint);
      } else {
        throw err;
      }
    }
  }

  function pickFirstModelId(payload: any, requireVision: boolean): string | null {
    const asArray = (value: any): any[] => (Array.isArray(value) ? value : []);
    const pickFromItem = (item: any): string | null => {
      if (!item) return null;
      if (typeof item === 'string') return item;
      if (Array.isArray(item?.loaded_instances)) {
        for (const loaded of item.loaded_instances) {
          if (typeof loaded?.id === 'string') return loaded.id;
        }
      }
      if (typeof item?.selected_variant === 'string') return item.selected_variant;
      if (typeof item?.key === 'string') return item.key;
      if (typeof item?.id === 'string') return item.id;
      if (typeof item?.model === 'string') return item.model;
      if (typeof item?.name === 'string') return item.name;
      return null;
    };
    const sourceItemsRaw = [
      ...asArray(payload),
      ...asArray(payload?.models),
      ...asArray(payload?.data),
    ];
    const sourceItems = requireVision
      ? sourceItemsRaw.filter((item) => item?.capabilities?.vision === true)
      : sourceItemsRaw;

    for (const item of sourceItems) {
      if (Array.isArray(item?.loaded_instances)) {
        for (const loaded of item.loaded_instances) {
          if (typeof loaded?.id === 'string') return loaded.id;
        }
      }
    }
    for (const item of sourceItems) {
      const id = pickFromItem(item);
      if (id) return id;
    }
    return null;
  }

  function isConnectionError(err: any): boolean {
    return err?.message === 'fetch failed' || err?.cause?.code === 'ECONNREFUSED';
  }

  async function fetchWithFallback(
    url: string,
    init: RequestInit,
    attemptedUrls: string[],
  ): Promise<Response> {
    attemptedUrls.push(url);
    try {
      return await fetch(url, init);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      try {
        const parsed = new URL(url);
        const canFallbackToIpv4 =
          parsed.hostname === 'localhost' &&
          (err?.message === 'fetch failed' || err?.cause?.code === 'ECONNREFUSED');

        if (canFallbackToIpv4) {
          parsed.hostname = LMSTUDIO_LOCALHOST_FALLBACK;
          const fallbackUrl = parsed.toString();
          attemptedUrls.push(fallbackUrl);
          return await fetch(fallbackUrl, init);
        }
      } catch {
        // URLパース失敗時は元のエラーを返す
      }
      throw err;
    }
  }

  /** LMStudio の /v1/models (または /api/v1/models) からロード中のモデルIDを取得 */
  async function resolveAutoModel(
    baseUrl: string,
    signal: AbortSignal,
    attemptedUrls: string[],
    requireVision: boolean,
  ): Promise<string | null> {
    const modelsEndpoint = resolveModelsEndpoint(baseUrl);
    try {
      const response = await fetchWithFallback(
        modelsEndpoint,
        { method: 'GET', signal },
        attemptedUrls,
      );
      if (!response.ok) return null;

      const raw = await response.text();
      const payload = JSON.parse(raw);
      return pickFirstModelId(payload, requireVision);
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      return null;
    }
  }

  /** 停止理由を日本語に変換 */
  function formatFinishReason(reason?: string | null): string | undefined {
    if (!reason || reason === 'null') return undefined;
    const map: Record<string, string> = {
      stop: 'EOSトークン検出',
      length: '最大トークン数到達',
      tool_calls: 'ツール呼び出し',
      content_filter: 'コンテンツフィルター',
      end_turn: '完了',
      max_tokens: '最大トークン数到達',
    };
    return map[reason] ?? reason;
  }

  /** OpenAI SSE ストリームを処理（統計情報を収集して onEnd に渡す） */
  async function processOpenAIStream(
    response: Response,
    onChunk: (chunk: string) => void,
    onEnd: (stats: ChatMessageStats) => void,
    requestStartTime: number,
  ): Promise<void> {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      // 非ストリーミングレスポンス
      const raw = await response.text();
      const endTime = Date.now();
      const stats: ChatMessageStats = {};
      try {
        const payload = JSON.parse(raw);
        const content =
          payload?.choices?.[0]?.message?.content ??
          payload?.choices?.[0]?.delta?.content ?? '';
        const usage = payload?.usage;
        const elapsed = (endTime - requestStartTime) / 1000;
        const completionTokens = usage?.completion_tokens ?? 0;
        stats.totalTokens = completionTokens || undefined;
        stats.timeSeconds = Math.round(elapsed * 100) / 100;
        stats.tokensPerSec = completionTokens > 0 && elapsed > 0
          ? Math.round((completionTokens / elapsed) * 100) / 100
          : undefined;
        stats.finishReason = formatFinishReason(payload?.choices?.[0]?.finish_reason);
        if (content) onChunk(content);
      } catch {
        if (raw.trim()) onChunk(raw.trim());
      }
      onEnd(stats);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completionTokens = 0;
    let firstChunkTime: number | undefined;
    const stats: ChatMessageStats = {};

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            // 統計を確定して終了
            const endTime = Date.now();
            const genTime = firstChunkTime
              ? (endTime - firstChunkTime) / 1000
              : (endTime - requestStartTime) / 1000;
            stats.totalTokens = stats.totalTokens ?? (completionTokens > 0 ? completionTokens : undefined);
            stats.timeSeconds = Math.round(((endTime - requestStartTime) / 1000) * 100) / 100;
            stats.tokensPerSec = completionTokens > 0 && genTime > 0
              ? Math.round((completionTokens / genTime) * 100) / 100
              : undefined;
            onEnd(stats);
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              if (firstChunkTime === undefined) firstChunkTime = Date.now();
              completionTokens++;
              onChunk(delta);
            }
            // 停止理由・使用量を最後のチャンクから取得
            const fr = json?.choices?.[0]?.finish_reason;
            if (fr && fr !== 'null') stats.finishReason = formatFinishReason(fr);
            const usage = json?.usage;
            if (usage?.completion_tokens) completionTokens = usage.completion_tokens;
            if (usage?.total_tokens) stats.totalTokens = usage.total_tokens;
          } catch {
            // JSON パース失敗は無視
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // [DONE] なしで終了した場合のフォールバック統計
    const endTime = Date.now();
    const genTime = firstChunkTime
      ? (endTime - firstChunkTime) / 1000
      : (endTime - requestStartTime) / 1000;
    stats.totalTokens = stats.totalTokens ?? (completionTokens > 0 ? completionTokens : undefined);
    stats.timeSeconds = Math.round(((endTime - requestStartTime) / 1000) * 100) / 100;
    stats.tokensPerSec = completionTokens > 0 && genTime > 0
      ? Math.round((completionTokens / genTime) * 100) / 100
      : undefined;
    onEnd(stats);
  }

  // ===== Anthropic ストリーミング =====
  async function streamAnthropic(
    settings: ArisChatSettings,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onEnd: (stats: ChatMessageStats) => void,
  ): Promise<void> {
    const client = new Anthropic({ apiKey: settings.apiKey });
    const requestStartTime = Date.now();
    let firstChunkTime: number | undefined;
    let completionTokens = 0;

    const apiMessages = messages.map((msg) => {
      const content: any[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      if (msg.imageBase64) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: msg.imageBase64 },
        });
      }
      return { role: msg.role as 'user' | 'assistant', content };
    });

    const stream = client.messages.stream({
      model: settings.model,
      max_tokens: 4096,
      system: settings.systemPrompt,
      messages: apiMessages,
    });

    stream.on('text', (text) => {
      if (!currentAbortController?.signal.aborted) {
        if (firstChunkTime === undefined) firstChunkTime = Date.now();
        completionTokens++;
        onChunk(text);
      }
    });
    stream.on('end', () => {
      const endTime = Date.now();
      const genTime = firstChunkTime ? (endTime - firstChunkTime) / 1000 : (endTime - requestStartTime) / 1000;
      const stats: ChatMessageStats = {
        timeSeconds: Math.round(((endTime - requestStartTime) / 1000) * 100) / 100,
        tokensPerSec: completionTokens > 0 && genTime > 0
          ? Math.round((completionTokens / genTime) * 100) / 100 : undefined,
      };
      onEnd(stats);
      currentAbortController = null;
    });
    stream.on('error', (error) => { throw error; });

    currentAbortController!.signal.addEventListener('abort', () => stream.abort());

    try {
      const finalMsg = await stream.finalMessage();
      completionTokens = finalMsg.usage?.output_tokens ?? completionTokens;
    } catch (err: any) {
      if (err.name === 'AbortError' || currentAbortController?.signal.aborted) {
        onEnd({});
        return;
      }
      throw err;
    } finally {
      currentAbortController = null;
    }
  }

  // ===== LM Studio (OpenAI互換) ストリーミング =====
  async function streamLMStudio(
    settings: ArisChatSettings,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onEnd: (stats: ChatMessageStats) => void,
    options?: { thinkMode?: boolean },
  ): Promise<void> {
    const baseUrl = normalizeBaseUrl(settings.lmstudioBaseUrl);
    if (!baseUrl) {
      throw new Error('LM Studio のサーバーURLが空です。設定画面からURLを入力してください。');
    }

    const chatEndpoint = resolveChatEndpoint(baseUrl);
    const attemptedUrls: string[] = [];
    const hasVisionInput = messages.some((msg) => !!msg.imageBase64);

    // モデル解決
    let model = settings.lmstudioModel.trim();
    if (!model) {
      const autoModel = await resolveAutoModel(
        baseUrl,
        currentAbortController!.signal,
        attemptedUrls,
        hasVisionInput,
      );
      if (hasVisionInput && !autoModel) {
        throw new Error(
          '画像入力には Vision 対応モデルが必要です。LM StudioでVision対応モデルをロードしてください。'
        );
      }
      model = autoModel || 'local-model';
    } else {
      // モデルが明示指定されている場合、未ロードなら自動ロード
      try {
        const modelList = await fetchLMStudioModelList(baseUrl);
        const target = modelList.find((m) => m.id === model);
        if (target && target.state !== 'loaded' && target.state !== 'running') {
          const contextLength = settings.lmstudioContextLength || 4096;
          onChunk(`\`[モデル "${target.displayName || model}" をロード中... しばらくお待ちください]\`\n\n`);
          await loadLMStudioModelById(baseUrl, model, contextLength);
        }
      } catch (err: any) {
        // 自動ロード失敗は警告として流す（通信エラーなど）
        console.warn('auto-load check failed:', err?.message);
      }
    }

    // OpenAI互換メッセージ形式を構築
    const apiMessages: any[] = [];
    if (settings.systemPrompt) {
      apiMessages.push({ role: 'system', content: settings.systemPrompt });
    }
    for (const msg of messages) {
      if (msg.imageBase64) {
        apiMessages.push({
          role: msg.role,
          content: [
            { type: 'text', text: msg.content },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${msg.imageBase64}` } },
          ],
        });
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // MCP ツールが有効かつ LM Studio の場合にツール呼び出しループを実行
    const mcpTools = mcpManager?.getOpenAITools() ?? [];
    const hasMCPTools = mcpTools.length > 0;

    const requestStartTime = Date.now();

    try {
      if (hasMCPTools) {
        await executeWithMCPTools(
          chatEndpoint,
          model,
          apiMessages,
          mcpTools,
          options?.thinkMode ?? false,
          attemptedUrls,
          onChunk,
          onEnd,
          requestStartTime,
        );
      } else {
        const response = await fetchWithFallback(
          chatEndpoint,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              stream: true,
              enable_thinking: options?.thinkMode ?? false,
            }),
            signal: currentAbortController!.signal,
          },
          attemptedUrls,
        );

        if (!response.ok) {
          const errText = await response.text();
          if (/does not support image inputs/i.test(errText)) {
            throw new Error(
              'このモデルは画像入力に対応していません。Vision対応モデルをロードして設定してください。'
            );
          }
          throw new Error(
            `LM Studio エラー ${response.status}: ${errText.replace(/\s+/g, ' ').trim().slice(0, 200)}`
          );
        }

        await processOpenAIStream(response, onChunk, onEnd, requestStartTime);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      if (isConnectionError(err)) {
        const formatUrls = (urls: string[]) => [...new Set(urls)].map((u) => `- ${u}`).join('\n');
        throw new Error(
          `LM Studio に接続できません (${settings.lmstudioBaseUrl})\n` +
          'LM Studio を起動して「Local Server」を開始してください。\n' +
          `試行URL:\n${formatUrls(attemptedUrls)}`
        );
      }
      throw err;
    }
  }

  /**
   * ストリームを読み込み、tool_calls か最終コンテンツかを判別する。
   * - tool_calls の場合: { type: 'tool_calls', toolCalls, assistantContent } を返す
   * - 最終コンテンツの場合: onChunk/onEnd を呼び出して { type: 'content' } を返す
   */
  async function readStreamForTools(
    response: Response,
    onChunk: (chunk: string) => void,
    onEnd: (stats: ChatMessageStats) => void,
    requestStartTime: number,
    signal: AbortSignal,
  ): Promise<
    | { type: 'content' }
    | { type: 'tool_calls'; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>; assistantContent: string }
  > {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // インデックスごとにツール呼び出しを蓄積
    const tcMap = new Map<number, { id: string; name: string; args: string }>();
    let assistantContent = '';
    let finishReason: string | null = null;
    let completionTokens = 0;
    let firstChunkTime: number | undefined;

    try {
      outer: while (true) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') break outer;

          try {
            const json = JSON.parse(data);
            const choice = json?.choices?.[0];
            const delta = choice?.delta;

            // ツール呼び出しチャンクを蓄積
            if (Array.isArray(delta?.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx: number = tc.index ?? 0;
                if (!tcMap.has(idx)) {
                  tcMap.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
                }
                const entry = tcMap.get(idx)!;
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
                if (tc.function?.arguments) entry.args += tc.function.arguments;
              }
            }

            // 通常コンテンツはそのまま送出
            if (typeof delta?.content === 'string' && delta.content) {
              if (firstChunkTime === undefined) firstChunkTime = Date.now();
              completionTokens++;
              assistantContent += delta.content;
              onChunk(delta.content);
            }

            const fr = choice?.finish_reason;
            if (fr && fr !== 'null') finishReason = fr;
            const usage = json?.usage;
            if (usage?.completion_tokens) completionTokens = usage.completion_tokens;
            if (usage?.total_tokens) completionTokens = usage.total_tokens;
          } catch { /* JSON パース失敗は無視 */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // ツール呼び出しで終了した場合
    if (finishReason === 'tool_calls' && tcMap.size > 0) {
      const toolCalls = Array.from(tcMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => ({ id: tc.id, function: { name: tc.name, arguments: tc.args } }));
      return { type: 'tool_calls', toolCalls, assistantContent };
    }

    // 最終回答で終了した場合
    const endTime = Date.now();
    const elapsed = (endTime - requestStartTime) / 1000;
    const genTime = firstChunkTime ? (endTime - firstChunkTime) / 1000 : elapsed;
    onEnd({
      totalTokens: completionTokens > 0 ? completionTokens : undefined,
      timeSeconds: Math.round(elapsed * 100) / 100,
      tokensPerSec: completionTokens > 0 && genTime > 0
        ? Math.round((completionTokens / genTime) * 100) / 100 : undefined,
      finishReason: formatFinishReason(finishReason ?? undefined),
    });
    return { type: 'content' };
  }

  /** MCP ツール呼び出しループ（全ラウンドストリーミング） */
  async function executeWithMCPTools(
    chatEndpoint: string,
    model: string,
    initialMessages: any[],
    tools: any[],
    thinkMode: boolean,
    attemptedUrls: string[],
    onChunk: (chunk: string) => void,
    onEnd: (stats: ChatMessageStats) => void,
    requestStartTime: number,
  ): Promise<void> {
    const MAX_ROUNDS = 10;
    const messages = [...initialMessages];
    const signal = currentAbortController!.signal;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const response = await fetchWithFallback(
        chatEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            tools,
            tool_choice: 'auto',
            enable_thinking: thinkMode,
          }),
          signal,
        },
        attemptedUrls,
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `LM Studio エラー ${response.status}: ${errText.replace(/\s+/g, ' ').trim().slice(0, 200)}`
        );
      }

      const result = await readStreamForTools(response, onChunk, onEnd, requestStartTime, signal);

      // 最終回答が送出済みなら終了
      if (result.type === 'content') return;

      // ツール実行
      messages.push({
        role: 'assistant',
        content: result.assistantContent || null,
        tool_calls: result.toolCalls.map((tc, i) => ({
          id: tc.id || `call_${i}`,
          type: 'function',
          function: tc.function,
        })),
      });

      for (const tc of result.toolCalls) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* 無視 */ }

        let toolResult: string;
        try {
          toolResult = await mcpManager!.executeTool(tc.function.name, args);
        } catch (err: any) {
          toolResult = `エラー: ${err?.message ?? '不明なエラー'}`;
        }

        messages.push({ role: 'tool', tool_call_id: tc.id || `call_0`, content: toolResult });
      }
    }

    // 最大ラウンド到達
    onChunk('\n\n`（最大ツール呼び出し回数に達しました）`');
    const elapsed = (Date.now() - requestStartTime) / 1000;
    onEnd({ timeSeconds: Math.round(elapsed * 100) / 100 });
  }

  // ===== 公開API =====
  return {
    async streamChat(
      settings: ArisChatSettings,
      messages: ChatMessage[],
      onChunk: (chunk: string) => void,
      onEnd: (stats: ChatMessageStats) => void,
      options?: { thinkMode?: boolean },
    ): Promise<void> {
      currentAbortController = new AbortController();
      const provider = settings.provider ?? 'anthropic';

      try {
        if (provider === 'lmstudio') {
          await streamLMStudio(settings, messages, onChunk, onEnd, options);
        } else {
          await streamAnthropic(settings, messages, onChunk, onEnd);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') { onEnd({}); return; }
        throw err;
      } finally {
        currentAbortController = null;
      }
    },

    abort(): void {
      currentAbortController?.abort();
    },

    /** LM Studio のダウンロード済みモデル一覧を取得 */
    async listLMStudioModels(baseUrl: string): Promise<LMStudioModelInfo[]> {
      return fetchLMStudioModelList(normalizeBaseUrl(baseUrl));
    },

    /** LM Studio のモデルをロード */
    async loadLMStudioModel(baseUrl: string, modelId: string, contextLength: number): Promise<void> {
      return loadLMStudioModelById(normalizeBaseUrl(baseUrl), modelId, contextLength);
    },
  };
}
