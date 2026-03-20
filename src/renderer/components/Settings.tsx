import React, { useState, useEffect, useCallback } from 'react';
import { ArsChatSettings, DEFAULT_SETTINGS, LMStudioModelInfo, MCPConfig, MCPServerConfig, MCPServerStatus, Persona, Skill } from '../../shared/types';

/** ローカルファイルパスをカスタムスキームの URL に変換する（Windows / http:localhost 対応） */
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const p = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `arschat-file://${p}`;
}

// ===== スキル共通コンポーネント =====

interface SkillFormState { name: string; description: string; trigger: string; scriptType: string; scriptValue: string; body: string; }

function SkillRow({ skill, onEdit, onOpenEditor, onDelete }: { skill: Skill; onEdit: () => void; onOpenEditor: () => void; onDelete: () => void; }) {
  return (
    <div className="flex items-start gap-2 p-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-aria-text">{skill.name}</span>
          {skill.source === 'ai' && (
            <span className="text-xs text-violet-400 bg-violet-500/10 px-1 rounded">AI</span>
          )}
          {skill.trigger && (
            <span className="text-xs font-mono text-aria-primary bg-aria-primary/10 px-1 rounded">{skill.trigger}</span>
          )}
          {skill.script && (
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1 rounded">{skill.script.type}</span>
          )}
        </div>
        <p className="text-xs text-aria-text-muted truncate mt-0.5">{skill.description}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-aria-text-muted hover:text-aria-primary hover:bg-aria-primary/10 transition-colors" title="アプリ内で編集">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          編集
        </button>
        <button onClick={onOpenEditor} className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text hover:bg-white/10 transition-colors" title="外部エディタで開く">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M10 2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6M10 2l4 4M10 2v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={onDelete} className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors" title="削除">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6 4.5V3h4v1.5M5.5 4.5l.5 8h4l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
}

function SkillEditFormPanel({ form, onChange, onSave, onCancel, isSaving }: {
  form: SkillFormState;
  onChange: (f: SkillFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const set = (k: keyof SkillFormState, v: string) => onChange({ ...form, [k]: v });
  return (
    <div className="p-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-aria-text-muted">名前</label>
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
            className="w-full bg-aria-surface border border-aria-border rounded-lg px-2 py-1.5 text-xs text-aria-text focus:outline-none focus:border-aria-primary" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-aria-text-muted">トリガー（例: /skill）</label>
          <input type="text" value={form.trigger} onChange={(e) => set('trigger', e.target.value)} placeholder="/skill-name"
            className="w-full bg-aria-surface border border-aria-border rounded-lg px-2 py-1.5 text-xs text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-aria-text-muted">概要</label>
        <input type="text" value={form.description} onChange={(e) => set('description', e.target.value)}
          className="w-full bg-aria-surface border border-aria-border rounded-lg px-2 py-1.5 text-xs text-aria-text focus:outline-none focus:border-aria-primary" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-aria-text-muted">スクリプト種別</label>
          <select value={form.scriptType} onChange={(e) => set('scriptType', e.target.value)}
            className="w-full bg-aria-surface border border-aria-border rounded-lg px-2 py-1.5 text-xs text-aria-text focus:outline-none focus:border-aria-primary">
            <option value="">なし</option>
            <option value="command">command</option>
            <option value="file">file</option>
            <option value="url">url</option>
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs text-aria-text-muted">スクリプト値</label>
          <input type="text" value={form.scriptValue} onChange={(e) => set('scriptValue', e.target.value)} placeholder="コマンド / ファイルパス / URL"
            disabled={!form.scriptType}
            className="w-full bg-aria-surface border border-aria-border rounded-lg px-2 py-1.5 text-xs text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary disabled:opacity-50" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-aria-text-muted">詳細内容（AIへの指示、Markdown）</label>
        <textarea value={form.body} onChange={(e) => set('body', e.target.value)} rows={6}
          className="w-full bg-aria-surface border border-aria-border rounded-lg px-2 py-1.5 text-xs text-aria-text font-mono resize-y focus:outline-none focus:border-aria-primary" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs border border-aria-border text-aria-text-muted rounded-lg hover:text-aria-text transition-colors">キャンセル</button>
        <button onClick={onSave} disabled={isSaving || !form.name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-aria-primary text-white rounded-lg hover:bg-aria-primary/80 disabled:opacity-50 transition-colors">
          {isSaving ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : null}
          保存
        </button>
      </div>
    </div>
  );
}

import type { LoadedExtension } from '../extension-loader';

interface SettingsProps {
  onBack: () => void;
  extensions?: LoadedExtension[];
}

export default function Settings({ onBack, extensions = [] }: SettingsProps) {
  const [settings, setSettings] = useState<ArsChatSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  // LM Studio モデル関連
  const [lmsModels, setLmsModels] = useState<LMStudioModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);

  // 人格（ペルソナ）関連
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const emptyPersona = (): Omit<Persona, 'id'> => ({ name: '', systemPrompt: '', avatarPath: null, allowAIEditUserSkills: false });
  const [personaForm, setPersonaForm] = useState<Omit<Persona, 'id'>>(emptyPersona());

  // スキル管理関連
  const [skillsPersonaId, setSkillsPersonaId] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  // インライン編集
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  interface SkillEditForm { name: string; description: string; trigger: string; scriptType: string; scriptValue: string; body: string; }
  const emptySkillForm = (): SkillEditForm => ({ name: '', description: '', trigger: '', scriptType: '', scriptValue: '', body: '' });
  const [skillForm, setSkillForm] = useState<SkillEditForm>(emptySkillForm());
  const [isSavingSkill, setIsSavingSkill] = useState(false);

  // メモリ管理関連
  const [memory, setMemory] = useState<string>('');
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [memoryPersonaId, setMemoryPersonaId] = useState<string | null>(null);

  // 拡張機能関連
  const [extInstallUrl, setExtInstallUrl] = useState('');
  const [extInstalling, setExtInstalling] = useState(false);
  const [extInstallMsg, setExtInstallMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [extList, setExtList] = useState<any[]>([]);

  const loadExtList = async () => {
    const list = await window.arsChatAPI.extensions.list();
    setExtList(list);
  };

  const handleExtInstall = async () => {
    if (!extInstallUrl.trim()) return;
    setExtInstalling(true);
    setExtInstallMsg(null);
    const result = await window.arsChatAPI.extensions.install(extInstallUrl.trim());
    setExtInstalling(false);
    if (result.success) {
      setExtInstallMsg({ type: 'success', text: `"${result.entry.id}" をインストールしました` });
      setExtInstallUrl('');
      loadExtList();
    } else {
      setExtInstallMsg({ type: 'error', text: result.error ?? 'インストールに失敗しました' });
    }
  };

  const handleExtToggle = async (extId: string, enabled: boolean) => {
    await window.arsChatAPI.extensions.toggle(extId, enabled);
    loadExtList();
  };

  const handleExtUninstall = async (extId: string) => {
    if (!confirm(`拡張機能 "${extId}" をアンインストールしますか？`)) return;
    await window.arsChatAPI.extensions.uninstall(extId);
    loadExtList();
  };

  const handleExtUpdate = async (extId: string) => {
    await window.arsChatAPI.extensions.update(extId);
    loadExtList();
    setExtInstallMsg({ type: 'success', text: `"${extId}" を更新しました` });
  };

  // MCP 関連
  const [mcpConfig, setMcpConfig] = useState<MCPConfig>({ servers: [] });
  const [mcpStatus, setMcpStatus] = useState<MCPServerStatus[]>([]);
  const [isSavingMCP, setIsSavingMCP] = useState(false);
  const [mcpSaveMsg, setMcpSaveMsg] = useState<string | null>(null);
  const [generatingDescFor, setGeneratingDescFor] = useState<string | null>(null); // 説明生成中のサーバー名
  // 新規追加フォームの表示制御
  const [showAddServer, setShowAddServer] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // フォームの状態
  const emptyForm = (): MCPServerConfig => ({
    name: '', description: '', type: 'stdio', command: '', args: [], env: {}, url: '', headers: {}, enabled: true,
  });
  const [serverForm, setServerForm] = useState<MCPServerConfig>(emptyForm());
  const [formArgsText, setFormArgsText] = useState('');
  const [formEnvText, setFormEnvText] = useState('');
  const [formHeadersText, setFormHeadersText] = useState('');

  useEffect(() => {
    window.arsChatAPI.getSettings().then(setSettings);
    // MCP 設定と状態を取得
    window.arsChatAPI.getMCPConfig().then(setMcpConfig);
    window.arsChatAPI.getMCPStatus().then(setMcpStatus);
    // 拡張機能一覧を取得
    loadExtList();
  }, []);

  const selectedModel = lmsModels.find((m) => m.id === settings.lmstudioModel);
  const maxContext = selectedModel?.maxContextLength ?? 32768;

  const handleFetchModels = useCallback(async () => {
    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const models = await window.arsChatAPI.listLMStudioModels();
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
      await window.arsChatAPI.loadLMStudioModel(settings.lmstudioModel, settings.lmstudioContextLength);
      setLoadStatus('ロード完了！');
      // 状態を更新するためにモデル一覧を再取得
      const models = await window.arsChatAPI.listLMStudioModels();
      setLmsModels(models);
      setTimeout(() => setLoadStatus(null), 3000);
    } catch (err: any) {
      setLoadStatus(`エラー: ${err?.message ?? 'ロードに失敗しました'}`);
      setTimeout(() => setLoadStatus(null), 5000);
    } finally {
      setIsLoadingModel(false);
    }
  }, [settings.lmstudioModel, settings.lmstudioContextLength]);

  const updateSetting = async <K extends keyof ArsChatSettings>(key: K, value: ArsChatSettings[K]) => {
    const updated = await window.arsChatAPI.setSettings({ [key]: value });
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleIconSelect = async (target: 'app' | 'tray' | 'avatar') => {
    const path = await window.arsChatAPI.selectIcon(target);
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
      const status = await window.arsChatAPI.saveMCPConfig(newConfig);
      setMcpStatus(status);
    } catch (err: any) {
      console.error('MCP toggle save error:', err?.message);
    }
  };

  const handleSaveMCP = useCallback(async () => {
    setIsSavingMCP(true);
    setMcpSaveMsg(null);
    try {
      const status = await window.arsChatAPI.saveMCPConfig(mcpConfig);
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
      const status = await window.arsChatAPI.reconnectMCP();
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

  // ===== 人格（ペルソナ）ハンドラー =====

  const openAddPersonaForm = () => {
    setPersonaForm(emptyPersona());
    setEditingPersonaId(null);
    setShowPersonaForm(true);
  };

  const openEditPersonaForm = (persona: Persona) => {
    setPersonaForm({ name: persona.name, systemPrompt: persona.systemPrompt, avatarPath: persona.avatarPath, allowAIEditUserSkills: persona.allowAIEditUserSkills ?? false });
    setEditingPersonaId(persona.id);
    setShowPersonaForm(true);
  };

  const cancelPersonaForm = () => {
    setShowPersonaForm(false);
    setEditingPersonaId(null);
  };

  const handleSavePersona = () => {
    if (!personaForm.name.trim()) return;
    const personas = [...(settings.personas ?? [])];
    if (editingPersonaId) {
      const idx = personas.findIndex((p) => p.id === editingPersonaId);
      if (idx >= 0) personas[idx] = { ...personas[idx], ...personaForm };
    } else {
      personas.push({ id: crypto.randomUUID(), ...personaForm });
    }
    setShowPersonaForm(false);
    setEditingPersonaId(null);
    updateSetting('personas', personas);
  };

  const handleDeletePersona = (id: string) => {
    const personas = (settings.personas ?? []).filter((p) => p.id !== id);
    updateSetting('personas', personas);
    // 削除した人格がアクティブだった場合はリセット
    if (settings.activePersonaId === id) {
      updateSetting('activePersonaId', null);
    }
  };

  const handleActivatePersona = (id: string | null) => {
    updateSetting('activePersonaId', id);
  };

  const handlePersonaIconSelect = async (personaId: string) => {
    const path = await window.arsChatAPI.selectPersonaIcon(personaId);
    if (path) {
      setPersonaForm((prev) => ({ ...prev, avatarPath: path }));
    }
  };

  // ===== スキルハンドラー =====

  const openSkillsPanel = useCallback(async (personaId: string) => {
    if (skillsPersonaId === personaId) {
      setSkillsPersonaId(null);
      return;
    }
    setSkillsPersonaId(personaId);
    setIsLoadingSkills(true);
    try {
      const list = await window.arsChatAPI.listSkills(personaId);
      setSkills(list);
    } finally {
      setIsLoadingSkills(false);
    }
  }, [skillsPersonaId]);

  const openEditSkillForm = async (personaId: string, skill: Skill) => {
    const body = await window.arsChatAPI.getSkillContent(personaId, skill.id) ?? '';
    setSkillForm({
      name: skill.name,
      description: skill.description,
      trigger: skill.trigger ?? '',
      scriptType: skill.script?.type ?? '',
      scriptValue: skill.script?.value ?? '',
      body,
    });
    setEditingSkillId(skill.id);
  };

  const handleSaveSkill = async (personaId: string) => {
    if (!editingSkillId) return;
    setIsSavingSkill(true);
    try {
      const updated = await window.arsChatAPI.saveSkill(personaId, editingSkillId, {
        name: skillForm.name,
        description: skillForm.description,
        trigger: skillForm.trigger || undefined,
        scriptType: skillForm.scriptType || undefined,
        scriptValue: skillForm.scriptValue || undefined,
        body: skillForm.body,
      });
      if (updated) {
        setSkills((prev) => prev.map((s) => s.id === editingSkillId ? updated : s));
      }
      setEditingSkillId(null);
    } finally {
      setIsSavingSkill(false);
    }
  };

  const handleCreateSkill = async (personaId: string) => {
    await window.arsChatAPI.createSkill(personaId);
    // 少し待ってリロード（エディタで開いた後にファイルが作成される）
    setTimeout(async () => {
      const list = await window.arsChatAPI.listSkills(personaId);
      setSkills(list);
    }, 500);
  };

  const handleDeleteSkill = async (personaId: string, skillId: string) => {
    await window.arsChatAPI.deleteSkill(personaId, skillId);
    setSkills((prev) => prev.filter((s) => s.id !== skillId));
  };

  const handleRefreshSkills = async (personaId: string) => {
    setIsLoadingSkills(true);
    try {
      const list = await window.arsChatAPI.listSkills(personaId);
      setSkills(list);
    } finally {
      setIsLoadingSkills(false);
    }
  };

  // ===== メモリハンドラー =====

  const openMemoryPanel = useCallback(async (personaId: string) => {
    if (memoryPersonaId === personaId) {
      setMemoryPersonaId(null);
      return;
    }
    setMemoryPersonaId(personaId);
    setIsLoadingMemory(true);
    try {
      const content = await window.arsChatAPI.getMemory(personaId);
      setMemory(content ?? '');
    } finally {
      setIsLoadingMemory(false);
    }
  }, [memoryPersonaId]);

  const handleSaveMemory = async () => {
    if (!memoryPersonaId) return;
    setIsSavingMemory(true);
    try {
      await window.arsChatAPI.setMemory(memoryPersonaId, memory);
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleClearMemory = async () => {
    if (!memoryPersonaId) return;
    if (!confirm('このペルソナのメモリをクリアしますか？')) return;
    await window.arsChatAPI.clearMemory(memoryPersonaId);
    setMemory('');
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

          {/* システムプロンプト（共通・人格未選択時） */}
          <div className="space-y-2">
            <label className="text-sm text-aria-text">
              システムプロンプト
              {settings.activePersonaId && (
                <span className="ml-2 text-xs text-aria-primary">（人格選択中 — 人格のプロンプトが優先されます）</span>
              )}
            </label>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => updateSetting('systemPrompt', e.target.value)}
              rows={4}
              className="w-full bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text resize-none focus:outline-none focus:border-aria-primary"
            />
          </div>
        </section>

        {/* === 人格（ペルソナ） === */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">人格 (ペルソナ)</h2>

          {/* 人格なし（カスタム）オプション */}
          <div
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
              !settings.activePersonaId
                ? 'bg-aria-primary/15 border border-aria-primary/40'
                : 'bg-aria-surface border border-transparent hover:border-aria-border'
            }`}
            onClick={() => handleActivatePersona(null)}
          >
            <div className="shrink-0 w-10 h-10 rounded-full bg-aria-bg flex items-center justify-center text-lg font-bold text-aria-primary">
              ?
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-aria-text font-medium">カスタム（人格なし）</p>
              <p className="text-xs text-aria-text-muted truncate">上記のシステムプロンプトを使用</p>
            </div>
            {!settings.activePersonaId && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-aria-primary">
                <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>

          {/* 人格リスト */}
          {(settings.personas ?? []).map((persona) => (
            <div key={persona.id} className="space-y-0">
              <div
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                  skillsPersonaId === persona.id
                    ? 'rounded-b-none border-b-0'
                    : ''
                } ${
                  settings.activePersonaId === persona.id
                    ? 'bg-aria-primary/15 border border-aria-primary/40'
                    : 'bg-aria-surface border border-transparent hover:border-aria-border'
                }`}
                onClick={() => handleActivatePersona(persona.id)}
              >
                <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden bg-aria-primary/20 flex items-center justify-center">
                  {persona.avatarPath ? (
                    <img src={toFileUrl(persona.avatarPath)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-aria-primary">
                      {persona.name.charAt(0).toUpperCase() || 'P'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-aria-text font-medium">{persona.name}</p>
                  <p className="text-xs text-aria-text-muted truncate">{persona.systemPrompt}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {settings.activePersonaId === persona.id && (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mr-1 text-aria-primary">
                      <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {/* スキル管理ボタン */}
                  <button
                    onClick={() => openSkillsPanel(persona.id)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                      skillsPersonaId === persona.id
                        ? 'text-aria-primary bg-aria-primary/20'
                        : 'text-aria-text-muted hover:text-aria-primary hover:bg-aria-primary/10'
                    }`}
                    title="スキルを管理"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1l1.9 3.8L14 5.8l-3 2.9.7 4.1L8 10.8l-3.7 1.9.7-4.1L2 5.8l4.1-.9L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    スキル
                  </button>
                  <button
                    onClick={() => openEditPersonaForm(persona)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-aria-text-muted hover:text-aria-text hover:bg-white/10 transition-colors"
                    title="編集"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeletePersona(persona.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-aria-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="削除"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 4.5h10M6 4.5V3h4v1.5M5.5 4.5l.5 8h4l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* スキルパネル（展開時） */}
              {skillsPersonaId === persona.id && (
                <div className="bg-aria-surface border border-t-0 border-aria-border rounded-b-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">スキル</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRefreshSkills(persona.id)}
                        className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text transition-colors"
                        title="更新"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => window.arsChatAPI.openSkillsFolder(persona.id)}
                        className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text transition-colors"
                        title="フォルダを開く"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <path d="M2 4.5C2 3.7 2.7 3 3.5 3H7l1.5 2H12.5C13.3 5 14 5.7 14 6.5v6c0 .8-.7 1.5-1.5 1.5h-9C2.7 14 2 13.3 2 12.5v-8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleCreateSkill(persona.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-aria-primary/20 text-aria-primary rounded hover:bg-aria-primary/30 transition-colors"
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        新規作成
                      </button>
                    </div>
                  </div>

                  {isLoadingSkills ? (
                    <div className="flex items-center gap-2 py-2 text-xs text-aria-text-muted">
                      <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      読み込み中...
                    </div>
                  ) : skills.length === 0 ? (
                    <p className="text-xs text-aria-text-muted py-2">
                      スキルがありません。「新規作成」でテンプレートを生成してください。
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {skills.map((skill) => (
                        <div key={skill.id} className="bg-aria-bg rounded-lg overflow-hidden">
                          {editingSkillId === skill.id ? (
                            <SkillEditFormPanel
                              form={skillForm}
                              onChange={setSkillForm}
                              onSave={() => handleSaveSkill(persona.id)}
                              onCancel={() => setEditingSkillId(null)}
                              isSaving={isSavingSkill}
                            />
                          ) : (
                            <SkillRow
                              skill={skill}
                              onEdit={() => openEditSkillForm(persona.id, skill)}
                              onOpenEditor={() => window.arsChatAPI.openSkillInEditor(skill.filePath)}
                              onDelete={() => handleDeleteSkill(persona.id, skill.id)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 新規追加ボタン */}
          {!showPersonaForm && (
            <button
              onClick={openAddPersonaForm}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-aria-border text-aria-text-muted hover:text-aria-text hover:border-aria-primary/50 transition-colors text-sm"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              人格を追加
            </button>
          )}

          {/* 人格フォーム */}
          {showPersonaForm && (
            <div className="p-4 bg-aria-surface rounded-xl border border-aria-border space-y-3">
              <h3 className="text-sm font-semibold text-aria-text">
                {editingPersonaId ? '人格を編集' : '新しい人格'}
              </h3>

              {/* アバター選択 */}
              <div className="flex items-center gap-3">
                <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-aria-primary/20 flex items-center justify-center">
                  {personaForm.avatarPath ? (
                    <img src={toFileUrl(personaForm.avatarPath)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-aria-primary">
                      {personaForm.name.charAt(0).toUpperCase() || 'P'}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      const id = editingPersonaId ?? 'new-' + Date.now();
                      handlePersonaIconSelect(id);
                    }}
                    className="px-3 py-1.5 text-xs bg-aria-primary/20 text-aria-primary rounded-lg hover:bg-aria-primary/30 transition-colors"
                  >
                    アイコンを選択
                  </button>
                  {personaForm.avatarPath && (
                    <button
                      onClick={() => setPersonaForm((prev) => ({ ...prev, avatarPath: null }))}
                      className="block px-3 py-1.5 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>

              {/* 名前 */}
              <div className="space-y-1">
                <label className="text-xs text-aria-text-muted">名前</label>
                <input
                  type="text"
                  value={personaForm.name}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="例: 翻訳アシスタント"
                  className="w-full bg-aria-bg-light border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                />
              </div>

              {/* システムプロンプト */}
              <div className="space-y-1">
                <label className="text-xs text-aria-text-muted">システムプロンプト</label>
                <textarea
                  value={personaForm.systemPrompt}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  rows={4}
                  placeholder="例: あなたはプロの翻訳者です..."
                  className="w-full bg-aria-bg-light border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none focus:border-aria-primary"
                />
              </div>

              {/* AI権限設定 */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={personaForm.allowAIEditUserSkills ?? false}
                  onChange={(e) => setPersonaForm((prev) => ({ ...prev, allowAIEditUserSkills: e.target.checked }))}
                  className="mt-0.5 rounded accent-aria-primary"
                />
                <div>
                  <p className="text-xs text-aria-text">AIがユーザースキルを編集できるようにする</p>
                  <p className="text-xs text-aria-text-muted">有効にするとAIがユーザー作成スキルを改良できます（削除は常に不可）</p>
                </div>
              </label>

              {/* ボタン */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelPersonaForm}
                  className="px-3 py-1.5 text-xs rounded-lg border border-aria-border text-aria-text-muted hover:text-aria-text transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSavePersona}
                  disabled={!personaForm.name.trim()}
                  className="px-3 py-1.5 text-xs rounded-lg bg-aria-primary text-white hover:bg-aria-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </section>

        {/* === スキル・メモリ管理 === */}
        {(settings.personas ?? []).length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">スキル・メモリ管理</h2>
              <select
                value={skillsPersonaId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  if (id) {
                    openSkillsPanel(id);
                    openMemoryPanel(id);
                  } else {
                    setSkillsPersonaId(null);
                    setMemoryPersonaId(null);
                  }
                }}
                className="text-xs bg-aria-surface border border-aria-border rounded-lg px-2 py-1 text-aria-text focus:outline-none focus:border-aria-primary"
              >
                <option value="">ペルソナを選択</option>
                {(settings.personas ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {skillsPersonaId ? (() => {
              const activePersona = (settings.personas ?? []).find((p) => p.id === skillsPersonaId);
              const userSkills = skills.filter((s) => s.source === 'user');
              const aiSkills = skills.filter((s) => s.source === 'ai');
              return (
                <div className="space-y-3">
                  {/* ユーザーメモリパネル */}
                  <div className="bg-aria-surface border border-aria-border rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">ユーザーの記憶</span>
                      <div className="flex gap-1">
                        <button
                          onClick={handleSaveMemory}
                          disabled={isSavingMemory}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-aria-primary/20 text-aria-primary rounded hover:bg-aria-primary/30 disabled:opacity-50 transition-colors"
                        >
                          {isSavingMemory ? '保存中...' : '保存'}
                        </button>
                        {memory && (
                          <button
                            onClick={handleClearMemory}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
                          >
                            クリア
                          </button>
                        )}
                      </div>
                    </div>
                    {isLoadingMemory ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-aria-text-muted">
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        読み込み中...
                      </div>
                    ) : (
                      <textarea
                        value={memory}
                        onChange={(e) => setMemory(e.target.value)}
                        rows={5}
                        placeholder={`${activePersona?.name ?? 'ペルソナ'}が覚えているユーザー情報を自由記述で入力...`}
                        className="w-full bg-aria-bg border border-aria-border rounded-lg px-2.5 py-2 text-xs text-aria-text placeholder:text-aria-text-muted resize-none focus:outline-none focus:border-aria-primary"
                      />
                    )}
                    <div className="flex items-start gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="autoExtractMemory"
                        checked={settings.autoExtractMemory ?? false}
                        onChange={(e) => updateSetting('autoExtractMemory', e.target.checked)}
                        className="mt-0.5 rounded accent-aria-primary"
                      />
                      <label htmlFor="autoExtractMemory" className="text-xs text-aria-text-muted cursor-pointer">
                        会話後にAIが自動でメモリを更新する
                      </label>
                    </div>
                  </div>

                  {/* スキルパネル */}
                  <div className="bg-aria-surface border border-aria-border rounded-xl p-3 space-y-3">
                    {/* ヘッダー */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-aria-text-muted uppercase tracking-wider">スキル</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleRefreshSkills(skillsPersonaId)}
                          className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text transition-colors"
                          title="更新"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => window.arsChatAPI.openSkillsFolder(skillsPersonaId)}
                          className="w-6 h-6 flex items-center justify-center rounded text-aria-text-muted hover:text-aria-text transition-colors"
                          title="フォルダを開く"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M2 4.5C2 3.7 2.7 3 3.5 3H7l1.5 2H12.5C13.3 5 14 5.7 14 6.5v6c0 .8-.7 1.5-1.5 1.5h-9C2.7 14 2 13.3 2 12.5v-8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleCreateSkill(skillsPersonaId)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-aria-primary/20 text-aria-primary rounded hover:bg-aria-primary/30 transition-colors"
                        >
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          新規作成
                        </button>
                      </div>
                    </div>

                    {isLoadingSkills ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-aria-text-muted">
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        読み込み中...
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* ユーザースキル */}
                        <div className="space-y-1">
                          <p className="text-xs text-aria-text-muted font-medium">ユーザーのスキル ({userSkills.length})</p>
                          {userSkills.length === 0 ? (
                            <p className="text-xs text-aria-text-muted py-1">スキルがありません。「新規作成」でテンプレートを生成してください。</p>
                          ) : (
                            <div className="space-y-1.5">
                              {userSkills.map((skill) => (
                                <div key={skill.id} className="bg-aria-bg rounded-lg overflow-hidden">
                                  {editingSkillId === skill.id ? (
                                    <SkillEditFormPanel
                                      form={skillForm}
                                      onChange={setSkillForm}
                                      onSave={() => handleSaveSkill(skillsPersonaId)}
                                      onCancel={() => setEditingSkillId(null)}
                                      isSaving={isSavingSkill}
                                    />
                                  ) : (
                                    <SkillRow
                                      skill={skill}
                                      onEdit={() => openEditSkillForm(skillsPersonaId, skill)}
                                      onOpenEditor={() => window.arsChatAPI.openSkillInEditor(skill.filePath)}
                                      onDelete={() => handleDeleteSkill(skillsPersonaId, skill.id)}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* AI スキル */}
                        <div className="space-y-1">
                          <p className="text-xs text-aria-text-muted font-medium">AIのスキル ({aiSkills.length})</p>
                          {aiSkills.length === 0 ? (
                            <p className="text-xs text-aria-text-muted py-1">AIがまだスキルを作成していません。</p>
                          ) : (
                            <div className="space-y-1.5">
                              {aiSkills.map((skill) => (
                                <div key={skill.id} className="bg-aria-bg rounded-lg overflow-hidden">
                                  {editingSkillId === skill.id ? (
                                    <SkillEditFormPanel
                                      form={skillForm}
                                      onChange={setSkillForm}
                                      onSave={() => handleSaveSkill(skillsPersonaId)}
                                      onCancel={() => setEditingSkillId(null)}
                                      isSaving={isSavingSkill}
                                    />
                                  ) : (
                                    <SkillRow
                                      skill={skill}
                                      onEdit={() => openEditSkillForm(skillsPersonaId, skill)}
                                      onOpenEditor={() => window.arsChatAPI.openSkillInEditor(skill.filePath)}
                                      onDelete={() => handleDeleteSkill(skillsPersonaId, skill.id)}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* AI権限設定 */}
                        <div className="border-t border-aria-border pt-2 mt-1">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={activePersona?.allowAIEditUserSkills ?? false}
                              onChange={(e) => {
                                if (!activePersona) return;
                                const personas = (settings.personas ?? []).map((p) =>
                                  p.id === skillsPersonaId ? { ...p, allowAIEditUserSkills: e.target.checked } : p
                                );
                                updateSetting('personas', personas);
                              }}
                              className="mt-0.5 rounded accent-aria-primary"
                            />
                            <div>
                              <p className="text-xs text-aria-text">AIがユーザースキルを編集できるようにする</p>
                              <p className="text-xs text-aria-text-muted">有効にするとAIがユーザー作成スキルを改良できます（削除は常に不可）</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <p className="text-xs text-aria-text-muted bg-aria-surface rounded-xl px-3 py-3 text-center">
                ペルソナを選択してスキル・メモリを管理してください
              </p>
            )}
          </section>
        )}

        {/* === アイコン・外観 === */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">アイコン・外観</h2>

          {/* アプリアイコン */}
          <div className="flex items-center justify-between p-3 bg-aria-surface rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-aria-primary/20 flex items-center justify-center overflow-hidden">
                {settings.customIconPath ? (
                  <img src={toFileUrl(settings.customIconPath!)} alt="" className="w-full h-full object-cover" />
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
                  <img src={toFileUrl(settings.customTrayIconPath!)} alt="" className="w-6 h-6 object-cover" />
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
                  <img src={toFileUrl(settings.customAvatarPath!)} alt="" className="w-full h-full object-cover" />
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

          {/* チャットアイコンサイズ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-aria-text">チャットアイコンサイズ</label>
              <span className="text-sm font-mono text-aria-text-muted">{settings.chatIconSize ?? 32}px</span>
            </div>
            <input
              type="range"
              min={16}
              max={64}
              step={4}
              value={settings.chatIconSize ?? 32}
              onChange={(e) => updateSetting('chatIconSize', Number(e.target.value))}
              className="w-full accent-aria-primary"
            />
            <div className="flex justify-between text-[10px] text-aria-text-muted">
              <span>16px</span>
              <span>64px</span>
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
              <p className="text-xs text-aria-text-muted">PCを起動した時に自動的にArsを起動</p>
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

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-aria-text">インタラクティブAI</p>
              <p className="text-xs text-aria-text-muted">AIがUIコンポーネントやサンドボックスHTMLを生成できるようにする</p>
            </div>
            <button
              onClick={() => updateSetting('enableInteractiveUI', !settings.enableInteractiveUI)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.enableInteractiveUI !== false ? 'bg-aria-primary' : 'bg-aria-border'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                settings.enableInteractiveUI !== false ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* 最大ツール呼び出し回数 */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-aria-text">最大ツール呼び出し回数</p>
              <p className="text-xs text-aria-text-muted">1回の返答で連続してツールを呼び出せる上限。0 で無制限</p>
            </div>
            <input
              type="number"
              min={0}
              max={100}
              value={settings.maxToolRounds ?? 10}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 0) updateSetting('maxToolRounds', v);
              }}
              className="w-20 shrink-0 bg-aria-surface border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text text-center focus:outline-none focus:border-aria-primary"
            />
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

          {/* 省トークン化トグル */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-aria-text">省トークン化（2段階選択）</p>
              <p className="text-xs text-aria-text-muted">全ツール定義の代わりにサーバー名のみ渡し、AIがサーバーを選択してからツール一覧を取得する</p>
            </div>
            <button
              onClick={() => updateSetting('mcpTokenSaving', !settings.mcpTokenSaving)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                settings.mcpTokenSaving ? 'bg-aria-primary' : 'bg-aria-border'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                settings.mcpTokenSaving ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

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

              {/* 説明 */}
              <div className="space-y-1">
                <label className="text-xs text-aria-text-muted">説明（省トークン化モードでAIに渡す概要）</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverForm.description ?? ''}
                    onChange={(e) => setServerForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="例: ローカルファイルシステムの読み書き"
                    className="flex-1 bg-aria-bg border border-aria-border rounded-lg px-3 py-1.5 text-sm text-aria-text placeholder:text-aria-text-muted focus:outline-none focus:border-aria-primary"
                  />
                  <button
                    type="button"
                    title="接続中のサーバーのツール一覧からAIで説明を自動生成"
                    disabled={generatingDescFor === serverForm.name || !serverForm.name.trim()}
                    onClick={async () => {
                      if (!serverForm.name.trim()) return;
                      setGeneratingDescFor(serverForm.name);
                      try {
                        const desc = await window.arsChatAPI.generateMCPDescription(serverForm);
                        if (desc) setServerForm((f) => ({ ...f, description: desc }));
                      } catch (err: any) {
                        console.error('MCP description generation error:', err?.message);
                      } finally {
                        setGeneratingDescFor(null);
                      }
                    }}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs bg-aria-surface border border-aria-border rounded-lg hover:border-aria-primary text-aria-text-muted hover:text-aria-text transition-colors disabled:opacity-50"
                  >
                    {generatingDescFor === serverForm.name ? (
                      <span className="w-3 h-3 border border-aria-text-muted/30 border-t-aria-text-muted rounded-full animate-spin" />
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M3.05 12.95l2.12-2.12M10.83 5.17l2.12-2.12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                    AI生成
                  </button>
                </div>
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

        {/* === 拡張機能 === */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-aria-text-muted uppercase tracking-wider">拡張機能</h2>

          {/* インストール */}
          <div className="space-y-2">
            <label className="text-sm text-aria-text">GitHubリポジトリからインストール</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={extInstallUrl}
                onChange={(e) => setExtInstallUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExtInstall()}
                placeholder="https://github.com/user/arschat-ext-xxx"
                className="flex-1 bg-aria-surface border border-aria-border rounded-lg px-3 py-2 text-sm text-aria-text placeholder-aria-text-muted focus:outline-none focus:border-aria-primary"
                disabled={extInstalling}
              />
              <button
                onClick={handleExtInstall}
                disabled={extInstalling || !extInstallUrl.trim()}
                className="px-4 py-2 text-sm bg-aria-primary text-white rounded-lg hover:bg-aria-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {extInstalling ? '処理中...' : 'インストール'}
              </button>
            </div>
            {extInstallMsg && (
              <p className={`text-xs ${extInstallMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                {extInstallMsg.text}
              </p>
            )}
          </div>

          {/* インストール済み一覧 */}
          {extList.length > 0 ? (
            <div className="space-y-2">
              {extList.map((ext: any) => (
                <div
                  key={ext.id}
                  className="bg-aria-surface border border-aria-border rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg leading-none">{ext.manifest?.icon ?? '🧩'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-aria-text truncate">
                          {ext.manifest?.displayName ?? ext.id}
                        </p>
                        <p className="text-[11px] text-aria-text-muted">
                          v{ext.version} · {ext.id}
                        </p>
                      </div>
                    </div>
                    {/* 有効/無効トグル */}
                    <button
                      onClick={() => handleExtToggle(ext.id, !ext.enabled)}
                      className={`shrink-0 relative w-10 h-5 rounded-full transition-colors ${
                        ext.enabled ? 'bg-aria-primary' : 'bg-aria-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          ext.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 権限バッジ */}
                  {ext.permissions?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ext.permissions.map((p: string) => (
                        <span
                          key={p}
                          className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${
                            p.includes('shell') || p.includes('fs:write') || p.includes('settings:write')
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-aria-surface text-aria-text-muted border border-aria-border'
                          }`}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* アクション */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleExtUpdate(ext.id)}
                      className="text-xs px-2.5 py-1 bg-aria-primary/10 text-aria-primary rounded hover:bg-aria-primary/20 transition-colors"
                    >
                      更新
                    </button>
                    <button
                      onClick={() => handleExtUninstall(ext.id)}
                      className="text-xs px-2.5 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-aria-text-muted py-2">拡張機能はインストールされていません</p>
          )}
        </section>

        {/* バージョン情報 */}
        <div className="text-center pb-6">
          <p className="text-xs text-aria-text-muted">Ars v1.0.0 — AI Responsive Interactive System</p>
        </div>
      </div>
    </div>
  );
}
