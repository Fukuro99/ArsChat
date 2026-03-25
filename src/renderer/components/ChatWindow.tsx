import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { ChatMessage, ChatMessageStats, ArsChatSettings, DEFAULT_SETTINGS, getEffectiveAvatarPath, Skill } from '../../shared/types';
import MessageBubble from './MessageBubble';
import { parseInteractiveUI, parseUIUpdate } from './interactive-ui/parser';
import { BlockRenderer } from './interactive-ui/UIRenderer';
import { SandboxRenderer } from './interactive-ui/SandboxRenderer';
import { SandboxHTMLBlock } from './interactive-ui/types';
import { mergePatch, LiveUIAction } from './interactive-ui/state-manager';
import './interactive-ui/styles.css';

interface ChatWindowProps {
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  settingsVersion?: number;
  openFilePaths?: string[];
}

function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error('画像データの読み込みに失敗しました。'));
      }
    };
    reader.onerror = () => reject(new Error('画像データの読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function getClipboardImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;

  const fromFiles = Array.from(clipboardData.files || []).find((file) => file.type.startsWith('image/'));
  if (fromFiles) return fromFiles;

  const fromItems = Array.from(clipboardData.items || []).find((item) => item.type.startsWith('image/'));
  const file = fromItems?.getAsFile();
  return file || null;
}

export default function ChatWindow({ sessionId, onSessionCreated, settingsVersion = 0, openFilePaths }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImageBase64, setPendingImageBase64] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [screenWatchMode, setScreenWatchMode] = useState(false);
  const [thinkMode, setThinkMode] = useState(false);
  const [settings, setSettings] = useState<ArsChatSettings>(DEFAULT_SETTINGS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentSessionIdRef = useRef<string | null>(sessionId);
  // ストリーミングチャンクのバッファリング用 (RAF バッチ処理でレンダラー負荷を軽減)
  const pendingChunksRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  // 編集中のメッセージID
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // スキル & スラッシュコマンド候補
  const [skills, setSkills] = useState<Skill[]>([]);
  const [slashSuggestions, setSlashSuggestions] = useState<Skill[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  // 確定したスキルチップ（/trigger がチップ化された状態）
  const [activeSkillChip, setActiveSkillChip] = useState<{ skill: Skill; trigger: string } | null>(null);

  // ===== ライブUI状態管理 =====
  // uiId → 現在のstate
  const [liveUIStates, setLiveUIStates] = useState<Map<string, Record<string, any>>>(new Map());
  // uiId → 操作履歴（ローリングコンテキスト用）
  const liveUIActionsRef = useRef<Map<string, LiveUIAction[]>>(new Map());
  // サンドボックスiframeのDOMエレメント登録（パッチ転送用）
  const sandboxIframeRefs = useRef<Map<string, HTMLIFrameElement | null>>(new Map());
  // ユーザー側に表示したUIブロックの送信済みID管理
  const submittedUIBlockIdsRef = useRef<Set<string>>(new Set());
  // ライブUIアクション処理中フラグ
  const [isLiveProcessing, setIsLiveProcessing] = useState(false);
  // ライブUIアクション後のAIテキスト返答（インプレース更新）
  const [liveResponseText, setLiveResponseText] = useState<string | null>(null);

  // アクティブなライブUIブロック（プリミティブ or サンドボックス、未終了のもの）を検出
  const activeLiveUI = useMemo((): { type: 'primitive'; block: any } | { type: 'sandbox'; block: SandboxHTMLBlock } | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      const parsed = parseInteractiveUI(msg.content);

      // サンドボックスライブブロック
      const sandboxLive = parsed.sandboxBlocks.find((b) => b.mode === 'live');
      if (sandboxLive) {
        const state = liveUIStates.get(sandboxLive.id);
        if (!state || state.status !== 'finished') {
          return { type: 'sandbox', block: sandboxLive };
        }
      }

      // プリミティブライブブロック
      const primitiveLive = parsed.blocks.find((b) => b.mode === 'live');
      if (primitiveLive) {
        const state = liveUIStates.get(primitiveLive.id);
        if (!state || state.status !== 'finished') {
          return { type: 'primitive', block: primitiveLive };
        }
      }
    }
    return null;
  }, [messages, liveUIStates]);

  const activeLiveBlock = activeLiveUI?.type === 'primitive' ? activeLiveUI.block : null;
  const activeSandboxBlock = activeLiveUI?.type === 'sandbox' ? activeLiveUI.block : null;
  const isLiveMode = activeLiveUI !== null;

  // ライブUIブロックが切り替わったら返答テキストをリセット
  useEffect(() => {
    setLiveResponseText(null);
  }, [activeLiveUI?.block.id]);

  // ライブモード中の最新AIテキスト（UIブロック・updateブロック・thinkブロックを除去）
  const latestLiveAIText = useMemo(() => {
    if (!isLiveMode) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      const text = msg.content
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/```interactive-ui[\s\S]*?```/g, '')
        .replace(/```interactive-html[\s\S]*?```/g, '')
        .replace(/```interactive-ui-update[\s\S]*?```/g, '')
        .trim();
      if (text) return text;
    }
    return null;
  }, [messages, isLiveMode]);

  // ライブモード最新AIテキストのマークダウン → HTML（liveResponseText 優先）
  const liveResponseHtml = useMemo(() => {
    const src = liveResponseText ?? latestLiveAIText;
    if (!src) return null;
    try {
      return marked.parse(src) as string;
    } catch {
      return src;
    }
  }, [liveResponseText, latestLiveAIText]);

  // 設定読み込み（アバター反映のため）— settingsVersion が変わるたびに再取得
  useEffect(() => {
    window.arsChatAPI.getSettings().then(setSettings);
  }, [settingsVersion]);

  // スキル読み込みユーティリティ
  const reloadSkills = useCallback(async (personaId: string | null) => {
    const pid = personaId ?? '';
    try {
      const list = await window.arsChatAPI.listSkills(pid);
      setSkills(list);
    } catch {
      setSkills([]);
    }
  }, []);

  // settingsVersion（設定保存のたびに変化）に連動してスキルを再取得
  // settings の非同期ロードを待つため、getSettings() を改めて呼び出す
  useEffect(() => {
    window.arsChatAPI.getSettings().then((fresh) => {
      void reloadSkills(fresh.activePersonaId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsVersion]);

  // activePersonaId が変わったときも再取得
  useEffect(() => {
    void reloadSkills(settings.activePersonaId);
  }, [settings.activePersonaId, reloadSkills]);

  // スキル更新通知を受けて再読み込み
  useEffect(() => {
    const cleanup = window.arsChatAPI.onSkillsUpdated((updatedPersonaId) => {
      if (updatedPersonaId === (settings.activePersonaId ?? '')) {
        void reloadSkills(settings.activePersonaId);
      }
    });
    return cleanup;
  }, [settings.activePersonaId, reloadSkills]);

  useEffect(() => {
    // メインプロセスからのナビゲーション時も再取得
    const cleanup = window.arsChatAPI.onNavigate((page) => {
      if (page === 'chat') {
        window.arsChatAPI.getSettings().then(setSettings);
      }
    });
    return cleanup;
  }, []);

  // セッション読み込み
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
    if (sessionId) {
      window.arsChatAPI.getSession(sessionId).then((session) => {
        if (session) {
          setMessages(session.messages);
        }
      });
    } else {
      setMessages([]);
    }
  }, [sessionId]);

  // 他ウィンドウ（ウィジェット等）でセッションが更新されたら再読み込み
  useEffect(() => {
    const cleanup = window.arsChatAPI.onSessionUpdated?.((updatedId) => {
      if (updatedId === currentSessionIdRef.current && !isStreaming) {
        window.arsChatAPI.getSession(updatedId).then((session) => {
          if (session) setMessages(session.messages);
        });
      }
    });
    return () => cleanup?.();
  }, [isStreaming]);

  // 自動スクロール
  // ストリーミング中は 'auto'（即時）にすることで smooth アニメーションの積み重ねによるジャンクを防ぐ
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, streamingContent, isStreaming]);

  // ストリーミングイベント登録
  useEffect(() => {
    const cleanupChunk = window.arsChatAPI.onStreamChunk((chunk) => {
      // チャンクをバッファに追加し、RAF で1フレームに1回だけ state を更新する。
      // これにより高速なトークン生成時のレンダラースレッド過負荷(マウスがくかく)を防ぐ。
      pendingChunksRef.current += chunk;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          const buffered = pendingChunksRef.current;
          pendingChunksRef.current = '';
          rafIdRef.current = null;
          if (buffered) {
            setStreamingContent((prev) => prev + buffered);
          }
        });
      }
    });

    const cleanupEnd = window.arsChatAPI.onStreamEnd((stats: ChatMessageStats) => {
      // ストリーム終了時: 残ったバッファを即座にフラッシュ
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      const remaining = pendingChunksRef.current;
      pendingChunksRef.current = '';

      setStreamingContent((prev) => {
        const full = prev + remaining;
        if (full) {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: full,
            timestamp: Date.now(),
            stats: Object.keys(stats).length > 0 ? stats : undefined,
          };
          setMessages((msgs) => {
            const newMsgs = [...msgs, assistantMsg];
            saveSession(newMsgs);
            return newMsgs;
          });
        }
        return '';
      });
      setIsStreaming(false);
    });

    const cleanupError = window.arsChatAPI.onStreamError((err) => {
      // エラー時もバッファをリセット
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingChunksRef.current = '';
      setError(err);
      setIsStreaming(false);
      setStreamingContent('');
    });

    return () => {
      cleanupChunk();
      cleanupEnd();
      cleanupError();
      // アンマウント時に残った RAF をキャンセル
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingChunksRef.current = '';
    };
  }, []);

  useEffect(() => {
    const cleanupCapture = window.arsChatAPI.onCapturedImage((imageBase64) => {
      setPendingImageBase64(imageBase64);
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    });
    return () => {
      cleanupCapture();
    };
  }, []);

  // セッション保存
  const saveSession = useCallback(async (msgs: ChatMessage[]) => {
    let sid = currentSessionIdRef.current;
    if (!sid) {
      sid = crypto.randomUUID();
      currentSessionIdRef.current = sid;
      onSessionCreated(sid);
    }

    const title = msgs[0]?.content.slice(0, 50) || '新しい会話';
    await window.arsChatAPI.createSession({
      id: sid,
      title,
      messages: msgs,
      createdAt: msgs[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
    });
  }, [onSessionCreated]);

  // ===== メッセージアクション =====

  /** コピー */
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
  }, []);

  /** 削除 */
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const newMsgs = prev.filter((m) => m.id !== messageId);
      saveSession(newMsgs);
      return newMsgs;
    });
  }, [saveSession]);

  /** 再生成（このアシスタントメッセージ以降を削除して再送） */
  const handleRegenerateMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const truncated = prev.slice(0, idx); // このメッセージを除いたそれ以前
      setIsStreaming(true);
      setStreamingContent('');
      window.arsChatAPI.sendMessage(truncated, currentSessionIdRef.current || '', { thinkMode, openFilePaths });
      return truncated;
    });
  }, [thinkMode]);

  /** 続きを生成 */
  const handleContinueMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const continueMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: '続けてください',
        timestamp: Date.now(),
      };
      const newMsgs = [...prev.slice(0, idx + 1), continueMsg];
      setIsStreaming(true);
      setStreamingContent('');
      window.arsChatAPI.sendMessage(newMsgs, currentSessionIdRef.current || '', { thinkMode, openFilePaths });
      return newMsgs;
    });
  }, [thinkMode]);

  /** ブランチ（この時点までで新セッションを作成） */
  const handleBranchMessage = useCallback(async (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const branchedMsgs = messages.slice(0, idx + 1);
    const newSessionId = crypto.randomUUID();
    const title = branchedMsgs[0]?.content.slice(0, 50) || '分岐した会話';
    await window.arsChatAPI.createSession({
      id: newSessionId,
      title: `[分岐] ${title}`,
      messages: branchedMsgs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    onSessionCreated(newSessionId);
  }, [messages, onSessionCreated]);

  /** 編集開始 */
  const handleEditStart = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);

  /** 編集保存 */
  const handleEditSave = useCallback((messageId: string, newContent: string) => {
    setEditingMessageId(null);
    setMessages((prev) => {
      const newMsgs = prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m);
      saveSession(newMsgs);
      return newMsgs;
    });
  }, [saveSession]);

  /** 編集キャンセル */
  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  /** Interactive UIアクションハンドラ（defaultモード） */
  const handleInteractiveUIAction = useCallback((uiId: string, action: string, data: Record<string, any>) => {
    // 送信済みとして記録
    submittedUIBlockIdsRef.current.add(uiId);

    // 構造化データをユーザーメッセージとして整形（チャットには表示しないが文脈として保持）
    const responseContent = `[interactive-ui-response]\n${JSON.stringify({ ui_id: uiId, action, data })}`;
    const hiddenUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: responseContent,
      timestamp: Date.now(),
    };
    // messagesに追加（AIへの文脈のため）、ただし描画はフィルタして非表示にする
    const newMessages = [...messages, hiddenUserMsg];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingContent('');
    window.arsChatAPI.sendMessage(newMessages, currentSessionIdRef.current || '', { thinkMode, openFilePaths });
  }, [messages, thinkMode]);

  /** ライブUIのローカルstate更新（local: true アクション用・AI送信なし） */
  const handleLiveLocalStateChange = useCallback((uiId: string, keyPath: string, value: any) => {
    setLiveUIStates((prev) => {
      const next = new Map(prev);
      const current = next.get(uiId) ?? {};
      // ドット区切りキーパスに対応した浅い更新
      const keys = typeof keyPath === 'string' ? keyPath.split('.') : [String(keyPath)];
      const newState = { ...current };
      let obj: Record<string, any> = newState;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...(obj[keys[i]] ?? {}) };
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      next.set(uiId, newState);
      return next;
    });
  }, []);

  /** ライブUIのstate更新 */
  const setLiveUIState = useCallback((uiId: string, newState: Record<string, any>) => {
    setLiveUIStates((prev) => {
      const next = new Map(prev);
      next.set(uiId, newState);
      return next;
    });
  }, []);

  const handleSandboxIframeReady = useCallback((uiId: string, iframe: HTMLIFrameElement | null) => {
    if (iframe) {
      sandboxIframeRefs.current.set(uiId, iframe);
    } else {
      sandboxIframeRefs.current.delete(uiId);
    }
  }, []);

  /**
   * ローリングコンテキストを構築する。
   * 元の会話コンテキスト（最初のメッセージまで）＋現在のstate＋直近の操作履歴。
   */
  const buildLiveUIContext = useCallback((
    uiId: string,
    action: string,
    data: Record<string, any>,
    currentState: Record<string, any>,
  ): ChatMessage[] => {
    const contextMessages: ChatMessage[] = [];

    // 元の会話から最初のユーザーメッセージとAI応答（UIブロックを含む）を取り込む
    // interactive-ui-response は含めない（サイレントなので）
    const baseMessages = messages.filter(
      (m) => !m.content.startsWith('[interactive-ui-response]')
    );
    // 最大6メッセージ（システムプロンプトが長くならないように）
    const recentBaseMessages = baseMessages.slice(-6);
    for (const m of recentBaseMessages) {
      contextMessages.push({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      });
    }

    // 現在のstate（サマリ）を追加
    contextMessages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: `[Live UI State]\n${JSON.stringify({ ui_id: uiId, current_state: currentState })}`,
      timestamp: Date.now(),
    });

    // 直近の操作履歴（最新6手）を追加
    const actions = liveUIActionsRef.current.get(uiId) || [];
    const recentActions = actions.slice(-6);
    for (const a of recentActions) {
      contextMessages.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: JSON.stringify({ _type: 'live_ui_action', ui_id: a.uiId, action: a.action, data: a.data }),
        timestamp: a.timestamp,
      });
    }

    // 今回のアクション
    contextMessages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: JSON.stringify({ _type: 'live_ui_action', ui_id: uiId, action, data }),
      timestamp: Date.now(),
    });

    return contextMessages;
  }, [messages]);

  /** ライブUIアクションハンドラ（liveモード） */
  const handleLiveUIAction = useCallback(async (
    uiId: string,
    action: string,
    data: Record<string, any>,
    currentState: Record<string, any>,
  ) => {
    // 1. 楽観的更新（UIのstateを即座に更新）
    // アクション情報をstateに反映（例: buttonクリック等）
    const optimisticState = { ...currentState };
    setLiveUIState(uiId, optimisticState);

    // 操作履歴を記録
    const newAction: LiveUIAction = { uiId, action, data, timestamp: Date.now() };
    const prevActions = liveUIActionsRef.current.get(uiId) || [];
    liveUIActionsRef.current.set(uiId, [...prevActions, newAction]);

    // 2. サイレントメッセージを構築
    const contextMessages = buildLiveUIContext(uiId, action, data, currentState);

    setIsLiveProcessing(true);
    try {
      // 3. AIにサイレント送信
      const response = await window.arsChatAPI.sendSilentMessage(
        contextMessages,
        currentSessionIdRef.current || '',
      );

      if (response.error) {
        console.error('[LiveUI] サイレント送信エラー:', response.error);
        return;
      }

      const responseContent = response.content || '';

      // 4. interactive-ui-update を抽出してstate更新
      const updatePatch = parseUIUpdate(responseContent);
      if (updatePatch && updatePatch.id === uiId) {
        const latestState = liveUIStates.get(uiId) ?? currentState;
        const newState = mergePatch(latestState, updatePatch.patch);
        setLiveUIState(uiId, newState);

        // サンドボックスiframeにもパッチを転送（サンドボックスブロックの場合）
        const sandboxIframe = sandboxIframeRefs.current.get(uiId);
        if (sandboxIframe?.contentWindow) {
          sandboxIframe.contentWindow.postMessage(
            { type: 'interactive-ui-update', uiId, patch: updatePatch.patch },
            '*',
          );
        }
      }

      // 5. 通常テキスト部分があれば固定ゾーンにインプレース表示（チャットに追加しない）
      const textContent = responseContent
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/```interactive-ui-update[\s\S]*?```/g, '')
        .trim();

      if (textContent) {
        setLiveResponseText(textContent);
      }
    } catch (err: any) {
      console.error('[LiveUI] サイレント送信に失敗しました:', err?.message);
    } finally {
      setIsLiveProcessing(false);
    }
  }, [buildLiveUIContext, liveUIStates, saveSession, setLiveUIState]);

  // メッセージ送信
  const handleSend = useCallback(async () => {
    // チップ + テキストを合わせた表示用テキスト（UIに表示する内容）
    const restText = input.trim();
    const displayText = activeSkillChip
      ? [activeSkillChip.trigger, restText].filter(Boolean).join(' ')
      : restText;

    if ((!displayText && !pendingImageBase64) || isStreaming) return;

    setError(null);

    // 画面監視モードの場合、送信時にスクリーンキャプチャを自動添付
    let imageBase64 = pendingImageBase64 || undefined;
    if (screenWatchMode && !imageBase64) {
      try {
        imageBase64 = await window.arsChatAPI.captureScreen();
      } catch {
        // キャプチャ失敗時はテキストのみ送信
      }
    }

    // スキルチップが確定済みならそのスキルのコンテンツを注入
    let messageContent = displayText;
    let displayContent: string | undefined;
    if (activeSkillChip) {
      const personaId = settings.activePersonaId ?? '';
      const skillContent = await window.arsChatAPI.getSkillContent(personaId, activeSkillChip.skill.id);
      if (skillContent) {
        messageContent = skillContent + (restText ? `\n\n---\n\n${restText}` : '');
        displayContent = displayText;
      }
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageContent,
      displayContent,
      imageBase64,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setActiveSkillChip(null);
    setPendingImageBase64(null);
    setSlashSuggestions([]);
    setIsStreaming(true);
    setStreamingContent('');

    // API送信
    window.arsChatAPI.sendMessage(newMessages, currentSessionIdRef.current || '', { thinkMode, openFilePaths });
  }, [activeSkillChip, input, isStreaming, messages, pendingImageBase64, screenWatchMode, settings.activePersonaId, thinkMode]);

  const handleCaptureScreen = useCallback(async () => {
    if (isStreaming) return;
    setError(null);
    try {
      const imageBase64 = await window.arsChatAPI.captureScreen();
      setPendingImageBase64(imageBase64);
    } catch (err: any) {
      setError(err?.message || 'スクリーンキャプチャに失敗しました。');
    }
  }, [isStreaming]);

  // 範囲キャプチャ（オーバーレイ方式）
  const handleRegionCapture = useCallback(async () => {
    if (isStreaming) return;
    setError(null);
    try {
      const imageBase64 = await window.arsChatAPI.captureRegion();
      if (imageBase64) {
        setPendingImageBase64(imageBase64);
      }
    } catch (err: any) {
      setError(err?.message || '範囲キャプチャに失敗しました。');
    }
  }, [isStreaming]);

  const handleAttachImageFromFile = useCallback(async (file: Blob) => {
    try {
      const base64 = await readFileAsBase64(file);
      setPendingImageBase64(base64);
      setError(null);
    } catch (err: any) {
      setError(err?.message || '画像の貼り付けに失敗しました。');
    }
  }, []);

  const attachImageFromSystemClipboard = useCallback(async (showNotFoundError: boolean): Promise<boolean> => {
    try {
      const base64 = await window.arsChatAPI.readClipboardImage();
      if (base64) {
        setPendingImageBase64(base64);
        setError(null);
        return true;
      }
      if (showNotFoundError) {
        setError('クリップボードに画像がありません。画像をコピーしてから再度お試しください。');
      }
      return false;
    } catch (err: any) {
      setError(err?.message || 'クリップボード画像の取得に失敗しました。');
      return false;
    }
  }, []);

  const attachImageFromClipboardData = useCallback((clipboardData: DataTransfer | null): boolean => {
    const file = getClipboardImageFile(clipboardData);
    if (!file) return false;
    void handleAttachImageFromFile(file);
    return true;
  }, [handleAttachImageFromFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isStreaming) return;
    if (attachImageFromClipboardData(e.clipboardData)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    void attachImageFromSystemClipboard(false);
  }, [attachImageFromClipboardData, attachImageFromSystemClipboard, isStreaming]);

  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || isStreaming) return;
      if (attachImageFromClipboardData(e.clipboardData)) {
        e.preventDefault();
        return;
      }
      void attachImageFromSystemClipboard(false);
    };

    window.addEventListener('paste', onWindowPaste);
    return () => {
      window.removeEventListener('paste', onWindowPaste);
    };
  }, [attachImageFromClipboardData, attachImageFromSystemClipboard, isStreaming]);

  // キー入力
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // チップ確定済み & 入力欄が空の状態でBackspace → チップを解除してトリガーをテキストに戻す
    if (activeSkillChip && e.key === 'Backspace' && input === '') {
      e.preventDefault();
      setInput(activeSkillChip.trigger);
      setActiveSkillChip(null);
      return;
    }
    // スラッシュコマンド候補のキーボードナビゲーション
    if (slashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((i) => Math.min(i + 1, slashSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectSuggestion(slashSuggestions[suggestionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashSuggestions([]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // スキルをチップとして確定する
  const commitSkillChip = useCallback((skill: Skill, restText = '') => {
    const trigger = skill.trigger || `/${skill.id}`;
    setActiveSkillChip({ skill, trigger });
    setInput(restText);
    setSlashSuggestions([]);
    setSuggestionIndex(0);
    requestAnimationFrame(() => {
      const ta = inputRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }, []);

  // スラッシュコマンド候補の選択 → 即チップ化
  const selectSuggestion = useCallback((skill: Skill) => {
    commitSkillChip(skill, '');
  }, [commitSkillChip]);

  // テキストエリア自動リサイズ
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;

    // チップが未確定の場合のみスラッシュコマンドを処理
    if (!activeSkillChip && value.startsWith('/') && !value.includes('\n')) {
      const spaceIdx = value.indexOf(' ');
      if (spaceIdx < 0) {
        // スペース前 → 候補ドロップダウン表示
        const query = value.slice(1).toLowerCase();
        const filtered = skills.filter((s) => {
          const t = (s.trigger || `/${s.id}`).slice(1).toLowerCase();
          return t.startsWith(query) || s.name.toLowerCase().includes(query);
        });
        setSlashSuggestions(filtered);
        setSuggestionIndex(0);
        setInput(value);
      } else {
        // スペース入力 → 完全一致するスキルがあればチップ化
        const trigger = value.slice(0, spaceIdx);
        const matched = skills.find((s) => s.trigger === trigger || `/${s.id}` === trigger);
        if (matched) {
          commitSkillChip(matched, value.slice(spaceIdx + 1));
          return;
        }
        setSlashSuggestions([]);
        setInput(value);
      }
    } else {
      setSlashSuggestions([]);
      setInput(value);
    }

    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">

      {/* ===== チャット履歴（通常モード・ライブモード共通） ===== */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="max-w-3xl mx-auto px-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-aria-primary/20 flex items-center justify-center mb-4">
              <span className="text-2xl font-bold text-aria-primary">A</span>
            </div>
            <h2 className="text-lg font-semibold text-aria-text mb-2">Ars へようこそ</h2>
            <p className="text-sm text-aria-text-muted max-w-xs">
              何でも聞いてください。テキストで質問するか、画面キャプチャを添付して質問できます。
            </p>
          </div>
        )}

        {messages.map((msg) => {
          // [interactive-ui-response]メッセージはAIへの文脈用のため描画しない
          if (msg.content.startsWith('[interactive-ui-response]')) return null;

          if (msg.role === 'assistant') {
            // アシスタントメッセージ本体 + ユーザー側インタラクティブUIブロック
            const parsed = parseInteractiveUI(msg.content);
            const userSideBlocks = parsed.blocks.filter((b) => b.mode !== 'live');
            const userSideSandboxBlocks = parsed.sandboxBlocks.filter((b) => b.mode !== 'live');

            return (
              <React.Fragment key={msg.id}>
                {/* アシスタントメッセージ（interactive-uiブロックは非表示） */}
                <MessageBubble
                  message={msg}
                  showThinking={thinkMode}
                  isEditing={editingMessageId === msg.id}
                  avatarSrc={getEffectiveAvatarPath(settings)}
                  iconSize={settings.chatIconSize ?? 32}
                  onCopy={() => handleCopyMessage(msg.content)}
                  onDelete={() => handleDeleteMessage(msg.id)}
                  onRegenerate={() => handleRegenerateMessage(msg.id)}
                  onContinue={() => handleContinueMessage(msg.id)}
                  onBranch={() => { void handleBranchMessage(msg.id); }}
                  onEditStart={() => handleEditStart(msg.id)}
                  onEditSave={(newContent) => handleEditSave(msg.id, newContent)}
                  onEditCancel={handleEditCancel}
                  onLiveUIAction={handleLiveUIAction}
                  liveUIStates={liveUIStates}
                  hideLiveUIBlocks={isLiveMode}
                  hideInteractiveUIBlocks={true}
                  onSandboxIframeReady={handleSandboxIframeReady}
                />

                {/* ユーザー側: defaultモードのインタラクティブUIブロック */}
                {userSideBlocks.map((block) => (
                  <div key={block.id} className="flex gap-2.5 flex-row-reverse">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-emerald-500/20 text-emerald-400">
                      U
                    </div>
                    <div className="max-w-[85%]">
                      <div className="rounded-2xl px-2 py-2 bg-aria-primary/15 text-aria-text rounded-br-md">
                        <BlockRenderer
                          key={block.id}
                          block={block}
                          onSubmit={(uiId, action, data) => handleInteractiveUIAction(uiId, action, data)}
                          onAction={(uiId, actionId, data) => handleInteractiveUIAction(uiId, actionId, data || {})}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {/* ユーザー側: defaultモードのサンドボックスHTMLブロック */}
                {userSideSandboxBlocks.map((sandboxBlock) => (
                  <div key={sandboxBlock.id} className="flex gap-2.5 flex-row-reverse">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-emerald-500/20 text-emerald-400">
                      U
                    </div>
                    <div className="max-w-[85%] w-full">
                      <div className="rounded-2xl overflow-hidden bg-aria-primary/15 rounded-br-md">
                        <SandboxRenderer
                          block={sandboxBlock}
                          onAction={(uiId, action, data) => handleInteractiveUIAction(uiId, action, data)}
                          onIframeReady={handleSandboxIframeReady}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            );
          }

          // ユーザーメッセージ
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              showThinking={thinkMode}
              isEditing={editingMessageId === msg.id}
              avatarSrc={getEffectiveAvatarPath(settings)}
              iconSize={settings.chatIconSize ?? 32}
              onCopy={() => handleCopyMessage(msg.content)}
              onDelete={() => handleDeleteMessage(msg.id)}
              onBranch={() => { void handleBranchMessage(msg.id); }}
              onEditStart={() => handleEditStart(msg.id)}
              onEditSave={(newContent) => handleEditSave(msg.id, newContent)}
              onEditCancel={handleEditCancel}
            />
          );
        })}

        {/* ストリーミング中の表示 */}
        {isStreaming && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            }}
            isStreaming
            showThinking={thinkMode}
            avatarSrc={getEffectiveAvatarPath(settings)}
            iconSize={settings.chatIconSize ?? 32}
            onSandboxIframeReady={handleSandboxIframeReady}
          />
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mx-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
        </div>{/* max-w container end */}
      </div>

      {/* ===== ライブモード: 固定UIゾーン（入力欄の上に固定） ===== */}
      {isLiveMode && (
        <div className="shrink-0 border-t border-aria-primary/40 bg-aria-bg-light">
          <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
            {/* プリミティブライブUIブロック */}
            {activeLiveBlock && (
              <BlockRenderer
                block={activeLiveBlock}
                onSubmit={(uiId, action, data) => handleInteractiveUIAction(uiId, action, data)}
                onAction={(uiId, actionId, data) => {
                  const currentState = liveUIStates.get(activeLiveBlock.id) ?? activeLiveBlock.state ?? {};
                  void handleLiveUIAction(uiId, actionId, data || {}, currentState);
                }}
                onLiveAction={handleLiveUIAction}
                onLocalStateChange={handleLiveLocalStateChange}
                liveState={liveUIStates.get(activeLiveBlock.id)}
              />
            )}

            {/* サンドボックスライブUIブロック */}
            {activeSandboxBlock && (
              <SandboxRenderer
                block={activeSandboxBlock}
                onAction={(uiId, action, data) => {
                  const currentState = liveUIStates.get(activeSandboxBlock.id) ?? {};
                  void handleLiveUIAction(uiId, action, data, currentState);
                }}
                onIframeReady={handleSandboxIframeReady}
                isFinished={liveUIStates.get(activeSandboxBlock.id)?.status === 'finished'}
              />
            )}

            {/* AIの最新返答（インプレース更新） */}
            <div className="mt-2 min-h-[1.5rem]">
              {isLiveProcessing ? (
                <div className="flex items-center gap-1.5 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-aria-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-aria-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-aria-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : liveResponseHtml ? (
                <div
                  className="text-sm text-aria-text-muted leading-relaxed markdown-body"
                  dangerouslySetInnerHTML={{ __html: liveResponseHtml }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 入力エリア（常に下部・全幅） */}
      <div className="shrink-0 border-t border-aria-border bg-aria-bg-light p-3">
        <div className="max-w-3xl mx-auto">
        {/* 添付画像プレビュー */}
        {pendingImageBase64 && (
          <div className="mb-2 p-2 bg-aria-surface rounded-xl border border-aria-border">
            <div className="flex items-start justify-between gap-2">
              <img
                src={`data:image/png;base64,${pendingImageBase64}`}
                alt="キャプチャ画像"
                className="rounded-lg max-w-full max-h-36 object-contain"
              />
              <button
                onClick={() => setPendingImageBase64(null)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-aria-text-muted hover:text-red-400 transition-colors"
                title="添付を削除"
                disabled={isStreaming}
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 入力カード + 候補ドロップダウンのラッパー（relative で浮かせる） */}
        <div className="relative">

        {/* スラッシュコマンド候補ドロップダウン（入力欄の真上に絶対配置） */}
        {slashSuggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-aria-surface border border-aria-border rounded-xl overflow-hidden shadow-xl z-50">
            {slashSuggestions.map((skill, idx) => (
              <button
                key={skill.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(skill);
                }}
                className={`w-full flex items-start gap-3 px-3 py-2 text-left transition-colors ${
                  idx === suggestionIndex
                    ? 'bg-aria-primary/20 text-aria-text'
                    : 'hover:bg-aria-border/40 text-aria-text'
                }`}
              >
                <span className="shrink-0 text-xs font-mono text-aria-primary mt-0.5 pt-px">
                  {skill.trigger || `/${skill.id}`}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium truncate">{skill.name}</span>
                  <span className="block text-xs text-aria-text-muted truncate">{skill.description}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* カード型入力コンテナ */}
        <div className="flex flex-col bg-aria-surface border border-aria-border rounded-2xl focus-within:border-aria-primary transition-colors overflow-hidden">
          {/* スキルチップ行（確定済みのスラッシュコマンド） */}
          {activeSkillChip && (
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-0">
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                  boxShadow: '0 0 8px rgba(6,182,212,0.45)',
                }}
              >
                {activeSkillChip.trigger}
              </span>
              <span className="text-xs text-aria-text-muted truncate flex-1">{activeSkillChip.skill.name}</span>
              <button
                type="button"
                onClick={() => { setInput(activeSkillChip.trigger); setActiveSkillChip(null); }}
                className="text-aria-text-muted hover:text-aria-text text-xs leading-none px-1"
                title="スキルを解除"
              >
                ✕
              </button>
            </div>
          )}
          {/* テキストエリア（上段・全幅） */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={screenWatchMode ? "メッセージを入力... (画面監視ON)" : "メッセージを入力..."}
            rows={3}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none"
            style={{ maxHeight: '200px' }}
            disabled={isStreaming}
          />

          {/* ツールバー（下段） */}
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            {/* 左側：モードトグル・キャプチャ系 */}
            <div className="flex items-center gap-1 flex-1">
              {/* 画面監視モードトグル */}
              <button
                onClick={() => setScreenWatchMode(!screenWatchMode)}
                className={`toolbar-btn ${screenWatchMode ? 'toolbar-btn-active-blue' : ''}`}
                title={screenWatchMode ? '画面監視モード ON' : '画面監視モード OFF'}
                disabled={isStreaming}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M5 14h6M8 11v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  {screenWatchMode && <circle cx="12" cy="5" r="2" fill="currentColor" />}
                </svg>
                <span>Watch</span>
              </button>

              {/* Thinkモードトグル */}
              <button
                onClick={() => setThinkMode(!thinkMode)}
                className={`toolbar-btn ${thinkMode ? 'toolbar-btn-active-amber' : ''}`}
                title={thinkMode ? 'Thinkモード ON' : 'Thinkモード OFF'}
                disabled={isStreaming}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M6 10.5c0 1.5 0.5 2.5 2 3M10 10.5c0 1.5-0.5 2.5-2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M6.5 14h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  {thinkMode && <circle cx="8" cy="6" r="1.5" fill="currentColor" />}
                </svg>
                <span>Think</span>
              </button>

              {/* 区切り */}
              <div className="w-px h-4 bg-aria-border mx-1" />

              {/* 全画面キャプチャ */}
              <button
                onClick={handleCaptureScreen}
                className="toolbar-icon-btn"
                title="全画面キャプチャを添付"
                disabled={isStreaming}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 4.2l.7-1.2h2.6L10 4.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="8" cy="8.5" r="2.1" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </button>

              {/* 範囲キャプチャ */}
              <button
                onClick={() => { void handleRegionCapture(); }}
                className="toolbar-icon-btn"
                title="範囲キャプチャを添付"
                disabled={isStreaming}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
                  <rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor" opacity="0.25" />
                </svg>
              </button>

              {/* クリップボード画像 */}
              <button
                onClick={() => { void attachImageFromSystemClipboard(true); }}
                className="toolbar-icon-btn"
                title="クリップボード画像を添付"
                disabled={isStreaming}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="4" y="3" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 3.2V2.6c0-.6.5-1.1 1.1-1.1h1.8c.6 0 1.1.5 1.1 1.1v.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M6 7h4M6 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* 右側：送信・停止ボタン */}
            {isStreaming ? (
              <button
                onClick={() => window.arsChatAPI.abortChat()}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                title="停止"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="2"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={() => { void handleSend(); }}
                disabled={!input.trim() && !activeSkillChip && !pendingImageBase64}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-aria-primary text-white hover:bg-aria-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="送信 (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8L2 2l2 6-2 6z" fill="currentColor"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        </div>{/* relative ラッパー end */}
        </div>{/* max-w container end */}
      </div>
    </div>
  );
}
