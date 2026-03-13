import React, { useState, useEffect, useCallback } from 'react';
import { ArisChatSettings, DEFAULT_SETTINGS, LMStudioModelInfo, MCPConfig, MCPServerConfig, MCPServerStatus } from '../../shared/types';

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const [settings, setSettings] = useState<ArisChatSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  // LM Studio モデル関連
  const [lmsModels, setLmsModels] = useState<LMStudioModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);

  // MCP 関連
  const [mcpConfig, setMcpConfig] = useState<MCPConfig>({ servers: [] });
  const [mcpStatus, setMcpStatus] = useState<MCPServerStatus[]>([]);
  const [isSavingMCP, setIsSavingMCP] = useState(false);
  const [mcpSaveMsg, setMcpSaveMsg] = useState<string | null>(null);
  // 新規追加フォームの表示制御
  const [showAddServer, setShowAddServer] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // フォームの状態
  const emptyForm = (): MCPServerConfig => ({
    name: '', type: 'stdio', command: '', args: [], env: {}, url: '', headers: {}, enabled: true,
  });
  const [serverForm, setServerForm] = useState<MCPServerConfig>(emptyForm());
  const [formArgsText, setFormArgsText] = useState('');
  const [formEnvText, setFormEnvText] = useState('');
  const [formHeadersText, setFormHeadersText] = useState('');

  useEffect(() => {
    window.arisChatAPI.getSettings().then(setSettings);
    // MCP 設定と状態を取得
    window.arisChatAPI.getMCPConfig().then(setMcpConfig);
    window.arisChatAPI.getMCPStatus().then(setMcpStatus);
  }, []);

  const selectedModel = lmsModels.find((m) => m.id === settings.lmstudioModel);
  const maxContext = selectedModel?.maxContextLength ?? 32768;

  const handleFetchModels = useCallback(async () => {
    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const models = await window.arisChatAPI.listLMStudioModels();
      setLmsModels(models);
      // 現在選択中のモデルがリストにない場合、最初のモデルを選択
      if (models.length > 0 && !models.find((m) => m.id === settings.lmstudioModel)) {
        await updateSetting('lmstudioModel', models[0].id);
      }
    } catch (err: any) {
      setFetchError(err?.message ?? 'モデル一覧の取得に失敗しました');
    } finally {
      setIsFetchingModels(false);
    }
  }, [settings.lmstudioModel]);

  const handleLoadModel = useCallback(async () => {
    if (!settings.lmstudioModel) return;
    setIsLoadingModel(true);
    setLoadStatus('ロード中...');
    try {
      await window.arisChatAPI.loadLMStudioModel(settings.lmstudioModel, settings.lmstudioContextLength);
      setLoadStatus('ロード完了！');
      // 状態を更新するためにモデル一覧を再取得
      const models = await window.arisChatAPI.listLMStudioModels();
      setLmsModels(models);
      setTimeout(() => setLoadStatus(null), 3000);
    } catch (err: any) {
      setLoadStatus(`エラー: ${err?.message ?? 'ロードに失敗しました'}`);
      setTimeout(() => setLoadStatus(null), 5000);
    } finally {
      setIsLoadingModel(false);
    }
  }, [settings.lmstudioModel, settings.lmstudioContextLength]);

  const updateSetting = async <K extends keyof ArisChatSettings>(key: K, value: ArisChatSettings[K]) => {
    const updated = await window.arisChatAPI.setSettings({ [key]: value });
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleIconSelect = async (target: 'app' | 'tray' | 'avatar') => {
    const path = await window.arisChatAPI.selectIcon(target);
    if (path) {
      const keyMap = {
        app: 'customIconPath',
        tray: 'customTrayIconPath',
        avatar: 'customAvatarPath',
      } as const;
      updateSetting(keyMap[target], path);
    }
  };

  // ===== MCP ハンドラー =====

  const openAddForm = () => {
    setServerForm(emptyForm());
    setFormArgsText('');
    setFormEnvText('');
    setFormHeadersText('');
    setEditingIndex(null);
    setShowAddServer(true);
  };

  const openEditForm = (idx: number) => {
    const s = mcpConfig.servers[idx];
    setServerForm({ ...s });
    setFormArgsText((s.args ?? []).join('\n'));
    setFormEnvText(Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'));
    setFormHeadersText(Object.entries(s.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'));
    setEditingIndex(idx);
    setShowAddServer(true);
  };

  const cancelForm = () => {
    setShowAddServer(false);
    setEditingIndex(null);
  };

  const parseArgsText = (text: string): string[] =>
    text.split('\n').map((l) => l.trim()).filter(Boolean);

  const parseEnvText = (text: string): Record<string, string> => {
    const env: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return env;
  };

  const parseHeadersText = (text: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    return headers;
  };

  const handleSaveServer = () => {
    if (!serverForm.name.trim()) return;
    const updated = { ...serverForm, args: parseArgsText(formArgsText), env: parseEnvText(formEnvText), headers: parseHeadersText(formHeadersText) };
    const servers = [...mcpConfig.servers];
    if (editingIndex !== null) {
      servers[editingIndex] = updated;
    } else {
      servers.push(updated);
    }
    setMcpConfig({ servers });
    setShowAddServer(false);
    setEditingIndex(null);
  };

  const handleDeleteServer = (idx: number) => {
    const servers = mcpConfig.servers.filter((_, i) => i !== idx);
    setMcpConfig({ servers });
  };

  const handleToggleServer = async (idx: number) => {
    const servers = mcpConfig.servers.map((s, i) =>
      i === idx ? { ...s, enabled: !s.enabled } : s
    );
    const newConfig = { servers };
    setMcpConfig(newConfig);
    try {
      const status = await window.arisChatAPI.saveMCPConfig(newConfig);
      setMcpStatus(status);
    } catch (err: any) {
      console.error('MCP toggle save error:', err?.message);
    }
  };

  const handleSaveMCP = useCallback(async () => {
    setIsSavingMCP(true);
    setMcpSaveMsg(null);
    try {
      const status = await window.arisChatAPI.saveMCPConfig(mcpConfig);
      setMcpStatus(status);
      setMcpSaveMsg('保存・接続完了');
      setTimeout(() => setMcpSaveMsg(null), 3000);
    } catch (err: any) {
      setMcpSaveMsg(`エラー: ${err?.message ?? '保存に失敗しました'}`);
      setTimeout(() => setMcpSaveMsg(null), 5000);
    } finally {
      setIsSavingMCP(false);
    }
  }, [mcpConfig]);

  const handleReconnectMCP = useCallback(async () => {
    setIsSavingMCP(true);
    try {
      const status = await window.arisChatAPI.reconnectMCP();
      setMcpStatus(status);
      setMcpSaveMsg('再接続完了');
      setTimeout(() => setMcpSaveMsg(null), 3000);
    } catch (err: any) {
      setMcpSaveMsg(`エラー: ${err?.message ?? '再接続に失敗しました'}`);
    } finally {
      setIsSavingMCP(false);
    }
  }, []);

  const handleIconReset = (target: 'app' | 'tray' | 'avatar') => {
    const keyMap = {
      app: 'customIconPath',
      tray: 'customTrayIconPath',
      avatar: 'customAvatarPath',
    } as const;
    updateSetting(keyMap[target], null);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto p-6 space-y-8">
        {/* ヘッダー */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-aria-surface transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-aria-text"/>
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-aria-text">設定</h1>
          {saved && (
            <span className="ml-auto text-xs text-emerald-400 animate-fade-in">保存しました</span>
          )}
        </div>

        {/* === AI設定 === */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">AI設定</h2>

          {/* プロバイダー選択 */}
          <div className="space-y-2">
            <label className="text-sm text-aria-text">AIプロバイダー</label>
            <div className="flex gap-2">
              {(['anthropic', 'lmstudio'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => updateSetting('provider', p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    settings.provider === p
                      ? 'bg-aria-primary text-white'
                      : 'bg-aria-surface text-aria-text-muted hover:text-aria-text'
                  }`}
                >
                  {p === 'anthropic' ? 'Anthropic (Claude)' : 'LM Studio'}
                </button>
              ))}
            </div>
          </div>

          {/* Anthropic 設定 */}
          {settings.provider === 'anthropic' && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-aria-text">APIキー</label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => updateSetting('apiKey', e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-aria-text">モデル</label>
                <select
                  value={settings.model}
                  onChange={(e) => updateSetting('model', e.target.value)}
                  className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text focus:outline-none focus:border-aria-primary"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5</option>
                </select>
              </div>
            </>
          )}

          {/* LM Studio 設定 */}
          {settings.provider === 'lmstudio' && (
            <>
              {/* サーバーURL */}
              <div className="space-y-2">
                <label className="text-sm text-aria-text">サーバーURL</label>
                <input
                  type="text"
                  value={settings.lmstudioBaseUrl}
                  onChange={(e) => updateSetting('lmstudioBaseUrl', e.target.value)}
                  placeholder="http://127.0.0.1:1234/v1"
                  className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                />
                <p className="text-xs text-aria-text-muted">
                  LM Studio のサーバーを起動してから「モデルを取得」してください。
                </p>
              </div>

              {/* モデル選択 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-aria-text">モデル</label>
                  <button
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs bg-aria-surface border border-aria-border rounded-lg hover:border-aria-primary text-aria-text-muted hover:text-aria-text transition-colors disabled:opacity-50"
                  >
                    {isFetchingModels ? (
                      <>
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        取得中...
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        モデルを取得
                      </>
                    )}
                  </button>
                </div>

                {fetchError && (
                  <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{fetchError}</p>
                )}

                {lmsModels.length > 0 ? (
                  <select
                    value={settings.lmstudioModel}
                    onChange={async (e) => {
                      await updateSetting('lmstudioModel', e.target.value);
                      // 選択モデルのロード済みコンテキスト長があればスライダーに反映
                      const m = lmsModels.find((m) => m.id === e.target.value);
                      if (m?.loadedContextLength) {
                        await updateSetting('lmstudioContextLength', m.loadedContextLength);
                      }
                    }}
                    className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text focus:outline-none focus:border-aria-primary"
                  >
                    {lmsModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName || m.id}
                        {(m.state === 'loaded' || m.state === 'running') ? ' ✓ロード済み' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.lmstudioModel}
                    onChange={(e) => updateSetting('lmstudioModel', e.target.value)}
                    placeholder="「モデルを取得」でリストを取得、または直接入力"
                    className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                  />
                )}
              </div>

              {/* コンテキスト長スライダー */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-aria-text">コンテキスト長</label>
                  <span className="text-xs font-mono text-aria-primary">
                    {(settings.lmstudioContextLength ?? 4096).toLocaleString()} tokens
                  </span>
                </div>
                <input
                  type="range"
                  min={512}
                  max={maxContext}
                  step={512}
                  value={Math.min(settings.lmstudioContextLength ?? 4096, maxContext)}
                  onChange={(e) => updateSetting('lmstudioContextLength', Number(e.target.value))}
                  className="w-full accent-aria-primary"
                />
                <div className="flex justify-between text-xs text-aria-text-muted">
                  <span>512</span>
                  <span>最大: {maxContext.toLocaleString()}</span>
                </div>
              </div>

              {/* モデルをロードボタン */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleLoadModel}
                  disabled={isLoadingModel || !settings.lmstudioModel}
                  className="flex items-center gap-2 px-4 py-2 bg-aria-primary text-white text-sm rounded-lg hover:bg-aria-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoadingModel ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ロード中...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      モデルをロード
                    </>
                  )}
                </button>
                {loadStatus && (
                  <span className={`text-xs whitespace-pre-line ${loadStatus.startsWith('エラー') ? 'text-red-400' : loadStatus === 'ロード完了！' ? 'text-emerald-400' : 'text-aria-text-muted'}`}>
                    {loadStatus}
                  </span>
                )}
                {(selectedModel?.state === 'loaded' || selectedModel?.state === 'running') && !loadStatus && (
                  <span className="text-xs text-emerald-400">✓ ロード済み</span>
                )}
              </div>
            </>
          )}

          {/* システムプロンプト（共通） */}
          <div className="space-y-2">
            <label className="text-sm text-aria-text">システムプロンプト</label>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => updateSetting('systemPrompt', e.target.value)}
              rows={4}
              className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text resize-none focus:outline-none focus:border-aria-primary"
            />
          </div>
        </section>

        {/* === アイコン・外観 === */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">アイコン・外観</h2>

          {/* アプリアイコン */}
          <div className="flex items-center justify-between p-3 bg-aria-surface rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aria-primary/20 flex items-center justify-center overflow-hidden">
                {settings.customIconPath ? (
                  <img src={`file://${settings.customIconPath}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-aria-primary">A</span>
                )}
              </div>
              <div>
                <p className="text-sm text-aria-text">アプリアイコン</p>
                <p className="text-xs text-aria-text-muted">
                  {settings.customIconPath ? 'カスタム設定中' : 'デフォルト'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleIconSelect('app')}
                className="px-3 py-1.5 text-xs bg-aria-primary/20 text-aria-primary rounded-lg hover:bg-aria-primary/30 transition-colors"
              >
                変更
              </button>
              {settings.customIconPath && (
                <button
                  onClick={() => handleIconReset('app')}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  リセット
                </button>
              )}
            </div>
          </div>

          {/* トレイアイコン */}
          <div className="flex items-center justify-between p-3 bg-aria-surface rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aria-bg flex items-center justify-center overflow-hidden">
                {settings.customTrayIconPath ? (
                  <img src={`file://${settings.customTrayIconPath}`} alt="" className="w-6 h-6 object-cover" />
                ) : (
                  <span className="text-sm font-bold text-aria-primary">T</span>
                )}
              </div>
              <div>
                <p className="text-sm text-aria-text">トレイアイコン</p>
                <p className="text-xs text-aria-text-muted">
                  {settings.customTrayIconPath ? 'カスタム設定中' : 'デフォルト'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleIconSelect('tray')}
                className="px-3 py-1.5 text-xs bg-aria-primary/20 text-aria-primary rounded-lg hover:bg-aria-primary/30 transition-colors"
              >
                変更
              </button>
              {settings.customTrayIconPath && (
                <button
                  onClick={() => handleIconReset('tray')}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  リセット
                </button>
              )}
            </div>
          </div>

          {/* AIアバター */}
          <div className="flex items-center justify-between p-3 bg-aria-surface rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-aria-primary/20 flex items-center justify-center overflow-hidden">
                {settings.customAvatarPath ? (
                  <img src={`file://${settings.customAvatarPath}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-aria-primary">A</span>
                )}
              </div>
              <div>
                <p className="text-sm text-aria-text">AIアバター</p>
                <p className="text-xs text-aria-text-muted">
                  {settings.customAvatarPath ? 'カスタム設定中' : 'デフォルト'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleIconSelect('avatar')}
                className="px-3 py-1.5 text-xs bg-aria-primary/20 text-aria-primary rounded-lg hover:bg-aria-primary/30 transition-colors"
              >
                変更
              </button>
              {settings.customAvatarPath && (
                <button
                  onClick={() => handleIconReset('avatar')}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                  リセット
                </button>
              )}
            </div>
          </div>

          {/* テーマカラー */}
          <div className="space-y-2">
            <label className="text-sm text-aria-text">テーマカラー</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => {
                  document.documentElement.style.setProperty('--aria-primary', e.target.value);
                  updateSetting('accentColor', e.target.value);
                }}
                className="w-10 h-10 rounded-lg border border-aria-border cursor-pointer bg-transparent"
              />
              <div className="flex gap-2">
                {['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'].map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      document.documentElement.style.setProperty('--aria-primary', color);
                      updateSetting('accentColor', color);
                    }}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      settings.accentColor === color ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* === 動作設定 === */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">動作設定</h2>

          <div className="space-y-2">
            <label className="text-sm text-aria-text">グローバルホットキー</label>
            <input
              type="text"
              value={settings.hotkey}
              onChange={(e) => updateSetting('hotkey', e.target.value)}
              className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text focus:outline-none focus:border-aria-primary"
            />
            <p className="text-xs text-aria-text-muted">例: CommandOrControl+Shift+A</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-aria-text">常に最前面に表示</p>
              <p className="text-xs text-aria-text-muted">ウィンドウを常に他のウィンドウの上に表示</p>
            </div>
            <button
              onClick={() => updateSetting('alwaysOnTop', !settings.alwaysOnTop)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.alwaysOnTop ? 'bg-aria-primary' : 'bg-aria-border'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                settings.alwaysOnTop ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-aria-text">OS起動時に自動起動</p>
              <p className="text-xs text-aria-text-muted">PCを起動した時に自動的にARIAを起動</p>
            </div>
            <button
              onClick={() => updateSetting('launchAtStartup', !settings.launchAtStartup)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.launchAtStartup ? 'bg-aria-primary' : 'bg-aria-border'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                settings.launchAtStartup ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </section>

        {/* === MCP サーバー設定 === */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">MCP サーバー</h2>
            <div className="flex items-center gap-2">
              {mcpSaveMsg && (
                <span className={`text-xs ${mcpSaveMsg.startsWith('エラー') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {mcpSaveMsg}
                </span>
              )}
              <button
                onClick={handleReconnectMCP}
                disabled={isSavingMCP}
                title="再接続"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-aria-surface border border-aria-border rounded-lg hover:border-aria-primary text-aria-text-muted hover:text-aria-text transition-colors disabled:opacity-50"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                再接続
              </button>
              <button
                onClick={handleSaveMCP}
                disabled={isSavingMCP}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-aria-primary text-white rounded-lg hover:bg-aria-primary/80 transition-colors disabled:opacity-50"
              >
                {isSavingMCP ? (
                  <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                ) : '保存'}
              </button>
            </div>
          </div>

          <p className="text-xs text-aria-text-muted">
            登録した MCP サーバーのツールを LM Studio (LLM) が利用できます。Claude では使用されません。
          </p>

          {/* サーバー一覧 */}
          {mcpConfig.servers.length === 0 && !showAddServer && (
            <p className="text-xs text-aria-text-muted bg-aria-surface rounded-lg px-3 py-3 text-center">
              MCP サーバーが未登録です
            </p>
          )}

          <div className="space-y-2">
            {mcpConfig.servers.map((server, idx) => {
              const st = mcpStatus.find((s) => s.name === server.name);
              return (
                <div key={idx} className="bg-aria-surface rounded-xl px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    {/* ステータスドット */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      !server.enabled ? 'bg-aria-border' :
                      st?.status === 'connected' ? 'bg-emerald-400' :
                      st?.status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
                    }`} />
                    {/* 名前 + タイプバッジ */}
                    <span className="text-sm text-aria-text font-medium flex-1 truncate">{server.name}</span>
                    <span className="text-xs text-aria-text-muted bg-aria-bg rounded px-1.5 py-0.5">{server.type}</span>
                    {st?.status === 'connected' && (
                      <span className="text-xs text-emerald-400">{st.toolCount}ツール</span>
                    )}
                    {/* 有効トグル */}
                    <button
                      onClick={() => handleToggleServer(idx)}
                      className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${server.enabled ? 'bg-aria-primary' : 'bg-aria-border'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${server.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    {/* 編集・削除 */}
                    <button onClick={() => openEditForm(idx)} className="text-xs text-aria-text-muted hover:text-aria-text px-1">✎</button>
                    <button onClick={() => handleDeleteServer(idx)} className="text-xs text-red-400 hover:text-red-300 px-1">✕</button>
                  </div>
                  {/* 接続エラー表示 */}
                  {st?.status === 'error' && (
                    <p className="text-xs text-red-400 pl-4 truncate">{st.error}</p>
                  )}
                  {/* 接続情報プレビュー */}
                  <p className="text-xs text-aria-text-muted pl-4 truncate">
                    {server.type === 'stdio'
                      ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}`
                      : server.url ?? ''}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 追加フォーム */}
          {showAddServer ? (
            <div className="bg-aria-surface border border-aria-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-aria-text">
                {editingIndex !== null ? 'サーバーを編集' : '新しいサーバーを追加'}
              </p>

              {/* 名前 */}
              <div className="space-y-1">
                <label className="text-xs text-aria-text-muted">サーバー名（一意のキー）</label>
                <input
                  type="text"
                  value={serverForm.name}
                  onChange={(e) => setServerForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="例: filesystem"
                  className="w-full bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                />
              </div>

              {/* タイプ */}
              <div className="space-y-1">
                <label className="text-xs text-aria-text-muted">接続タイプ</label>
                <div className="flex gap-2">
                  {(['stdio', 'http', 'streamable-http'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setServerForm((f) => ({ ...f, type: t }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        serverForm.type === t ? 'bg-aria-primary text-white' : 'bg-aria-bg text-aria-text-muted hover:text-aria-text border border-aria-border'
                      }`}
                    >
                      {t === 'stdio' ? 'stdio' : t === 'http' ? 'SSE' : 'Streamable HTTP'}
                    </button>
                  ))}
                </div>
              </div>

              {/* stdio 設定 */}
              {serverForm.type === 'stdio' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-aria-text-muted">コマンド</label>
                    <input
                      type="text"
                      value={serverForm.command ?? ''}
                      onChange={(e) => setServerForm((f) => ({ ...f, command: e.target.value }))}
                      placeholder="例: npx"
                      className="w-full bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-aria-text-muted">引数（1行に1つ）</label>
                    <textarea
                      value={formArgsText}
                      onChange={(e) => setFormArgsText(e.target.value)}
                      rows={3}
                      placeholder={"-y\n@modelcontextprotocol/server-filesystem\nC:/Users/takep"}
                      className="w-full bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none focus:border-aria-primary font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-aria-text-muted">環境変数（KEY=VALUE, 1行に1つ）</label>
                    <textarea
                      value={formEnvText}
                      onChange={(e) => setFormEnvText(e.target.value)}
                      rows={2}
                      placeholder="GITHUB_TOKEN=ghp_xxx"
                      className="w-full bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none focus:border-aria-primary font-mono"
                    />
                  </div>
                </>
              )}

              {/* HTTP / Streamable HTTP 設定 */}
              {(serverForm.type === 'http' || serverForm.type === 'streamable-http') && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-aria-text-muted">URL</label>
                    <input
                      type="text"
                      value={serverForm.url ?? ''}
                      onChange={(e) => setServerForm((f) => ({ ...f, url: e.target.value }))}
                      placeholder="例: http://localhost:3000/mcp"
                      className="w-full bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-aria-text-muted">ヘッダー（KEY: VALUE, 1行に1つ）</label>
                    <textarea
                      value={formHeadersText}
                      onChange={(e) => setFormHeadersText(e.target.value)}
                      rows={2}
                      placeholder="Authorization: Bearer your-token-here"
                      className="w-full bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none focus:border-aria-primary font-mono"
                    />
                  </div>
                </>
              )}

              {/* 有効チェック */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="srv-enabled"
                  checked={serverForm.enabled}
                  onChange={(e) => setServerForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="accent-aria-primary"
                />
                <label htmlFor="srv-enabled" className="text-xs text-aria-text-muted">起動時に接続する</label>
              </div>

              {/* フォームボタン */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveServer}
                  disabled={!serverForm.name.trim()}
                  className="flex-1 py-1.5 text-xs bg-aria-primary text-white rounded-lg hover:bg-aria-primary/80 transition-colors disabled:opacity-40"
                >
                  {editingIndex !== null ? '更新' : '追加'}
                </button>
                <button
                  onClick={cancelForm}
                  className="flex-1 py-1.5 text-xs bg-aria-bg border border-aria-border text-aria-text-muted rounded-lg hover:text-aria-text transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={openAddForm}
              className="w-full py-2 text-xs border border-dashed border-aria-border rounded-xl text-aria-text-muted hover:border-aria-primary hover:text-aria-text transition-colors"
            >
              ＋ サーバーを追加
            </button>
          )}
        </section>

        {/* バージョン情報 */}
        <div className="text-center pb-6">
          <p className="text-xs text-aria-text-muted">ARIA v1.0.0 — AI Responsive Interactive Assistant</p>
        </div>
      </div>
    </div>
  );
}
